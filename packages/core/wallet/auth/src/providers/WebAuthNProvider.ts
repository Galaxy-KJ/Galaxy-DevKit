import {
  BiometricAuthProvider,
  BiometricCapabilities,
  BiometricAuthResult,
  BiometricCredential,
  BiometricType,
} from '../BiometricAuth';

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


// mock please remove this after impl   issue#[221]
export const extractPublicKey = jest.fn(
  (_credential: PublicKeyCredential): Uint8Array => {
    const key = new Uint8Array(65);
    key[0] = 0x04;
    key.fill(0xab, 1, 33);
    key.fill(0xcd, 33, 65);
    return key;
  }
);
export const convertSignatureDERtoCompact = jest.fn(
  (_derSignature: ArrayBuffer): Uint8Array => {

    return new Uint8Array(64).fill(0xef);
  }
);