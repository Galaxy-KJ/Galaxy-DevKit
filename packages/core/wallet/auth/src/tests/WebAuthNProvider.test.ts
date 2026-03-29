import {
  extractPublicKey,
  convertSignatureDERtoCompact,
} from '../providers/WebAuthNProvider';

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

  it('throws when response is an assertion (no getPublicKey method)', () => {
    expect(() => extractPublicKey(makeAssertionCredential())).toThrow(
      /not an AuthenticatorAttestationResponse/
    );
  });

  it('throws when getPublicKey() returns null', () => {
    const credential = {
      ...makeRegistrationCredential(SPKI_HEX),
      response: { getPublicKey: () => null } as unknown as AuthenticatorAttestationResponse,
    } as unknown as PublicKeyCredential;
    expect(() => extractPublicKey(credential)).toThrow(/getPublicKey\(\) returned null/);
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
