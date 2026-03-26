import {
  BiometricAuthProvider,
  BiometricCapabilities,
  BiometricAuthResult,
  BiometricCredential,
  BiometricType,
} from '../BiometricAuth';

export function extractPublicKey(credential: PublicKeyCredential): Uint8Array {
  const response = credential.response as AuthenticatorAttestationResponse;

  if (typeof response.getPublicKey !== 'function') {
    throw new Error(
      'extractPublicKey: credential.response is not an AuthenticatorAttestationResponse. ' +
      'Pass the credential returned by navigator.credentials.create(), not .get().'
    );
  }

  // getPublicKey() returns the DER SubjectPublicKeyInfo blob directly (72 bytes for P-256).
  const spki = response.getPublicKey();
  if (!spki) {
    throw new Error(
      'extractPublicKey: getPublicKey() returned null. ' +
      'The authenticator may not support P-256 or the attestation format is unsupported.'
    );
  }

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

    const credentialId = this.arrayBufferToBase64(credential.rawId);

    const biometricCredential: BiometricCredential = {
      id: credentialId,
      type,
      createdAt: Date.now(),
      lastUsed: Date.now(),
    };

    this.storeCredentialId(credentialId);

    return biometricCredential;
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