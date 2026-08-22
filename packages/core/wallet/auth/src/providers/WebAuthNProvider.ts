import {
  BiometricAuthProvider,
  BiometricCapabilities,
  BiometricAuthResult,
  BiometricCredential,
  BiometricType,
} from '../BiometricAuth';

/** COSE Algorithm Identifier for ES256 (ECDSA w/ SHA-256 over P-256). */
const COSE_ALG_ES256 = -7;

export function extractPublicKey(credential: PublicKeyCredential): Uint8Array {
  const response = credential.response as AuthenticatorAttestationResponse;

  if (!('attestationObject' in response) || !response.attestationObject) {
    throw new Error(
      'extractPublicKey: credential.response is not an AuthenticatorAttestationResponse. ' +
      'Pass the credential returned by navigator.credentials.create(), not .get().'
    );
  }

  // Reject non-ES256 credentials explicitly, up front, when the browser exposes the
  // algorithm actually negotiated with the authenticator (WebAuthn Level 2+).
  if (typeof response.getPublicKeyAlgorithm === 'function') {
    const alg = response.getPublicKeyAlgorithm();
    if (alg !== COSE_ALG_ES256) {
      throw new Error(
        `extractPublicKey: unsupported public key algorithm ${alg} — only ES256 (-7 / P-256) ` +
        'is supported. Refusing to coerce a non-EC key into an EC point.'
      );
    }
  }

  // Preferred path: getPublicKey() returns the DER SubjectPublicKeyInfo blob directly
  // (72 bytes for P-256).
  if (typeof response.getPublicKey === 'function') {
    const spki = response.getPublicKey();
    if (spki) {
      return spkiToRawPoint(spki);
    }
  }

  // Fallback: not every authenticator/browser implements getPublicKey() (notably some
  // older Firefox releases). Parse the CBOR attestationObject ourselves.
  return attestationObjectToRawPoint(response.attestationObject);
}

/** Convert a DER SubjectPublicKeyInfo blob for a P-256 key into a raw 65-byte point. */
function spkiToRawPoint(spki: ArrayBuffer): Uint8Array {
  // P-256 SPKI is 72 bytes; the 65-byte uncompressed point starts at offset 27.
  const SPKI_HEADER_LENGTH = 26;
  const UNCOMPRESSED_POINT_LENGTH = 65;

  if (spki.byteLength < SPKI_HEADER_LENGTH + UNCOMPRESSED_POINT_LENGTH) {
    throw new Error(
      `extractPublicKey: SPKI blob is ${spki.byteLength} bytes — expected at least ` +
      `${SPKI_HEADER_LENGTH + UNCOMPRESSED_POINT_LENGTH} bytes for a P-256 key.`
    );
  }

  const point = new Uint8Array(spki, SPKI_HEADER_LENGTH, UNCOMPRESSED_POINT_LENGTH);

  if (point[0] !== 0x04) {
    throw new Error(
      `extractPublicKey: Expected uncompressed point marker 0x04 at offset ${SPKI_HEADER_LENGTH}, ` +
      `got 0x${point[0].toString(16).padStart(2, '0')}. ` +
      'The key may be compressed or the SPKI offset is wrong for this authenticator.'
    );
  }

  // Return a copy — never return a view into the original ArrayBuffer since
  // the caller may hold a reference and the buffer could be GC'd or mutated.
  return point.slice();
}

/**
 * Parse a WebAuthn `attestationObject` (CBOR-encoded) and extract the credential's
 * public key as a raw 65-byte SEC-1 uncompressed P-256 point.
 *
 * Used as a fallback when `AuthenticatorAttestationResponse.getPublicKey()` is
 * unavailable or returns null.
 */
function attestationObjectToRawPoint(attestationObject: ArrayBuffer): Uint8Array {
  if (attestationObject.byteLength === 0) {
    throw new Error(
      'extractPublicKey: getPublicKey() is unavailable and attestationObject is empty — ' +
      'cannot extract a public key.'
    );
  }

  const { value: attObj } = decodeCBORValue(new Uint8Array(attestationObject), 0);
  if (!(attObj instanceof Map)) {
    throw new Error('extractPublicKey: attestationObject did not decode to a CBOR map.');
  }

  const authData = attObj.get('authData');
  if (!(authData instanceof Uint8Array)) {
    throw new Error('extractPublicKey: attestationObject is missing an authData byte string.');
  }

  return authDataToRawPoint(authData);
}

/** Parse WebAuthn `authData` bytes and extract the attested credential's public key. */
function authDataToRawPoint(authData: Uint8Array): Uint8Array {
  const RP_ID_HASH_LENGTH = 32;
  const FLAGS_LENGTH = 1;
  const SIGN_COUNT_LENGTH = 4;
  const AAGUID_LENGTH = 16;
  const CRED_ID_LEN_LENGTH = 2;
  const ATTESTED_CREDENTIAL_DATA_FLAG = 0x40;

  const FIXED_HEADER_LENGTH = RP_ID_HASH_LENGTH + FLAGS_LENGTH + SIGN_COUNT_LENGTH;
  if (authData.length < FIXED_HEADER_LENGTH) {
    throw new Error(
      `extractPublicKey: authData is ${authData.length} bytes — too short to contain ` +
      `rpIdHash, flags, and signCount.`
    );
  }

  const flags = authData[RP_ID_HASH_LENGTH];
  if ((flags & ATTESTED_CREDENTIAL_DATA_FLAG) === 0) {
    throw new Error(
      'extractPublicKey: authData does not have the attested-credential-data flag set — ' +
      'this is not a registration ceremony response.'
    );
  }

  let offset = FIXED_HEADER_LENGTH + AAGUID_LENGTH;
  if (offset + CRED_ID_LEN_LENGTH > authData.length) {
    throw new Error('extractPublicKey: authData is truncated before credentialIdLength.');
  }

  const credentialIdLength = (authData[offset] << 8) | authData[offset + 1];
  offset += CRED_ID_LEN_LENGTH + credentialIdLength;

  if (offset >= authData.length) {
    throw new Error('extractPublicKey: authData is truncated before credentialPublicKey.');
  }

  const { value: coseKey } = decodeCBORValue(authData, offset);
  if (!(coseKey instanceof Map)) {
    throw new Error('extractPublicKey: credentialPublicKey did not decode to a CBOR map.');
  }

  return coseKeyToRawPoint(coseKey);
}

/** Convert a decoded COSE_Key map to a raw 65-byte SEC-1 uncompressed P-256 point. */
function coseKeyToRawPoint(coseKey: Map<unknown, unknown>): Uint8Array {
  const COSE_KTY_EC2 = 2;
  const COSE_CRV_P256 = 1;

  const kty = coseKey.get(1);
  const alg = coseKey.get(3);
  const crv = coseKey.get(-1);
  const x = coseKey.get(-2);
  const y = coseKey.get(-3);

  if (alg !== COSE_ALG_ES256) {
    throw new Error(
      `extractPublicKey: unsupported COSE algorithm ${alg} — only ES256 (-7) is supported. ` +
      'Refusing to coerce a non-EC key into an EC point.'
    );
  }
  if (kty !== COSE_KTY_EC2) {
    throw new Error(`extractPublicKey: unsupported COSE key type ${kty} — only EC2 (2) is supported.`);
  }
  if (crv !== COSE_CRV_P256) {
    throw new Error(`extractPublicKey: unsupported COSE curve ${crv} — only P-256 (1) is supported.`);
  }
  if (!(x instanceof Uint8Array) || x.length !== 32 || !(y instanceof Uint8Array) || y.length !== 32) {
    throw new Error('extractPublicKey: malformed COSE_Key — expected 32-byte x and y coordinates.');
  }

  const point = new Uint8Array(65);
  point[0] = 0x04;
  point.set(x, 1);
  point.set(y, 33);
  return point;
}

// ── Minimal CBOR decoder ──────────────────────────────────────────────────────
// WebAuthn's attestationObject and COSE_Key structures use canonical, definite-length
// CBOR (RFC 8949). We only need to decode the major types that actually appear there:
// unsigned/negative integers, byte strings, text strings, arrays, and maps.

interface CBORDecodeResult {
  value: unknown;
  offset: number;
}

function decodeCBORLength(
  view: DataView,
  offset: number,
  additionalInfo: number
): { length: number; offset: number } {
  if (additionalInfo < 24) return { length: additionalInfo, offset };
  if (additionalInfo === 24) return { length: view.getUint8(offset), offset: offset + 1 };
  if (additionalInfo === 25) return { length: view.getUint16(offset), offset: offset + 2 };
  if (additionalInfo === 26) return { length: view.getUint32(offset), offset: offset + 4 };
  if (additionalInfo === 27) {
    const high = view.getUint32(offset);
    const low = view.getUint32(offset + 4);
    return { length: high * 2 ** 32 + low, offset: offset + 8 };
  }
  throw new Error(
    `decodeCBOR: unsupported additional info ${additionalInfo} — indefinite-length CBOR is not supported.`
  );
}

function decodeCBORValue(bytes: Uint8Array, offset: number): CBORDecodeResult {
  if (offset >= bytes.length) {
    throw new Error('decodeCBOR: unexpected end of input.');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const initialByte = bytes[offset];
  const majorType = initialByte >> 5;
  const additionalInfo = initialByte & 0x1f;
  const { length, offset: dataStart } = decodeCBORLength(view, offset + 1, additionalInfo);

  switch (majorType) {
    case 0: // unsigned integer
      return { value: length, offset: dataStart };
    case 1: // negative integer
      return { value: -1 - length, offset: dataStart };
    case 2: // byte string
      return { value: bytes.slice(dataStart, dataStart + length), offset: dataStart + length };
    case 3: // text string
      return {
        value: new TextDecoder().decode(bytes.slice(dataStart, dataStart + length)),
        offset: dataStart + length,
      };
    case 4: { // array
      const arr: unknown[] = [];
      let cur = dataStart;
      for (let i = 0; i < length; i++) {
        const item = decodeCBORValue(bytes, cur);
        arr.push(item.value);
        cur = item.offset;
      }
      return { value: arr, offset: cur };
    }
    case 5: { // map
      const map = new Map<unknown, unknown>();
      let cur = dataStart;
      for (let i = 0; i < length; i++) {
        const key = decodeCBORValue(bytes, cur);
        const val = decodeCBORValue(bytes, key.offset);
        map.set(key.value, val.value);
        cur = val.offset;
      }
      return { value: map, offset: cur };
    }
    default:
      throw new Error(`decodeCBOR: unsupported major type ${majorType} at offset ${offset}.`);
  }
}

function concatUint8Arrays(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}


export function convertSignatureDERtoCompact(derSignature: ArrayBuffer): Uint8Array {
  const der = new Uint8Array(derSignature);
  let offset = 0;

  // ── Outer SEQUENCE ──────────────────────────────────────────────────────────
  if (der[offset++] !== 0x30) {
    throw new Error(
      `convertSignatureDERtoCompact: Expected SEQUENCE tag 0x30 at offset 0, ` +
      `got 0x${der[0].toString(16).padStart(2, '0')}.`
    );
  }

  // Read and skip the total-length byte (we validate components individually)
  const totalLength = der[offset++];
  if (offset + totalLength > der.byteLength) {
    throw new Error(
      `convertSignatureDERtoCompact: DER total length ${totalLength} exceeds buffer ` +
      `size ${der.byteLength - 2}.`
    );
  }

  // ── r INTEGER ───────────────────────────────────────────────────────────────
  if (der[offset++] !== 0x02) {
    throw new Error(
      `convertSignatureDERtoCompact: Expected INTEGER tag 0x02 for r at offset ${offset - 1}.`
    );
  }
  const rLen = der[offset++];
  if (rLen < 1 || rLen > 33) {
    throw new Error(
      `convertSignatureDERtoCompact: Invalid r length ${rLen} (expected 1–33).`
    );
  }
  const rBytes = der.slice(offset, offset + rLen);
  offset += rLen;

  // ── s INTEGER ───────────────────────────────────────────────────────────────
  if (der[offset++] !== 0x02) {
    throw new Error(
      `convertSignatureDERtoCompact: Expected INTEGER tag 0x02 for s at offset ${offset - 1}.`
    );
  }
  const sLen = der[offset++];
  if (sLen < 1 || sLen > 33) {
    throw new Error(
      `convertSignatureDERtoCompact: Invalid s length ${sLen} (expected 1–33).`
    );
  }
  const sBytes = der.slice(offset, offset + sLen);

  const compact = new Uint8Array(64);
  compact.set(padScalar(rBytes, 'r'), 0);   // bytes  0–31
  compact.set(padScalar(sBytes, 's'), 32);  // bytes 32–63

  return compact;
}


function padScalar(scalar: Uint8Array, name: 'r' | 's'): Uint8Array {
  // Strip the leading 0x00 that DER adds when the high bit of the first data
  // byte is set (to keep the integer positive in two's complement).
  let start = 0;
  if (scalar.length === 33 && scalar[0] === 0x00) {
    start = 1;
  }

  const stripped = scalar.subarray(start);

  if (stripped.length > 32) {
    throw new Error(
      `convertSignatureDERtoCompact: ${name} scalar is ${stripped.length} bytes after ` +
      `stripping padding — expected ≤ 32 bytes.`
    );
  }

  const padded = new Uint8Array(32); // zero-filled by default
  // Right-align: copy into the end of the 32-byte buffer
  padded.set(stripped, 32 - stripped.length);
  return padded;
}


export class WebAuthNProvider extends BiometricAuthProvider {
  private readonly rpId: string;
  private readonly rpName: string;

  constructor(options: { rpId?: string; rpName?: string } = {}) {
    super();
    this.rpId = options.rpId || window.location.hostname;
    this.rpName = options.rpName || 'Wallet Application';
  }

  get relyingPartyId(): string {
    return this.rpId;
  }

  async checkAvailability(): Promise<BiometricCapabilities> {
    if (!window.PublicKeyCredential) {
      return {
        available: false,
        types: [],
        hardwareSecurity: 'software',
        enrolled: false,
      };
    }

    try {
      const available =
        await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();

      return {
        available,
        types: available ? ['fingerprint', 'face'] : [],
        hardwareSecurity: available ? 'tee' : 'software',
        enrolled: available,
      };
    } catch (error) {
      return {
        available: false,
        types: [],
        hardwareSecurity: 'software',
        enrolled: false,
      };
    }
  }

  async authenticate(prompt: string): Promise<BiometricAuthResult> {
    try {
      const credentialIds = this.getStoredCredentialIds();

      if (credentialIds.length === 0) {
        return {
          success: false,
          error: 'No credentials registered. Please enroll first.',
        };
      }

      const challenge = this.generateChallenge();

      const credential = (await navigator.credentials.get({
        publicKey: {
          challenge,
          rpId: this.rpId,
          allowCredentials: credentialIds.map(id => ({
            type: 'public-key',
            id: this.base64ToArrayBuffer(id),
          })),
          userVerification: 'required',
          timeout: 60000,
        },
      })) as PublicKeyCredential | null;

      if (!credential) {
        return {
          success: false,
          error: 'Authentication cancelled',
        };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
      };
    }
  }

  async registerCredential(type: BiometricType): Promise<BiometricCredential> {
    const userId = this.generateUserId();
    const challenge = this.generateChallenge();

    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: {
          id: this.rpId,
          name: this.rpName,
        },
        user: {
          id: this.stringToArrayBuffer(userId),
          name: 'wallet-user',
          displayName: 'Wallet User',
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' }, // ES256
          { alg: -257, type: 'public-key' }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          userVerification: 'required',
          requireResidentKey: false,
        },
        timeout: 60000,
        attestation: 'none',
      },
    })) as PublicKeyCredential;

    if (!credential) {
      throw new Error('Failed to create credential');
    }

    const publicKey = extractPublicKey(credential);
    await this.verifyRegistrationSelfCheck(credential, publicKey);

    const credentialId = this.arrayBufferToBase64(credential.rawId);

    const biometricCredential: BiometricCredential = {
      id: credentialId,
      type,
      createdAt: Date.now(),
      lastUsed: Date.now(),
    };

    this.storeCredentialId(credentialId);
    this.storePublicKey(credentialId, publicKey);

    return biometricCredential;
  }

  /**
   * Look up the public key persisted for a credential during `registerCredential()`.
   * Shared storage format used by `SocialLoginProvider` so the key never has to be
   * re-derived.
   */
  getStoredPublicKey(credentialId: string): Uint8Array | null {
    const stored = localStorage.getItem(`webauthn_pubkey_${credentialId}`);
    if (!stored) return null;
    return new Uint8Array(this.base64ToArrayBuffer(stored));
  }

  /**
   * Registration-time safety check: sign a fresh challenge with the just-created
   * credential and verify the signature against the public key we extracted. This
   * catches a mis-parsed or mismatched public key before the wallet is ever
   * considered usable, rather than failing silently on the first real signature.
   *
   * @throws if the assertion ceremony is cancelled or the signature does not verify.
   */
  private async verifyRegistrationSelfCheck(
    credential: PublicKeyCredential,
    publicKey: Uint8Array
  ): Promise<void> {
    const challenge = this.generateChallenge();

    const assertion = (await navigator.credentials.get({
      publicKey: {
        challenge,
        rpId: this.rpId,
        allowCredentials: [{ type: 'public-key', id: credential.rawId }],
        userVerification: 'required',
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;

    if (!assertion) {
      throw new Error(
        'registerCredential: self-check assertion was cancelled — refusing to register a ' +
        'credential whose public key has not been verified.'
      );
    }

    const response = assertion.response as AuthenticatorAssertionResponse;
    const signature = convertSignatureDERtoCompact(response.signature);
    const clientDataHash = await crypto.subtle.digest('SHA-256', response.clientDataJSON);
    const signedData = concatUint8Arrays(
      new Uint8Array(response.authenticatorData),
      new Uint8Array(clientDataHash)
    );

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      publicKey.buffer as ArrayBuffer,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );

    const verified = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      cryptoKey,
      signature.buffer as ArrayBuffer,
      signedData.buffer as ArrayBuffer
    );

    if (!verified) {
      throw new Error(
        'registerCredential: self-check failed — the signature does not verify against the ' +
        'extracted public key. Refusing to register an unusable wallet signer.'
      );
    }
  }

  /**
   * Persist the public key alongside its credential id, using the same localStorage-based
   * format that `getStoredPublicKey()` reads from.
   */
  private storePublicKey(credentialId: string, publicKey: Uint8Array): void {
    localStorage.setItem(
      `webauthn_pubkey_${credentialId}`,
      this.arrayBufferToBase64(publicKey.buffer as ArrayBuffer)
    );
  }

  async removeCredential(id: string): Promise<boolean> {
    this.removeStoredCredentialId(id);
    return true;
  }

  async storeKey(key: string, identifier: string): Promise<boolean> {
    try {
      const encrypted = await this.encryptKey(key);
      localStorage.setItem(`biometric_key_${identifier}`, encrypted);
      return true;
    } catch (error) {
      return false;
    }
  }

  async retrieveKey(identifier: string): Promise<string | null> {
    try {
      const encrypted = localStorage.getItem(`biometric_key_${identifier}`);
      if (!encrypted) return null;

      return await this.decryptKey(encrypted);
    } catch (error) {
      return null;
    }
  }

  async deleteKey(identifier: string): Promise<boolean> {
    localStorage.removeItem(`biometric_key_${identifier}`);
    return true;
  }

  private generateChallenge(): ArrayBuffer {
    const challenge = new Uint8Array(32);
    crypto.getRandomValues(challenge);
    return challenge.buffer;
  }

  private generateUserId(): string {
    return crypto.randomUUID();
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private stringToArrayBuffer(str: string): ArrayBuffer {
    const encoder = new TextEncoder();
    return encoder.encode(str).buffer;
  }

  private getStoredCredentialIds(): string[] {
    const stored = localStorage.getItem('webauthn_credentials');
    return stored ? JSON.parse(stored) : [];
  }

  private storeCredentialId(id: string): void {
    const ids = this.getStoredCredentialIds();
    if (!ids.includes(id)) {
      ids.push(id);
      localStorage.setItem('webauthn_credentials', JSON.stringify(ids));
    }
  }

  private removeStoredCredentialId(id: string): void {
    const ids = this.getStoredCredentialIds();
    const filtered = ids.filter(storedId => storedId !== id);
    localStorage.setItem('webauthn_credentials', JSON.stringify(filtered));
  }

  private async encryptKey(key: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(key);

    const cryptoKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      data
    );

    const exportedKey = await crypto.subtle.exportKey('raw', cryptoKey);

    return JSON.stringify({
      encrypted: this.arrayBufferToBase64(encrypted),
      iv: this.arrayBufferToBase64(iv.buffer),
      key: this.arrayBufferToBase64(exportedKey),
    });
  }

  private async decryptKey(encryptedData: string): Promise<string> {
    const { encrypted, iv, key } = JSON.parse(encryptedData);

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      this.base64ToArrayBuffer(key),
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: this.base64ToArrayBuffer(iv),
      },
      cryptoKey,
      this.base64ToArrayBuffer(encrypted)
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  }
}
