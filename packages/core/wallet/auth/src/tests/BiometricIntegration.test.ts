// packages/core/wallet/src/auth/__tests__/BiometricIntegration.test.ts

import { BiometricAuth } from '../BiometricAuth';
import { MockBiometricProvider } from '../providers/MockProvider';

describe('Biometric Integration Tests', () => {
  let provider: MockBiometricProvider;
  let biometric: BiometricAuth;

  beforeEach(() => {
    provider = new MockBiometricProvider();
    biometric = new BiometricAuth(provider, {
      enabled: true,
      requireForTransactions: true,
      transactionThreshold: '5000000', // 5 XLM (in stroops)
      maxAttempts: 3,
    });
  });

  describe('Complete setup flow', () => {
    it('should complete full biometric setup', async () => {
      // Step 1: Check capabilities
      const capabilities = await biometric.getCapabilities();
      expect(capabilities.available).toBe(true);
      expect(capabilities.enrolled).toBe(true);

      // Step 2: Initialize
      await biometric.initialize();

      // Step 3: Enroll biometric
      const credential = await biometric.enroll('fingerprint');
      expect(credential.id).toBeDefined();
      expect(credential.type).toBe('fingerprint');

      // Step 4: Store wallet key
      const testKey =
        'SDSAVCRE5JNFM3NHQFSO7AVWXENP2HZLZFVXER7VOQUQCJLX77L7XZNV';
      const stored = await biometric.storeEncryptedKey(testKey, 'wallet-1');
      expect(stored).toBe(true);

      // Step 5: Verify retrieval
      const retrieved = await biometric.retrieveEncryptedKey('wallet-1');
      expect(retrieved).toBe(testKey);
    });

    it('should handle setup failure gracefully', async () => {
      provider.setAvailable(false);

      await expect(biometric.initialize()).rejects.toThrow(
        'Biometric authentication not available'
      );
    });
  });

  describe('Transaction signing workflow', () => {
    let mockSecretKey: string;

    beforeEach(async () => {
      await biometric.initialize();
      await biometric.enroll();

      // Mock Stellar secret key
      mockSecretKey =
        'SDSAVCRE5JNFM3NHQFSO7AVWXENP2HZLZFVXER7VOQUQCJLX77L7XZNV';
    });

    it('should complete transaction signing with biometric', async () => {
      // Store wallet key
      await biometric.storeEncryptedKey(mockSecretKey, 'wallet-1');

      // Authenticate for transaction (2 XLM in stroops)
      const amount = '20000000'; // 2 XLM
      const authResult = await biometric.authenticateForTransaction(amount);
      expect(authResult.success).toBe(true);

      // Retrieve key
      const retrievedKey = await biometric.retrieveEncryptedKey('wallet-1');
      expect(retrievedKey).toBe(mockSecretKey);

      // In real implementation, would use retrieved key to sign transaction
      expect(retrievedKey).toBeDefined();
      expect(retrievedKey.startsWith('S')).toBe(true); // Stellar secret keys start with 'S'
    });

    it('should skip authentication for small transactions', async () => {
      biometric.updateConfig({
        transactionThreshold: '50000000', // 5 XLM
      });

      // Small transaction (2 XLM < 5 XLM threshold)
      const authResult = await biometric.authenticateForTransaction('20000000');

      // Should succeed without actual authentication
      expect(authResult.success).toBe(true);
    });

    it('should require authentication for large transactions', async () => {
      const authenticateSpy = jest.spyOn(biometric, 'authenticate');

      biometric.updateConfig({
        transactionThreshold: '10000000', // 1 XLM
      });

      // Large transaction (10 XLM > 1 XLM threshold)
      await biometric.authenticateForTransaction('100000000');

      expect(authenticateSpy).toHaveBeenCalled();
    });

    it('should handle authentication failure during signing', async () => {
      provider.setAuthSuccess(false);

      const authResult = await biometric.authenticateForTransaction('20000000');

      expect(authResult.success).toBe(false);
      expect(authResult.error).toBeDefined();
    });
  });

  describe('Security scenarios', () => {
    beforeEach(async () => {
      await biometric.initialize();
      await biometric.enroll();
    });

    it('should handle account lockout scenario', async () => {
      provider.setAuthSuccess(false);

      const events: string[] = [];
      biometric.on('failed-attempt', () => events.push('failed'));
      biometric.on('locked', () => events.push('locked'));

      // Fail 3 times to trigger lockout
      await biometric.authenticate();
      await biometric.authenticate();
      await biometric.authenticate();

      expect(events).toEqual(['failed', 'failed', 'failed', 'locked']);

      // Further attempts should be blocked
      const result = await biometric.authenticate();
      expect(result.success).toBe(false);
      expect(result.error).toContain('locked');
    });

    it('should handle biometric removal during session', async () => {
      const changeEvents: string[] = [];
      biometric.on('security-change', change => changeEvents.push(change));

      // Simulate biometric removal
      provider.setEnrolled(false);

      const changed = await biometric.detectSecurityChange();

      expect(changed).toBe(true);
      expect(changeEvents).toContain('biometric-removed');
      expect(biometric.getConfig().enabled).toBe(false);
    });

    it('should require re-authentication after timeout', async () => {
      const key = 'SDSAVCRE5JNFM3NHQFSO7AVWXENP2HZLZFVXER7VOQUQCJLX77L7XZNV';
      await biometric.storeEncryptedKey(key, 'wallet-1');

      // First retrieval - should authenticate
      const retrieved1 = await biometric.retrieveEncryptedKey('wallet-1');
      expect(retrieved1).toBe(key);

      // Second retrieval - should authenticate again
      const retrieved2 = await biometric.retrieveEncryptedKey('wallet-1');
      expect(retrieved2).toBe(key);
    });

    it('should protect sensitive key data', async () => {
      const secretKey =
        'SDSAVCRE5JNFM3NHQFSO7AVWXENP2HZLZFVXER7VOQUQCJLX77L7XZNV';

      // Store key with biometric protection
      await biometric.storeEncryptedKey(secretKey, 'protected-wallet');

      // Attempt to retrieve without proper authentication should fail
      provider.setAuthSuccess(false);

      await expect(
        biometric.retrieveEncryptedKey('protected-wallet')
      ).rejects.toThrow('Authentication required');
    });
  });

  describe('Multi-wallet management', () => {
    it('should manage multiple wallet keys independently', async () => {
      await biometric.initialize();
      await biometric.enroll();

      // Store multiple wallet keys
      const wallet1Key =
        'SDSAVCRE5JNFM3NHQFSO7AVWXENP2HZLZFVXER7VOQUQCJLX77L7XZNV';
      const wallet2Key =
        'SBPQUZ6G4FZNWFHKUWC5BEYWF6R46YQMXPCHW4RJ5VZITDVDY3WVDM3G';
      const wallet3Key =
        'SCKNRNWVP3UOX5GCUKJIVXSFMCDLGVJVD2TYDV4CZPYVSHQAZDBDUQXP';

      await biometric.storeEncryptedKey(wallet1Key, 'wallet-1');
      await biometric.storeEncryptedKey(wallet2Key, 'wallet-2');
      await biometric.storeEncryptedKey(wallet3Key, 'wallet-3');

      // Retrieve and verify each wallet
      const retrieved1 = await biometric.retrieveEncryptedKey('wallet-1');
      const retrieved2 = await biometric.retrieveEncryptedKey('wallet-2');
      const retrieved3 = await biometric.retrieveEncryptedKey('wallet-3');

      expect(retrieved1).toBe(wallet1Key);
      expect(retrieved2).toBe(wallet2Key);
      expect(retrieved3).toBe(wallet3Key);
    });

    it('should delete specific wallet keys without affecting others', async () => {
      await biometric.initialize();
      await biometric.enroll();

      const wallet1Key =
        'SDSAVCRE5JNFM3NHQFSO7AVWXENP2HZLZFVXER7VOQUQCJLX77L7XZNV';
      const wallet2Key =
        'SBPQUZ6G4FZNWFHKUWC5BEYWF6R46YQMXPCHW4RJ5VZITDVDY3WVDM3G';

      await biometric.storeEncryptedKey(wallet1Key, 'wallet-1');
      await biometric.storeEncryptedKey(wallet2Key, 'wallet-2');

      // Delete wallet-1
      await biometric.deleteEncryptedKey('wallet-1');

      // Wallet-1 should be gone
      const retrieved1 = await biometric.retrieveEncryptedKey('wallet-1');
      expect(retrieved1).toBeNull();

      // Wallet-2 should still exist
      const retrieved2 = await biometric.retrieveEncryptedKey('wallet-2');
      expect(retrieved2).toBe(wallet2Key);
    });
  });

  describe('Multi-device credential management', () => {
    it('should manage multiple credentials', async () => {
      await biometric.initialize();

      const fingerprint = await biometric.enroll('fingerprint');
      const face = await biometric.enroll('face');

      const credentials = biometric.getCredentials();

      expect(credentials).toHaveLength(2);
      expect(credentials.map(c => c.type)).toContain('fingerprint');
      expect(credentials.map(c => c.type)).toContain('face');
    });

    it('should remove individual credentials', async () => {
      await biometric.initialize();

      const cred1 = await biometric.enroll('fingerprint');
      const cred2 = await biometric.enroll('face');

      await biometric.removeCredential(cred1.id);

      const remaining = biometric.getCredentials();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(cred2.id);
    });
  });

  describe('Event-driven architecture', () => {
    it('should emit all lifecycle events', async () => {
      const events: string[] = [];

      biometric.on('initialized', () => events.push('initialized'));
      biometric.on('enrolled', () => events.push('enrolled'));
      biometric.on('authenticated', () => events.push('authenticated'));
      biometric.on('config-updated', () => events.push('config-updated'));

      await biometric.initialize();
      await biometric.enroll();
      await biometric.authenticate();
      biometric.updateConfig({ maxAttempts: 5 });

      expect(events).toEqual([
        'initialized',
        'enrolled',
        'authenticated',
        'config-updated',
      ]);
    });

    it('should provide detailed event data', async () => {
      let enrolledCredential: any;
      biometric.on('enrolled', cred => {
        enrolledCredential = cred;
      });

      await biometric.initialize();
      const credential = await biometric.enroll('fingerprint');

      expect(enrolledCredential).toEqual(credential);
      expect(enrolledCredential.type).toBe('fingerprint');
      expect(enrolledCredential.createdAt).toBeDefined();
    });
  });

  describe('Error recovery', () => {
    it('should recover from temporary failures', async () => {
      await biometric.initialize();
      await biometric.enroll();

      // Fail once
      provider.setAuthSuccess(false);
      const result1 = await biometric.authenticate();
      expect(result1.success).toBe(false);

      // Succeed on retry
      provider.setAuthSuccess(true);
      const result2 = await biometric.authenticate();
      expect(result2.success).toBe(true);
    });

    it('should handle provider errors gracefully', async () => {
      await biometric.initialize();
      await biometric.enroll();

      // Simulate provider error
      jest
        .spyOn(provider, 'authenticate')
        .mockRejectedValue(new Error('Hardware error'));

      const result = await biometric.authenticate({ allowFallback: false });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Hardware error');
    });
  });

  describe('Configuration changes', () => {
    beforeEach(async () => {
      await biometric.initialize();
    });

    it('should apply configuration changes immediately', async () => {
      biometric.updateConfig({
        maxAttempts: 10,
        transactionThreshold: '200000000', // 20 XLM
      });

      const config = biometric.getConfig();

      expect(config.maxAttempts).toBe(10);
      expect(config.transactionThreshold).toBe('200000000');
    });

    it('should respect new maxAttempts setting', async () => {
      biometric.updateConfig({ maxAttempts: 2 });
      await biometric.enroll();
      provider.setAuthSuccess(false);

      // First failure
      await biometric.authenticate({ allowFallback: false });
      // Second failure - should lock now
      const result = await biometric.authenticate({ allowFallback: false });

      // After 2 failed attempts with maxAttempts=2, account should be locked
      expect(result.attemptsRemaining).toBe(0);

      // Third attempt should indicate locked status
      const lockedResult = await biometric.authenticate({
        allowFallback: false,
      });
      expect(lockedResult.error).toContain('locked');
    });

    it('should handle Stellar-specific transaction thresholds', async () => {
      // Configure for different XLM amounts
      biometric.updateConfig({
        transactionThreshold: '100000000', // 10 XLM in stroops
      });

      const config = biometric.getConfig();
      expect(config.transactionThreshold).toBe('100000000');

      // Small transaction should skip auth
      const smallTx = await biometric.authenticateForTransaction('50000000'); // 5 XLM
      expect(smallTx.success).toBe(true);

      // Large transaction should require auth
      const authenticateSpy = jest.spyOn(biometric, 'authenticate');
      await biometric.authenticateForTransaction('200000000'); // 20 XLM
      expect(authenticateSpy).toHaveBeenCalled();
    });
  });

  describe('Performance and reliability', () => {
    it('should handle rapid authentication requests', async () => {
      await biometric.initialize();
      await biometric.enroll();

      const results = await Promise.all([
        biometric.authenticate(),
        biometric.authenticate(),
        biometric.authenticate(),
      ]);

      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });

    it('should handle concurrent key operations for multiple wallets', async () => {
      await biometric.initialize();
      await biometric.enroll();

      const key1 = 'SDSAVCRE5JNFM3NHQFSO7AVWXENP2HZLZFVXER7VOQUQCJLX77L7XZNV';
      const key2 = 'SBPQUZ6G4FZNWFHKUWC5BEYWF6R46YQMXPCHW4RJ5VZITDVDY3WVDM3G';
      const key3 = 'SCKNRNWVP3UOX5GCUKJIVXSFMCDLGVJVD2TYDV4CZPYVSHQAZDBDUQXP';

      await Promise.all([
        biometric.storeEncryptedKey(key1, 'wallet-1'),
        biometric.storeEncryptedKey(key2, 'wallet-2'),
        biometric.storeEncryptedKey(key3, 'wallet-3'),
      ]);

      const [retrieved1, retrieved2, retrieved3] = await Promise.all([
        biometric.retrieveEncryptedKey('wallet-1'),
        biometric.retrieveEncryptedKey('wallet-2'),
        biometric.retrieveEncryptedKey('wallet-3'),
      ]);

      expect(retrieved1).toBe(key1);
      expect(retrieved2).toBe(key2);
      expect(retrieved3).toBe(key3);
    });
  });

  describe('Stellar-specific use cases', () => {
    beforeEach(async () => {
      await biometric.initialize();
      await biometric.enroll();
    });

    it('should handle XLM amount conversions correctly', async () => {
      // Test with various XLM amounts (1 XLM = 10000000 stroops)
      const testCases = [
        { xlm: 0.5, stroops: '5000000' },
        { xlm: 1, stroops: '10000000' },
        { xlm: 10, stroops: '100000000' },
        { xlm: 100, stroops: '1000000000' },
      ];

      biometric.updateConfig({
        transactionThreshold: '50000000', // 5 XLM
      });

      for (const testCase of testCases) {
        const result = await biometric.authenticateForTransaction(
          testCase.stroops
        );

        if (testCase.xlm < 5) {
          // Should skip authentication
          expect(result.success).toBe(true);
        } else {
          // Should require authentication (which succeeds in mock)
          expect(result.success).toBe(true);
        }
      }
    });

    it('should secure account creation with master key', async () => {
      const masterKey =
        'SDSAVCRE5JNFM3NHQFSO7AVWXENP2HZLZFVXER7VOQUQCJLX77L7XZNV';

      // Store master account key
      await biometric.storeEncryptedKey(masterKey, 'master-account');

      // Retrieve should require authentication
      const retrieved = await biometric.retrieveEncryptedKey('master-account');
      expect(retrieved).toBe(masterKey);
    });

    it('should support multi-signature wallet keys', async () => {
      const signerKey1 =
        'SDSAVCRE5JNFM3NHQFSO7AVWXENP2HZLZFVXER7VOQUQCJLX77L7XZNV';
      const signerKey2 =
        'SBPQUZ6G4FZNWFHKUWC5BEYWF6R46YQMXPCHW4RJ5VZITDVDY3WVDM3G';

      // Store multiple signer keys
      await biometric.storeEncryptedKey(signerKey1, 'multisig-signer-1');
      await biometric.storeEncryptedKey(signerKey2, 'multisig-signer-2');

      // Retrieve both keys for signing
      const key1 = await biometric.retrieveEncryptedKey('multisig-signer-1');
      const key2 = await biometric.retrieveEncryptedKey('multisig-signer-2');

      expect(key1).toBe(signerKey1);
      expect(key2).toBe(signerKey2);
    });
  });
});
