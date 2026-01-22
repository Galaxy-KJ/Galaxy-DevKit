import {
  BiometricAuthProvider,
  BiometricCredential,
  BiometricCapabilities,
  BiometricAuthResult,
  BiometricType,
} from '../BiometricAuth';

export class MockBiometricProvider extends BiometricAuthProvider {
  private mockAvailable: boolean;
  private mockEnrolled: boolean;
  private mockAuthSuccess: boolean;
  private keys: Map<string, string> = new Map();
  private credentials: Map<string, BiometricCredential> = new Map();

  constructor(
    options: {
      available?: boolean;
      enrolled?: boolean;
      authSuccess?: boolean;
    } = {}
  ) {
    super();
    this.mockAvailable = options.available ?? true;
    this.mockEnrolled = options.enrolled ?? true;
    this.mockAuthSuccess = options.authSuccess ?? true;
  }

  async checkAvailability(): Promise<BiometricCapabilities> {
    return {
      available: this.mockAvailable,
      types: this.mockAvailable ? ['fingerprint', 'face'] : [],
      hardwareSecurity: 'secure-enclave',
      enrolled: this.mockEnrolled,
    };
  }

  async authenticate(prompt: string): Promise<BiometricAuthResult> {
    await this.delay(500); // Simulate biometric scan

    return {
      success: this.mockAuthSuccess,
      error: this.mockAuthSuccess
        ? undefined
        : 'Biometric authentication failed',
    };
  }

  async registerCredential(type: BiometricType): Promise<BiometricCredential> {
    await this.delay(1000); // Simulate enrollment

    const credential: BiometricCredential = {
      id: `mock-${Date.now()}`,
      type,
      createdAt: Date.now(),
      lastUsed: Date.now(),
    };

    this.credentials.set(credential.id, credential);
    return credential;
  }

  async removeCredential(id: string): Promise<boolean> {
    return this.credentials.delete(id);
  }

  async storeKey(key: string, identifier: string): Promise<boolean> {
    this.keys.set(identifier, key);
    return true;
  }

  async retrieveKey(identifier: string): Promise<string | null> {
    return this.keys.get(identifier) || null;
  }

  async deleteKey(identifier: string): Promise<boolean> {
    return this.keys.delete(identifier);
  }

  // Test helpers
  setAvailable(available: boolean): void {
    this.mockAvailable = available;
  }

  setEnrolled(enrolled: boolean): void {
    this.mockEnrolled = enrolled;
  }

  setAuthSuccess(success: boolean): void {
    this.mockAuthSuccess = success;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
