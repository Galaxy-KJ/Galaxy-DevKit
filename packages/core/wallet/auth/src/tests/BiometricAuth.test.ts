// packages/core/wallet/src/auth/__tests__/BiometricAuth.test.ts

import { BiometricAuth } from '../BiometricAuth';
import { MockBiometricProvider } from '../providers/MockProvider';

describe('BiometricAuth', () => {
  let provider: MockBiometricProvider;
  let biometric: BiometricAuth;

  beforeEach(() => {
    provider = new MockBiometricProvider();
    biometric = new BiometricAuth(provider, {
      enabled: true,
      biometricType: 'any',
      requireForTransactions: true,
      maxAttempts: 3,
    });
  });

  describe('initialization', () => {
    it('should initialize successfully when biometric is available', async () => {
      await expect(biometric.initialize()).resolves.not.toThrow();
    });

    it('should throw when biometric is not available', async () => {
      provider.setAvailable(false);
      await expect(biometric.initialize()).rejects.toThrow(
        'Biometric authentication not available on this device'
      );
    });

    it('should throw when biometric is not enrolled', async () => {
      provider.setEnrolled(false);
      await expect(biometric.initialize()).rejects.toThrow(
        'No biometric credentials enrolled on device'
      );
    });

    it('should emit initialized event', async () => {
      const spy = jest.fn();
      biometric.on('initialized', spy);

      await biometric.initialize();

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          available: true,
          enrolled: true,
        })
      );
    });
  });

  describe('capabilities', () => {
    it('should return device capabilities', async () => {
      const capabilities = await biometric.getCapabilities();

      expect(capabilities).toEqual({
        available: true,
        types: ['fingerprint', 'face'],
        hardwareSecurity: 'secure-enclave',
        enrolled: true,
      });
    });
  });

  describe('enrollment', () => {
    beforeEach(async () => {
      await biometric.initialize();
    });

    it('should enroll a new biometric credential', async () => {
      const credential = await biometric.enroll('fingerprint');

      expect(credential).toMatchObject({
        type: 'fingerprint',
        createdAt: expect.any(Number),
        lastUsed: expect.any(Number),
      });
      expect(credential.id).toBeDefined();
    });

    it('should emit enrolled event', async () => {
      const spy = jest.fn();
      biometric.on('enrolled', spy);

      await biometric.enroll('face');

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'face',
        })
      );
    });

    it('should throw when biometric is disabled', async () => {
      biometric.disable();

      await expect(biometric.enroll()).rejects.toThrow(
        'Biometric authentication is disabled'
      );
    });

    it('should store multiple credentials', async () => {
      await biometric.enroll('fingerprint');
      await biometric.enroll('face');

      const credentials = biometric.getCredentials();
      expect(credentials).toHaveLength(2);
    });
  });

  describe('authentication', () => {
    beforeEach(async () => {
      await biometric.initialize();
      await biometric.enroll();
    });

    it('should authenticate successfully', async () => {
      provider.setAuthSuccess(true);

      const result = await biometric.authenticate();

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should fail authentication when biometric fails', async () => {
      provider.setAuthSuccess(false);

      const result = await biometric.authenticate();

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should emit authenticated event on success', async () => {
      const spy = jest.fn();
      biometric.on('authenticated', spy);

      await biometric.authenticate();

      expect(spy).toHaveBeenCalled();
    });

    it('should use custom prompt', async () => {
      const authenticateSpy = jest.spyOn(provider, 'authenticate');

      await biometric.authenticate({
        prompt: 'Custom authentication prompt',
      });

      expect(authenticateSpy).toHaveBeenCalledWith(
        'Custom authentication prompt'
      );
    });
  });

  describe('failed attempts and locking', () => {
    beforeEach(async () => {
      await biometric.initialize();
      await biometric.enroll();
      provider.setAuthSuccess(false);
    });

    it('should track failed attempts', async () => {
      const spy = jest.fn();
      biometric.on('failed-attempt', spy);

      await biometric.authenticate();

      expect(spy).toHaveBeenCalledWith({
        attempts: 1,
        remaining: 2,
      });
    });

    it('should return remaining attempts', async () => {
      await biometric.authenticate();
      const result = await biometric.authenticate();

      expect(result.attemptsRemaining).toBe(1);
    });

    it('should lock account after max failed attempts', async () => {
      const lockSpy = jest.fn();
      biometric.on('locked', lockSpy);

      await biometric.authenticate();
      await biometric.authenticate();
      await biometric.authenticate();

      expect(lockSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          until: expect.any(Number),
          duration: expect.any(Number),
        })
      );
    });

    it('should prevent authentication when locked', async () => {
      // Trigger lock
      await biometric.authenticate();
      await biometric.authenticate();
      await biometric.authenticate();

      const result = await biometric.authenticate();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Account locked');
      expect(result.attemptsRemaining).toBe(0);
    });

    it('should reset attempts on successful authentication', async () => {
      await biometric.authenticate(); // Fail

      provider.setAuthSuccess(true);
      await biometric.authenticate(); // Success

      provider.setAuthSuccess(false);
      const result = await biometric.authenticate(); // Fail again

      expect(result.attemptsRemaining).toBe(2); // Reset to max - 1
    });

    it('should manually reset failed attempts', async () => {
      await biometric.authenticate();
      await biometric.authenticate();

      biometric.resetFailedAttempts();

      const result = await biometric.authenticate();
      expect(result.attemptsRemaining).toBe(2);
    });
  });

  describe('transaction authentication', () => {
    beforeEach(async () => {
      await biometric.initialize();
      await biometric.enroll();
    });

    it('should require authentication for transactions', async () => {
      const result = await biometric.authenticateForTransaction('1000000000');

      expect(result.success).toBe(true);
    });

    it('should skip authentication when not required', async () => {
      biometric.updateConfig({ requireForTransactions: false });

      const result = await biometric.authenticateForTransaction('1000000000');

      expect(result.success).toBe(true);
    });

    it('should skip authentication for amounts below threshold', async () => {
      biometric.updateConfig({
        requireForTransactions: true,
        transactionThreshold: '5000000000', // 5 SOL
      });

      const result = await biometric.authenticateForTransaction('1000000000');

      expect(result.success).toBe(true);
    });

    it('should require authentication for amounts above threshold', async () => {
      const authenticateSpy = jest.spyOn(biometric, 'authenticate');

      biometric.updateConfig({
        requireForTransactions: true,
        transactionThreshold: '1000000000',
      });

      await biometric.authenticateForTransaction('5000000000');

      expect(authenticateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('5000000000'),
        })
      );
    });
  });

  describe('key storage', () => {
    beforeEach(async () => {
      await biometric.initialize();
      await biometric.enroll();
    });

    it('should store encrypted key', async () => {
      const result = await biometric.storeEncryptedKey(
        'test-private-key',
        'wallet-key-1'
      );

      expect(result).toBe(true);
    });

    it('should retrieve encrypted key', async () => {
      await biometric.storeEncryptedKey('test-private-key', 'wallet-key-1');

      const key = await biometric.retrieveEncryptedKey('wallet-key-1');

      expect(key).toBe('test-private-key');
    });

    it('should require authentication to store key', async () => {
      provider.setAuthSuccess(false);

      await expect(
        biometric.storeEncryptedKey('test-key', 'wallet-key-1')
      ).rejects.toThrow('Authentication required to store key');
    });

    it('should require authentication to retrieve key', async () => {
      await biometric.storeEncryptedKey('test-key', 'wallet-key-1');

      provider.setAuthSuccess(false);

      await expect(
        biometric.retrieveEncryptedKey('wallet-key-1')
      ).rejects.toThrow('Authentication required to retrieve key');
    });

    it('should delete encrypted key', async () => {
      await biometric.storeEncryptedKey('test-key', 'wallet-key-1');

      const deleted = await biometric.deleteEncryptedKey('wallet-key-1');
      expect(deleted).toBe(true);

      const key = await biometric.retrieveEncryptedKey('wallet-key-1');
      expect(key).toBeNull();
    });

    it('should return null for non-existent key', async () => {
      const key = await biometric.retrieveEncryptedKey('non-existent');

      expect(key).toBeNull();
    });
  });

  describe('credential management', () => {
    beforeEach(async () => {
      await biometric.initialize();
    });

    it('should remove credential', async () => {
      const credential = await biometric.enroll('fingerprint');

      const removed = await biometric.removeCredential(credential.id);

      expect(removed).toBe(true);
      expect(biometric.getCredentials()).toHaveLength(0);
    });

    it('should emit credential-removed event', async () => {
      const credential = await biometric.enroll('fingerprint');
      const spy = jest.fn();
      biometric.on('credential-removed', spy);

      await biometric.removeCredential(credential.id);

      expect(spy).toHaveBeenCalledWith(credential.id);
    });

    it('should get all credentials', async () => {
      await biometric.enroll('fingerprint');
      await biometric.enroll('face');

      const credentials = biometric.getCredentials();

      expect(credentials).toHaveLength(2);
      expect(credentials[0].type).toBe('fingerprint');
      expect(credentials[1].type).toBe('face');
    });
  });

  describe('configuration', () => {
    it('should update configuration', () => {
      biometric.updateConfig({
        maxAttempts: 5,
        transactionThreshold: '10000000000',
      });

      const config = biometric.getConfig();

      expect(config.maxAttempts).toBe(5);
      expect(config.transactionThreshold).toBe('10000000000');
    });

    it('should emit config-updated event', () => {
      const spy = jest.fn();
      biometric.on('config-updated', spy);

      biometric.updateConfig({ maxAttempts: 5 });

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ maxAttempts: 5 })
      );
    });

    it('should get current configuration', () => {
      const config = biometric.getConfig();

      expect(config).toEqual({
        enabled: true,
        biometricType: 'any',
        requireForTransactions: true,
        fallbackAuth: 'pin',
        maxAttempts: 3,
      });
    });
  });

  describe('enable/disable', () => {
    beforeEach(async () => {
      await biometric.initialize();
    });

    it('should disable biometric authentication', () => {
      const spy = jest.fn();
      biometric.on('disabled', spy);

      biometric.disable();

      expect(biometric.getConfig().enabled).toBe(false);
      expect(spy).toHaveBeenCalled();
    });

    it('should enable biometric authentication', () => {
      biometric.disable();

      const spy = jest.fn();
      biometric.on('enabled', spy);

      biometric.enable();

      expect(biometric.getConfig().enabled).toBe(true);
      expect(spy).toHaveBeenCalled();
    });

    it('should fail authentication when disabled', async () => {
      biometric.disable();

      const result = await biometric.authenticate({ allowFallback: false });

      expect(result.success).toBe(false);
      expect(result.error).toContain('disabled');
    });
  });

  describe('security change detection', () => {
    beforeEach(async () => {
      await biometric.initialize();
    });

    it('should detect when biometric is removed', async () => {
      const spy = jest.fn();
      biometric.on('security-change', spy);

      provider.setEnrolled(false);

      const changed = await biometric.detectSecurityChange();

      expect(changed).toBe(true);
      expect(spy).toHaveBeenCalledWith('biometric-removed');
      expect(biometric.getConfig().enabled).toBe(false);
    });

    it('should return false when no changes detected', async () => {
      const changed = await biometric.detectSecurityChange();

      expect(changed).toBe(false);
    });
  });
});
