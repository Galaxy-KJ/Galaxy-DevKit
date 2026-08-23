import { webcrypto } from 'node:crypto';
import {
  extractPublicKey,
  convertSignatureDERtoCompact,
  WebAuthNProvider,
} from '../providers/WebAuthNProvider';

// jsdom doesn't provide TextEncoder/TextDecoder globally.
if (typeof TextEncoder === 'undefined') {
  (global as any).TextEncoder = require('util').TextEncoder;
}
if (typeof TextDecoder === 'undefined') {
  (global as any).TextDecoder = require('util').TextDecoder;
}

const SPKI_HEX =
  '3049' +
  '3013' +
    '06072a8648ce3d0201' +
    '06082a8648ce3d030107' +
  '0342' +
    '00' +
    '04' +
    '60fed4ba255a9d31c961eb74c6356d68c049b8923b61fa6ce669622e60f29fb6' +
    '7903fe1008b8bc99a41ae9e95628bc64f2f1b20c2d7e9f5177a3c294d4462299';

// The fixed 26-byte SPKI header for an EC P-256 SubjectPublicKeyInfo — everything in
// SPKI_HEX up to (not including) the raw uncompressed point.
const SPKI_HEADER_HEX = SPKI_HEX.slice(0, 52);

const EXPECTED_PUBLIC_KEY_HEX =
  '04' +
  '60fed4ba255a9d31c961eb74c6356d68c049b8923b61fa6ce669622e60f29fb6' +
  '7903fe1008b8bc99a41ae9e95628bc64f2f1b20c2d7e9f5177a3c294d4462299';

const DER_70_HEX =
  '3044' +
  '0220' + '6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296' +
  '0220' + '4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5';

const DER_71_HEX =
  '3045' +
  '0221' + '00' + 'dc17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296' +
  '0220' + '4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5';

const DER_72_HEX =
  '3046' +
  '0221' + '00' + 'dc17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296' +
  '0221' + '00' + 'cfe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5';

const DER_SHORT_R_HEX =
  '3043' +
  '021f' + '17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296' +
  '0220' + '4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5';

function hexToBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.match(/.{2}/g)!.map(h => parseInt(h, 16)));
  return bytes.buffer;
}

function bufferToHex(buf: Uint8Array): string {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function makeRegistrationCredential(spkiHex: string): PublicKeyCredential {
  const spki = hexToBuffer(spkiHex);
  return {
    id: 'mock-credential-id',
    rawId: new ArrayBuffer(16),
    type: 'public-key',
    response: {
      getPublicKey: () => spki,
      attestationObject: new ArrayBuffer(0),
      clientDataJSON: new ArrayBuffer(0),
    } as unknown as AuthenticatorAttestationResponse,
    getClientExtensionResults: () => ({}),
  } as unknown as PublicKeyCredential;
}

function makeAssertionCredential(): PublicKeyCredential {
  return {
    id: 'mock-credential-id',
    rawId: new ArrayBuffer(16),
    type: 'public-key',
    response: {
      authenticatorData: new ArrayBuffer(32),
      clientDataJSON: new ArrayBuffer(32),
      signature: new ArrayBuffer(72),
      userHandle: null,
    } as unknown as AuthenticatorAssertionResponse,
    getClientExtensionResults: () => ({}),
  } as unknown as PublicKeyCredential;
}

// ── Minimal CBOR encoder — the mirror image of the decoder under test, used only
// to build attestationObject/authData/COSE_Key fixtures with real P-256 bytes. ──

function encodeHeader(majorType: number, n: number): Uint8Array {
  if (n < 24) return Uint8Array.of((majorType << 5) | n);
  if (n < 256) return Uint8Array.of((majorType << 5) | 24, n);
  if (n < 65536) {
    const buf = new Uint8Array(3);
    buf[0] = (majorType << 5) | 25;
    new DataView(buf.buffer).setUint16(1, n);
    return buf;
  }
  throw new Error('encodeHeader: fixture value too large');
}

function encodeCBORUint(n: number): Uint8Array {
  return encodeHeader(0, n);
}

function encodeCBORNegInt(v: number): Uint8Array {
  return encodeHeader(1, -1 - v);
}

function encodeCBORByteString(bytes: Uint8Array): Uint8Array {
  return concatBytes(encodeHeader(2, bytes.length), bytes);
}

function encodeCBORTextString(str: string): Uint8Array {
  const bytes = new TextEncoder().encode(str);
  return concatBytes(encodeHeader(3, bytes.length), bytes);
}

function encodeCBORMapHeader(count: number): Uint8Array {
  return encodeHeader(5, count);
}

/** Build a CBOR-encoded COSE_Key for an EC2 key with the given alg/crv/x/y. */
function buildCoseKey(opts: { alg: number; crv?: number; x: Uint8Array; y: Uint8Array }): Uint8Array {
  return concatBytes(
    encodeCBORMapHeader(5),
    encodeCBORUint(1), encodeCBORUint(2), // kty: EC2
    encodeCBORUint(3), encodeCBORNegInt(opts.alg), // alg
    encodeCBORNegInt(-1), encodeCBORUint(opts.crv ?? 1), // crv: P-256
    encodeCBORNegInt(-2), encodeCBORByteString(opts.x), // x
    encodeCBORNegInt(-3), encodeCBORByteString(opts.y), // y
  );
}

/** Build WebAuthn authData bytes wrapping the given CBOR-encoded COSE_Key. */
function buildAuthData(coseKey: Uint8Array, opts: { flags?: number } = {}): Uint8Array {
  const rpIdHash = new Uint8Array(32).fill(0xab);
  const flags = Uint8Array.of(opts.flags ?? 0x45); // UP | UV | AT
  const signCount = Uint8Array.of(0, 0, 0, 1);
  const aaguid = new Uint8Array(16).fill(0);
  const credentialId = new Uint8Array(16).fill(0xcd);
  const credentialIdLength = Uint8Array.of((credentialId.length >> 8) & 0xff, credentialId.length & 0xff);
  return concatBytes(rpIdHash, flags, signCount, aaguid, credentialIdLength, credentialId, coseKey);
}

/** Build a CBOR-encoded attestationObject { fmt: "none", attStmt: {}, authData } fixture. */
function buildAttestationObject(authData: Uint8Array): ArrayBuffer {
  const map = concatBytes(
    encodeCBORMapHeader(3),
    encodeCBORTextString('fmt'), encodeCBORTextString('none'),
    encodeCBORTextString('attStmt'), encodeCBORMapHeader(0),
    encodeCBORTextString('authData'), encodeCBORByteString(authData),
  );
  return map.buffer as ArrayBuffer;
}

/** x/y coordinates matching EXPECTED_PUBLIC_KEY_HEX, reused across fixtures for consistency. */
const expectedPoint = new Uint8Array(hexToBuffer(EXPECTED_PUBLIC_KEY_HEX));
const X_COORD = expectedPoint.slice(1, 33);
const Y_COORD = expectedPoint.slice(33, 65);

function makeFallbackRegistrationCredential(
  attestationObject: ArrayBuffer,
  opts: {
    /** Simulates a browser whose response has a getPublicKey() that returns null. */
    getPublicKeyReturnsNull?: boolean;
    /** Simulates a browser that doesn't implement getPublicKey() at all. */
    noGetPublicKey?: boolean;
    getPublicKeyAlgorithm?: number;
  } = {}
): PublicKeyCredential {
  const response: Record<string, unknown> = {
    attestationObject,
    clientDataJSON: new ArrayBuffer(0),
  };

  if (opts.getPublicKeyReturnsNull) {
    response.getPublicKey = () => null;
  } else if (!opts.noGetPublicKey) {
    response.getPublicKey = () => null;
  }

  if (opts.getPublicKeyAlgorithm !== undefined) {
    response.getPublicKeyAlgorithm = () => opts.getPublicKeyAlgorithm;
  }

  return {
    id: 'mock-credential-id',
    rawId: new ArrayBuffer(16),
    type: 'public-key',
    response: response as unknown as AuthenticatorAttestationResponse,
    getClientExtensionResults: () => ({}),
  } as unknown as PublicKeyCredential;
}

describe('extractPublicKey()', () => {
  it('returns a 65-byte Uint8Array', () => {
    const key = extractPublicKey(makeRegistrationCredential(SPKI_HEX));
    expect(key).toBeInstanceOf(Uint8Array);
    expect(key.byteLength).toBe(65);
  });

  it('first byte is 0x04 (uncompressed point marker)', () => {
    const key = extractPublicKey(makeRegistrationCredential(SPKI_HEX));
    expect(key[0]).toBe(0x04);
  });

  it('matches the known P-256 uncompressed point exactly', () => {
    const key = extractPublicKey(makeRegistrationCredential(SPKI_HEX));
    expect(bufferToHex(key)).toBe(EXPECTED_PUBLIC_KEY_HEX);
  });

  it('returns a copy — mutating result does not affect a second call', () => {
    const credential = makeRegistrationCredential(SPKI_HEX);
    const key1 = extractPublicKey(credential);
    key1.fill(0xff);
    const key2 = extractPublicKey(credential);
    expect(key2[0]).toBe(0x04);
  });

  it('throws when response is an assertion (no getPublicKey method, no attestationObject)', () => {
    expect(() => extractPublicKey(makeAssertionCredential())).toThrow(
      /not an AuthenticatorAttestationResponse/
    );
  });

  it('throws when SPKI blob is too short', () => {
    expect(() => extractPublicKey(makeRegistrationCredential('deadbeef')))
      .toThrow(/SPKI blob is \d+ bytes/);
  });

  it('throws when uncompressed point marker is not 0x04', () => {
    const spkiBytes = new Uint8Array(hexToBuffer(SPKI_HEX));
    spkiBytes[26] = 0x02;
    expect(() => extractPublicKey(makeRegistrationCredential(bufferToHex(spkiBytes))))
      .toThrow(/0x02/);
  });

  it('rejects a non-ES256 algorithm reported via getPublicKeyAlgorithm(), before parsing', () => {
    const credential = makeFallbackRegistrationCredential(new ArrayBuffer(0), {
      noGetPublicKey: true,
      getPublicKeyAlgorithm: -257, // RS256
    });
    expect(() => extractPublicKey(credential)).toThrow(
      /unsupported public key algorithm -257/
    );
  });

  describe('CBOR attestationObject fallback', () => {
    function fixtureWithCoseKey(alg: number, crv = 1): ArrayBuffer {
      const coseKey = buildCoseKey({ alg, crv, x: X_COORD, y: Y_COORD });
      const authData = buildAuthData(coseKey);
      return buildAttestationObject(authData);
    }

    it('falls back to attestationObject parsing when getPublicKey() is not implemented', () => {
      const attestationObject = fixtureWithCoseKey(-7);
      const credential = makeFallbackRegistrationCredential(attestationObject, { noGetPublicKey: true });
      const key = extractPublicKey(credential);
      expect(bufferToHex(key)).toBe(EXPECTED_PUBLIC_KEY_HEX);
    });

    it('falls back to attestationObject parsing when getPublicKey() returns null', () => {
      const attestationObject = fixtureWithCoseKey(-7);
      const credential = makeFallbackRegistrationCredential(attestationObject, { getPublicKeyReturnsNull: true });
      const key = extractPublicKey(credential);
      expect(bufferToHex(key)).toBe(EXPECTED_PUBLIC_KEY_HEX);
    });

    it('throws a clear error when getPublicKey() is unavailable and attestationObject is empty', () => {
      const credential = makeFallbackRegistrationCredential(new ArrayBuffer(0), { noGetPublicKey: true });
      expect(() => extractPublicKey(credential)).toThrow(/attestationObject is empty/);
    });

    it('rejects a non-ES256 COSE algorithm (RS256) found in the attestationObject', () => {
      const attestationObject = fixtureWithCoseKey(-257);
      const credential = makeFallbackRegistrationCredential(attestationObject, { noGetPublicKey: true });
      expect(() => extractPublicKey(credential)).toThrow(
        /unsupported COSE algorithm -257/
      );
    });

    it('rejects a non-P-256 curve found in the attestationObject', () => {
      const attestationObject = fixtureWithCoseKey(-7, 2); // crv 2 = P-384
      const credential = makeFallbackRegistrationCredential(attestationObject, { noGetPublicKey: true });
      expect(() => extractPublicKey(credential)).toThrow(
        /unsupported COSE curve 2/
      );
    });

    it('throws when the attested-credential-data flag is not set', () => {
      const coseKey = buildCoseKey({ alg: -7, x: X_COORD, y: Y_COORD });
      const authData = buildAuthData(coseKey, { flags: 0x05 }); // UP | UV, no AT
      const attestationObject = buildAttestationObject(authData);
      const credential = makeFallbackRegistrationCredential(attestationObject, { noGetPublicKey: true });
      expect(() => extractPublicKey(credential)).toThrow(
        /attested-credential-data flag/
      );
    });
  });
});

describe('convertSignatureDERtoCompact()', () => {
  it('returns exactly 64 bytes for a 70-byte DER signature', () => {
    const compact = convertSignatureDERtoCompact(hexToBuffer(DER_70_HEX));
    expect(compact).toBeInstanceOf(Uint8Array);
    expect(compact.byteLength).toBe(64);
  });

  it('returns exactly 64 bytes for a 71-byte DER signature (r padded)', () => {
    expect(convertSignatureDERtoCompact(hexToBuffer(DER_71_HEX)).byteLength).toBe(64);
  });

  it('returns exactly 64 bytes for a 72-byte DER signature (r and s padded)', () => {
    expect(convertSignatureDERtoCompact(hexToBuffer(DER_72_HEX)).byteLength).toBe(64);
  });

  it('returns exactly 64 bytes when r is shorter than 32 bytes', () => {
    expect(convertSignatureDERtoCompact(hexToBuffer(DER_SHORT_R_HEX)).byteLength).toBe(64);
  });

  it('70-byte DER: r and s match expected 32-byte scalars', () => {
    const compact = convertSignatureDERtoCompact(hexToBuffer(DER_70_HEX));
    expect(bufferToHex(compact.subarray(0, 32))).toBe('6b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296');
    expect(bufferToHex(compact.subarray(32, 64))).toBe('4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5');
  });

  it('71-byte DER: strips 0x00 padding from r, s unchanged', () => {
    const compact = convertSignatureDERtoCompact(hexToBuffer(DER_71_HEX));
    expect(bufferToHex(compact.subarray(0, 32))).toBe('dc17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296');
    expect(bufferToHex(compact.subarray(32, 64))).toBe('4fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5');
  });

  it('72-byte DER: strips 0x00 padding from both r and s', () => {
    const compact = convertSignatureDERtoCompact(hexToBuffer(DER_72_HEX));
    expect(bufferToHex(compact.subarray(0, 32))).toBe('dc17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296');
    expect(bufferToHex(compact.subarray(32, 64))).toBe('cfe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5');
  });

  it('short r (31 bytes in DER): left-pads r to 32 bytes with 0x00', () => {
    const compact = convertSignatureDERtoCompact(hexToBuffer(DER_SHORT_R_HEX));
    expect(bufferToHex(compact.subarray(0, 32))).toBe('0017d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c296');
  });

  it('throws when outer SEQUENCE tag is missing', () => {
    const bad = new Uint8Array(hexToBuffer(DER_70_HEX));
    bad[0] = 0x31;
    expect(() => convertSignatureDERtoCompact(bad.buffer)).toThrow(/SEQUENCE tag 0x30/);
  });

  it('throws when r INTEGER tag is missing', () => {
    const bad = new Uint8Array(hexToBuffer(DER_70_HEX));
    bad[2] = 0x03;
    expect(() => convertSignatureDERtoCompact(bad.buffer)).toThrow(/INTEGER tag 0x02 for r/);
  });

  it('throws when s INTEGER tag is missing', () => {
    const bad = new Uint8Array(hexToBuffer(DER_70_HEX));
    bad[36] = 0x03;
    expect(() => convertSignatureDERtoCompact(bad.buffer)).toThrow(/INTEGER tag 0x02 for s/);
  });

  it('throws when declared total length exceeds buffer', () => {
    const bad = new Uint8Array(hexToBuffer(DER_70_HEX));
    bad[1] = 0xff;
    expect(() => convertSignatureDERtoCompact(bad.buffer)).toThrow(/exceeds buffer size/);
  });
});

// ── registerCredential(): real-key extraction, self-check, and shared storage ──
//
// Uses Node's real WebCrypto (via node:crypto's `webcrypto`) so the self-check
// exercises genuine P-256 ECDSA sign/verify rather than a mocked stub.

describe('WebAuthNProvider.registerCredential()', () => {
  class LocalStorageMock {
    private store: Record<string, string> = {};
    getItem(key: string): string | null { return this.store[key] ?? null; }
    setItem(key: string, value: string): void { this.store[key] = value; }
    removeItem(key: string): void { delete this.store[key]; }
    clear(): void { this.store = {}; }
  }

  function derFromRawSignature(raw: Uint8Array): ArrayBuffer {
    const r = raw.slice(0, 32);
    const s = raw.slice(32, 64);

    const encodeInt = (bytes: Uint8Array): Uint8Array => {
      let start = 0;
      while (start < bytes.length - 1 && bytes[start] === 0) start++;
      let trimmed = bytes.slice(start);
      if (trimmed[0] & 0x80) {
        const padded = new Uint8Array(trimmed.length + 1);
        padded.set(trimmed, 1);
        trimmed = padded;
      }
      return concatBytes(Uint8Array.of(0x02, trimmed.length), trimmed);
    };

    const body = concatBytes(encodeInt(r), encodeInt(s));
    return concatBytes(Uint8Array.of(0x30, body.length), body).buffer as ArrayBuffer;
  }

  async function signAssertion(
    privateKey: CryptoKey,
    authenticatorData: Uint8Array,
    clientDataJSON: ArrayBuffer
  ): Promise<ArrayBuffer> {
    const clientDataHash = new Uint8Array(await webcrypto.subtle.digest('SHA-256', clientDataJSON));
    const signedData = concatBytes(authenticatorData, clientDataHash);
    const rawSignature = new Uint8Array(
      await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, signedData)
    );
    return derFromRawSignature(rawSignature);
  }

  beforeEach(() => {
    (global as any).localStorage = new LocalStorageMock();
    Object.defineProperty(global, 'crypto', { value: webcrypto, writable: true, configurable: true });
  });

  it('extracts the real public key, runs the self-check, and persists it for later lookup', async () => {
    const keyPair = (await webcrypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    )) as CryptoKeyPair;
    const rawPoint = new Uint8Array(await webcrypto.subtle.exportKey('raw', keyPair.publicKey));

    const authenticatorData = new Uint8Array(37).fill(0x01);
    const clientDataJSON = new TextEncoder().encode(JSON.stringify({ type: 'webauthn.get' })).buffer;

    const create = jest.fn(async () => ({
      id: 'cred-id',
      rawId: new Uint8Array([1, 2, 3, 4]).buffer,
      type: 'public-key',
      response: {
        getPublicKey: () => concatBytes(new Uint8Array(hexToBuffer(SPKI_HEADER_HEX)), rawPoint).buffer,
        attestationObject: new ArrayBuffer(0),
        clientDataJSON: new ArrayBuffer(0),
      },
      getClientExtensionResults: () => ({}),
    }));

    const get = jest.fn(async () => ({
      id: 'cred-id',
      rawId: new Uint8Array([1, 2, 3, 4]).buffer,
      type: 'public-key',
      response: {
        authenticatorData: authenticatorData.buffer,
        clientDataJSON,
        signature: await signAssertion(keyPair.privateKey, authenticatorData, clientDataJSON),
        userHandle: null,
      },
      getClientExtensionResults: () => ({}),
    }));

    Object.defineProperty(global, 'navigator', {
      value: { credentials: { create, get } },
      writable: true,
      configurable: true,
    });

    const provider = new WebAuthNProvider({ rpId: 'localhost', rpName: 'Test' });
    const credential = await provider.registerCredential('any');

    expect(create).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(1);

    const storedKey = provider.getStoredPublicKey(credential.id);
    expect(storedKey).not.toBeNull();
    expect(bufferToHex(storedKey!)).toBe(bufferToHex(rawPoint));
  });

  it('returns null for a credential id that was never registered', () => {
    const provider = new WebAuthNProvider({ rpId: 'localhost', rpName: 'Test' });
    expect(provider.getStoredPublicKey('never-registered')).toBeNull();
  });

  it('rejects registration when the self-check signature does not verify against the extracted key', async () => {
    const registeredKeyPair = (await webcrypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    )) as CryptoKeyPair;
    const wrongKeyPair = (await webcrypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    )) as CryptoKeyPair;
    const rawPoint = new Uint8Array(await webcrypto.subtle.exportKey('raw', registeredKeyPair.publicKey));

    const authenticatorData = new Uint8Array(37).fill(0x02);
    const clientDataJSON = new TextEncoder().encode(JSON.stringify({ type: 'webauthn.get' })).buffer;

    const create = jest.fn(async () => ({
      id: 'cred-id',
      rawId: new Uint8Array([9, 9, 9, 9]).buffer,
      type: 'public-key',
      response: {
        getPublicKey: () => concatBytes(new Uint8Array(hexToBuffer(SPKI_HEADER_HEX)), rawPoint).buffer,
        attestationObject: new ArrayBuffer(0),
        clientDataJSON: new ArrayBuffer(0),
      },
      getClientExtensionResults: () => ({}),
    }));

    // Signed with a *different* private key than the one whose public key was extracted.
    const get = jest.fn(async () => ({
      id: 'cred-id',
      rawId: new Uint8Array([9, 9, 9, 9]).buffer,
      type: 'public-key',
      response: {
        authenticatorData: authenticatorData.buffer,
        clientDataJSON,
        signature: await signAssertion(wrongKeyPair.privateKey, authenticatorData, clientDataJSON),
        userHandle: null,
      },
      getClientExtensionResults: () => ({}),
    }));

    Object.defineProperty(global, 'navigator', {
      value: { credentials: { create, get } },
      writable: true,
      configurable: true,
    });

    const provider = new WebAuthNProvider({ rpId: 'localhost', rpName: 'Test' });

    await expect(provider.registerCredential('any')).rejects.toThrow(/self-check failed/);
    expect(provider.getStoredPublicKey('cred-id')).toBeNull();
  });

  it('rejects registration when the self-check assertion ceremony is cancelled', async () => {
    const keyPair = (await webcrypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    )) as CryptoKeyPair;
    const rawPoint = new Uint8Array(await webcrypto.subtle.exportKey('raw', keyPair.publicKey));

    const create = jest.fn(async () => ({
      id: 'cred-id',
      rawId: new Uint8Array([5, 5, 5, 5]).buffer,
      type: 'public-key',
      response: {
        getPublicKey: () => concatBytes(new Uint8Array(hexToBuffer(SPKI_HEADER_HEX)), rawPoint).buffer,
        attestationObject: new ArrayBuffer(0),
        clientDataJSON: new ArrayBuffer(0),
      },
      getClientExtensionResults: () => ({}),
    }));

    const get = jest.fn(async () => null);

    Object.defineProperty(global, 'navigator', {
      value: { credentials: { create, get } },
      writable: true,
      configurable: true,
    });

    const provider = new WebAuthNProvider({ rpId: 'localhost', rpName: 'Test' });

    await expect(provider.registerCredential('any')).rejects.toThrow(/self-check assertion was cancelled/);
    expect(provider.getStoredPublicKey('cred-id')).toBeNull();
  });
});
