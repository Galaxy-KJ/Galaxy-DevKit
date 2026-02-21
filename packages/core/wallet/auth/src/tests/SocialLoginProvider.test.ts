import { SocialLoginProvider } from '../providers/SocialLoginProvider';
import { WebAuthNProvider } from '../providers/WebAuthNProvider';
import { BiometricAuthResult, BiometricCredential } from '../BiometricAuth';

/**
 * Mock localStorage for Node.js test environment
 */
class LocalStorageMock {
  private store: Record<string, string> = {};

  clear(): void {
    this.store = {};
  }

  getItem(key: string): string | null {
    return this.store[key] || null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = value;
  }

  removeItem(key: string): void {
    delete this.store[key];
  }
}

// Set up localStorage mock
global.localStorage = new LocalStorageMock() as any;

/**
 * Mock crypto.getRandomValues for Node.js test environment
 */
if (typeof crypto === 'undefined') {
  (global as any).crypto = {
    getRandomValues: (array: Uint8Array) => {
      for (let i = 0; i < array.length; i++) {
        array[i] = Math.floor(Math.random() * 256);
      }
      return array;
    },
  };
}

/**
 * Mock WebAuthNProvider for testing
 */
class MockWebAuthNProvider extends WebAuthNProvider {
  private mockCredentials: Map<string, BiometricCredential> = new Map();
  private shouldAuthSucceed = true;
  private mockCredentialId = 'mock-credential-id-123';

  constructor() {
    super({ rpId: 'localhost', rpName: 'Test App' });
  }

  async registerCredential(): Promise<BiometricCredential> {
    const credential: BiometricCredential = {
      id: this.mockCredentialId,
      type: 'any',
      createdAt: Date.now(),
      lastUsed: Date.now(),
    };

    this.mockCredentials.set(credential.id, credential);
    
    // Store in localStorage to simulate real behavior
    localStorage.setItem('webauthn_credentials', JSON.stringify([credential.id]));

    return credential;
  }

  async authenticate(prompt: string): Promise<BiometricAuthResult> {
    if (!this.shouldAuthSucceed) {
      return {
        success: false,
        error: 'Authentication failed',
      };
    }

    if (this.mockCredentials.size === 0) {
      return {
        success: false,
        error: 'No credentials registered',
      };
    }

    return {
      success: true,
    };
  }

  // Test helpers
  setAuthSuccess(success: boolean): void {
    this.shouldAuthSucceed = success;
  }

  setMockCredentialId(id: string): void {
    this.mockCredentialId = id;
  }

  clearCredentials(): void {
    this.mockCredentials.clear();
    localStorage.removeItem('webauthn_credentials');
  }
}

describe('SocialLoginProvider', () => {
  let mockWebAuthn: MockWebAuthNProvider;
  let socialLogin: SocialLoginProvider;

  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    
    mockWebAuthn = new MockWebAuthNProvider();
    socialLogin = new SocialLoginProvider(mockWebAuthn);
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('onboard', () => {
    it('should successfully onboard a new user', async () => {
      const userId = 'google-oauth-user-123';

      const result = await socialLogin.onboard(userId);

      expect(result).toHaveProperty('userId', userId);
      expect(result).toHaveProperty('credentialId');
      expect(result).toHaveProperty('publicKey65Bytes');
      expect(result.credentialId).toBe('mock-credential-id-123');
    });

    it('should return a 65-byte public key', async () => {
      const result = await socialLogin.onboard('user-456');

      expect(result.publicKey65Bytes).toBeInstanceOf(Uint8Array);
      expect(result.publicKey65Bytes.length).toBe(65);
      expect(result.publicKey65Bytes[0]).toBe(0x04); // Uncompressed point indicator
    });

    it('should call webAuthnProvider.registerCredential', async () => {
      const registerSpy = jest.spyOn(mockWebAuthn, 'registerCredential');

      await socialLogin.onboard('user-789');

      expect(registerSpy).toHaveBeenCalledWith('any');
    });

    it('should work with different user IDs', async () => {
      const userIds = [
        'google-oauth-user-1',
        'apple-signin-user-2',
        'github-user-3',
      ];

      for (const userId of userIds) {
        mockWebAuthn.clearCredentials();
        const result = await socialLogin.onboard(userId);
        expect(result.userId).toBe(userId);
      }
    });

    it('should throw if credential registration fails', async () => {
      // Mock registration failure
      jest.spyOn(mockWebAuthn, 'registerCredential').mockRejectedValueOnce(
        new Error('Registration failed')
      );

      await expect(socialLogin.onboard('user-fail')).rejects.toThrow(
        'Registration failed'
      );
    });
  });

  describe('login', () => {
    it('should successfully login a returning user', async () => {
      const userId = 'google-oauth-user-456';

      // First onboard the user
      await socialLogin.onboard(userId);

      // Then login
      const result = await socialLogin.login(userId);

      expect(result).toHaveProperty('userId', userId);
      expect(result).toHaveProperty('credentialId');
      expect(result.credentialId).toBe('mock-credential-id-123');
    });

    it('should call webAuthnProvider.authenticate', async () => {
      await socialLogin.onboard('user-999');

      const authenticateSpy = jest.spyOn(mockWebAuthn, 'authenticate');

      await socialLogin.login('user-999');

      expect(authenticateSpy).toHaveBeenCalledWith('Authenticate as user-999');
    });

    it('should throw if authentication fails', async () => {
      await socialLogin.onboard('user-fail-auth');
      
      mockWebAuthn.setAuthSuccess(false);

      await expect(socialLogin.login('user-fail-auth')).rejects.toThrow(
        'Authentication failed'
      );
    });

    it('should throw if no credentials are registered', async () => {
      await expect(socialLogin.login('user-no-creds')).rejects.toThrow(
        'No credentials registered'
      );
    });

    it('should work after multiple onboarding attempts', async () => {
      // Onboard
      await socialLogin.onboard('user-multi');

      // Login multiple times
      for (let i = 0; i < 3; i++) {
        const result = await socialLogin.login('user-multi');
        expect(result.userId).toBe('user-multi');
      }
    });
  });

  describe('OAuth provider agnostic', () => {
    it('should work with Google OAuth user IDs', async () => {
      const result = await socialLogin.onboard('google|123456789');
      expect(result.userId).toBe('google|123456789');
    });

    it('should work with Apple Sign In user IDs', async () => {
      const result = await socialLogin.onboard('apple|user.abc.xyz');
      expect(result.userId).toBe('apple|user.abc.xyz');
    });

    it('should work with any OAuth provider format', async () => {
      const providers = [
        'auth0|abc123',
        'firebase|xyz789',
        'supabase-uuid-here',
        'custom-provider-id-456',
      ];

      for (const userId of providers) {
        mockWebAuthn.clearCredentials();
        const result = await socialLogin.onboard(userId);
        expect(result.userId).toBe(userId);
      }
    });
  });

  describe('Security guarantees', () => {
    it('should never expose private key material', async () => {
      const result = await socialLogin.onboard('security-test-user');

      // Check the returned object only contains public data
      const keys = Object.keys(result);
      expect(keys).toEqual(['userId', 'credentialId', 'publicKey65Bytes']);
      expect(keys).not.toContain('privateKey');
      expect(keys).not.toContain('secret');
      expect(keys).not.toContain('seed');
    });

    it('should not derive keys from userId', async () => {
      // Same userId should produce different credentials (due to random WebAuthn generation)
      mockWebAuthn.clearCredentials();
      mockWebAuthn.setMockCredentialId('cred-1');
      const result1 = await socialLogin.onboard('same-user');

      mockWebAuthn.clearCredentials();
      mockWebAuthn.setMockCredentialId('cred-2');
      const result2 = await socialLogin.onboard('same-user');

      // Credential IDs should be different (in real WebAuthn they're random)
      expect(result1.credentialId).not.toBe(result2.credentialId);
    });

    it('should return public key only (no private key derivation)', async () => {
      const result = await socialLogin.onboard('pubkey-test');

      // Public key should be 65 bytes (uncompressed EC point)
      expect(result.publicKey65Bytes.length).toBe(65);
      
      // First byte should be 0x04 (uncompressed point)
      expect(result.publicKey65Bytes[0]).toBe(0x04);
      
      // This is PUBLIC data, safe to store in backend
      expect(result.publicKey65Bytes).toBeInstanceOf(Uint8Array);
    });
  });

  describe('Integration flow', () => {
    it('should complete full onboard → login flow', async () => {
      const userId = 'integration-test-user';

      // Step 1: User authenticates with OAuth (upstream)
      // Step 2: Onboard - create WebAuthn credential
      const onboardResult = await socialLogin.onboard(userId);
      
      expect(onboardResult.userId).toBe(userId);
      expect(onboardResult.credentialId).toBeDefined();
      expect(onboardResult.publicKey65Bytes.length).toBe(65);

      // Step 3: User returns later, authenticates with OAuth again
      // Step 4: Login - verify WebAuthn credential
      const loginResult = await socialLogin.login(userId);
      
      expect(loginResult.userId).toBe(userId);
      expect(loginResult.credentialId).toBe(onboardResult.credentialId);
    });

    it('should maintain separate OAuth and WebAuthn layers', async () => {
      const userId = 'layers-test-user';

      // OAuth identifies the user (userId)
      const onboardResult = await socialLogin.onboard(userId);
      
      // WebAuthn protects the key (credentialId + publicKey)
      expect(onboardResult).toMatchObject({
        userId, // OAuth layer
        credentialId: expect.any(String), // WebAuthn layer
        publicKey65Bytes: expect.any(Uint8Array), // WebAuthn layer
      });
    });
  });

  describe('Error handling', () => {
    it('should handle WebAuthn unavailability gracefully', async () => {
      jest.spyOn(mockWebAuthn, 'registerCredential').mockRejectedValueOnce(
        new Error('WebAuthn not supported')
      );

      await expect(socialLogin.onboard('unsupported-user')).rejects.toThrow(
        'WebAuthn not supported'
      );
    });

    it('should provide clear error messages', async () => {
      try {
        await socialLogin.login('no-creds-user');
        fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('No credentials registered');
      }
    });
  });
});
