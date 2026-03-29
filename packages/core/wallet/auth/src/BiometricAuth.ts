import { EventEmitter } from 'events';

export type BiometricType = 'fingerprint' | 'face' | 'iris' | 'any';
export type HardwareSecurity = 'secure-enclave' | 'tee' | 'software';
export type FallbackAuth = 'pin' | 'password';

export interface BiometricConfig {
  enabled: boolean;
  biometricType: BiometricType;
  requireForTransactions: boolean;
  transactionThreshold?: string;
  fallbackAuth: FallbackAuth;
  maxAttempts: number;
}

export interface BiometricCapabilities {
  available: boolean;
  types: BiometricType[];
  hardwareSecurity: HardwareSecurity;
  enrolled: boolean;
}

export interface BiometricAuthResult {
  success: boolean;
  error?: string;
  attemptsRemaining?: number;
}

export interface BiometricCredential {
  id: string;
  type: BiometricType;
  createdAt: number;
  lastUsed: number;
}

export abstract class BiometricAuthProvider {
  abstract checkAvailability(): Promise<BiometricCapabilities>;
  abstract authenticate(prompt: string): Promise<BiometricAuthResult>;
  abstract registerCredential(
    type: BiometricType
  ): Promise<BiometricCredential>;
  abstract removeCredential(id: string): Promise<boolean>;
  abstract storeKey(key: string, identifier: string): Promise<boolean>;
  abstract retrieveKey(identifier: string): Promise<string | null>;
  abstract deleteKey(identifier: string): Promise<boolean>;
}

export class BiometricAuth extends EventEmitter {
  private provider: BiometricAuthProvider;
  private config: BiometricConfig;
  private failedAttempts: number = 0;
  private lockedUntil?: number;
  private credentials: Map<string, BiometricCredential> = new Map();

  constructor(
    provider: BiometricAuthProvider,
    config: Partial<BiometricConfig> = {}
  ) {
    super();
    this.provider = provider;
    this.config = {
      enabled: true,
      biometricType: 'any',
      requireForTransactions: true,
      fallbackAuth: 'pin',
      maxAttempts: 5,
      ...config,
    };
  }

  async initialize(): Promise<void> {
    const capabilities = await this.provider.checkAvailability();

    if (!capabilities.available) {
      this.config.enabled = false;
      this.emit('unavailable', capabilities);
      throw new Error('Biometric authentication not available on this device');
    }

    if (!capabilities.enrolled) {
      this.config.enabled = false;
      this.emit('not-enrolled');
      throw new Error('No biometric credentials enrolled on device');
    }

    this.emit('initialized', capabilities);
  }

  async getCapabilities(): Promise<BiometricCapabilities> {
    return await this.provider.checkAvailability();
  }

  async enroll(type: BiometricType = 'any'): Promise<BiometricCredential> {
    if (!this.config.enabled) {
      throw new Error('Biometric authentication is disabled');
    }

    const capabilities = await this.provider.checkAvailability();

    if (!capabilities.available || !capabilities.enrolled) {
      throw new Error(
        'Cannot enroll: biometric hardware not available or not configured'
      );
    }

    const credential = await this.provider.registerCredential(type);
    this.credentials.set(credential.id, credential);

    this.emit('enrolled', credential);
    return credential;
  }

  async authenticate(
    options: {
      prompt?: string;
      allowFallback?: boolean;
    } = {}
  ): Promise<BiometricAuthResult> {
    const { prompt = 'Authenticate to access wallet', allowFallback = true } =
      options;

    if (!this.config.enabled) {
      if (allowFallback) {
        return this.fallbackAuthentication();
      }
      return { success: false, error: 'Biometric authentication is disabled' };
    }

    if (this.isLocked()) {
      const remainingTime = Math.ceil((this.lockedUntil! - Date.now()) / 1000);
      return {
        success: false,
        error: `Account locked. Try again in ${remainingTime} seconds`,
        attemptsRemaining: 0,
      };
    }

    try {
      const result = await this.provider.authenticate(prompt);

      if (result.success) {
        this.failedAttempts = 0;
        this.emit('authenticated');
        return result;
      } else {
        this.handleFailedAttempt();
        return {
          ...result,
          attemptsRemaining: Math.max(
            0,
            this.config.maxAttempts - this.failedAttempts
          ),
        };
      }
    } catch (error) {
      this.handleFailedAttempt();

      if (allowFallback && this.failedAttempts >= this.config.maxAttempts) {
        this.emit('fallback-required');
        return this.fallbackAuthentication();
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Authentication failed',
        attemptsRemaining: Math.max(
          0,
          this.config.maxAttempts - this.failedAttempts
        ),
      };
    }
  }

  async authenticateForTransaction(
    amount: string
  ): Promise<BiometricAuthResult> {
    if (!this.config.requireForTransactions) {
      return { success: true };
    }

    if (this.config.transactionThreshold) {
      const threshold = BigInt(this.config.transactionThreshold);
      const txAmount = BigInt(amount);

      if (txAmount < threshold) {
        return { success: true };
      }
    }

    return await this.authenticate({
      prompt: `Authenticate to sign transaction of ${amount}`,
      allowFallback: true,
    });
  }

  async storeEncryptedKey(key: string, identifier: string): Promise<boolean> {
    if (!this.config.enabled) {
      throw new Error('Biometric authentication must be enabled to store keys');
    }

    const authResult = await this.authenticate({
      prompt: 'Authenticate to store encryption key',
      allowFallback: false,
    });

    if (!authResult.success) {
      throw new Error('Authentication required to store key');
    }

    return await this.provider.storeKey(key, identifier);
  }

  async retrieveEncryptedKey(identifier: string): Promise<string | null> {
    if (!this.config.enabled) {
      throw new Error(
        'Biometric authentication must be enabled to retrieve keys'
      );
    }

    const authResult = await this.authenticate({
      prompt: 'Authenticate to retrieve encryption key',
      allowFallback: false,
    });

    if (!authResult.success) {
      throw new Error('Authentication required to retrieve key');
    }

    return await this.provider.retrieveKey(identifier);
  }

  async deleteEncryptedKey(identifier: string): Promise<boolean> {
    return await this.provider.deleteKey(identifier);
  }

  async removeCredential(id: string): Promise<boolean> {
    const removed = await this.provider.removeCredential(id);

    if (removed) {
      this.credentials.delete(id);
      this.emit('credential-removed', id);
    }

    return removed;
  }

  private handleFailedAttempt(): void {
    this.failedAttempts++;
    this.emit('failed-attempt', {
      attempts: this.failedAttempts,
      remaining: Math.max(0, this.config.maxAttempts - this.failedAttempts),
    });

    if (this.failedAttempts >= this.config.maxAttempts) {
      this.lockAccount();
    }
  }

  private lockAccount(): void {
    const lockDuration = this.calculateLockDuration();
    this.lockedUntil = Date.now() + lockDuration;

    this.emit('locked', {
      until: this.lockedUntil,
      duration: lockDuration,
    });
  }

  private calculateLockDuration(): number {
    const baseTime = 30000; // 30 seconds
    const multiplier = Math.min(
      Math.floor(this.failedAttempts / this.config.maxAttempts),
      5
    );
    return baseTime * Math.pow(2, multiplier);
  }

  private isLocked(): boolean {
    if (!this.lockedUntil) return false;

    if (Date.now() >= this.lockedUntil) {
      this.lockedUntil = undefined;
      this.failedAttempts = 0;
      this.emit('unlocked');
      return false;
    }

    return true;
  }

  private async fallbackAuthentication(): Promise<BiometricAuthResult> {
    this.emit('fallback-triggered', this.config.fallbackAuth);

    return {
      success: false,
      error: `Please use ${this.config.fallbackAuth} authentication`,
    };
  }

  updateConfig(config: Partial<BiometricConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('config-updated', this.config);
  }

  getConfig(): BiometricConfig {
    return { ...this.config };
  }

  getCredentials(): BiometricCredential[] {
    return Array.from(this.credentials.values());
  }

  resetFailedAttempts(): void {
    this.failedAttempts = 0;
    this.lockedUntil = undefined;
    this.emit('reset');
  }

  async detectSecurityChange(): Promise<boolean> {
    const capabilities = await this.provider.checkAvailability();

    if (!capabilities.enrolled && this.config.enabled) {
      this.emit('security-change', 'biometric-removed');
      this.config.enabled = false;
      return true;
    }

    return false;
  }

  disable(): void {
    this.config.enabled = false;
    this.failedAttempts = 0;
    this.lockedUntil = undefined;
    this.emit('disabled');
  }

  enable(): void {
    this.config.enabled = true;
    this.emit('enabled');
  }
}
