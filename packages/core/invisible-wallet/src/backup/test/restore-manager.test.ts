/**
 * @fileoverview Restore Manager Tests
 * @description Tests for backup restoration functionality
 */

import { RestoreManager } from '../services/restore-manager';
import { BackupManager } from '../services/backup-manager';
import { ShamirManager } from '../shamir/shamir-manager';
import { EncryptedBackup, WalletBackupData, BACKUP_VERSION } from '../types/backup-types';

describe('RestoreManager', () => {
  let restoreManager: RestoreManager;
  let backupManager: BackupManager;
  let testWalletData: WalletBackupData;
  const testPassword = 'TestPassword123!';

  beforeEach(() => {
    restoreManager = new RestoreManager();
    backupManager = new BackupManager();

    testWalletData = {
      id: 'test-wallet-id',
      publicKey: 'GBXYZ123456789TESTPUBLICKEY',
      encryptedPrivateKey: 'encrypted-secret-key-data',
      network: 'testnet',
      metadata: { label: 'Test Wallet' },
      createdAt: new Date().toISOString(),
    };
  });

  describe('restoreFromEncryptedJson', () => {
    it('should restore wallet data from encrypted backup', async () => {
      const backup = await backupManager.createEncryptedJsonBackup(
        testWalletData,
        testPassword
      );

      const result = await restoreManager.restoreFromEncryptedJson(
        backup,
        testPassword
      );

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data?.publicKey).toBe(testWalletData.publicKey);
      expect(result.data?.encryptedPrivateKey).toBe(testWalletData.encryptedPrivateKey);
    });

    it('should fail with wrong password', async () => {
      const backup = await backupManager.createEncryptedJsonBackup(
        testWalletData,
        testPassword
      );

      const result = await restoreManager.restoreFromEncryptedJson(
        backup,
        'wrong-password'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should validate checksum when option is enabled', async () => {
      const backup = await backupManager.createEncryptedJsonBackup(
        testWalletData,
        testPassword
      );

      const result = await restoreManager.restoreFromEncryptedJson(
        backup,
        testPassword,
        { validateChecksum: true }
      );

      expect(result.success).toBe(true);
    });

    it('should restore with PBKDF2 encrypted backup', async () => {
      const backup = await backupManager.createEncryptedJsonBackup(
        testWalletData,
        testPassword,
        { format: 'encrypted-json', kdf: 'PBKDF2' }
      );

      const result = await restoreManager.restoreFromEncryptedJson(
        backup,
        testPassword
      );

      expect(result.success).toBe(true);
      expect(result.data?.publicKey).toBe(testWalletData.publicKey);
    });
  });

  describe('restoreFromShamirShares', () => {
    it('should restore from minimum threshold of shares', async () => {
      const backup = await backupManager.createEncryptedJsonBackup(
        testWalletData,
        testPassword
      );

      const shamirManager = new ShamirManager();
      const shamirBackup = await shamirManager.splitSecret(backup, {
        threshold: 2,
        totalShares: 3,
      });

      const result = await restoreManager.restoreFromShamirShares(
        [shamirBackup.shares[0], shamirBackup.shares[1]],
        testPassword
      );

      expect(result.success).toBe(true);
      expect(result.data?.publicKey).toBe(testWalletData.publicKey);
    });

    it('should restore from all shares', async () => {
      const backup = await backupManager.createEncryptedJsonBackup(
        testWalletData,
        testPassword
      );

      const shamirManager = new ShamirManager();
      const shamirBackup = await shamirManager.splitSecret(backup, {
        threshold: 2,
        totalShares: 3,
      });

      const result = await restoreManager.restoreFromShamirShares(
        shamirBackup.shares,
        testPassword
      );

      expect(result.success).toBe(true);
    });

    it('should fail with insufficient shares', async () => {
      const backup = await backupManager.createEncryptedJsonBackup(
        testWalletData,
        testPassword
      );

      const shamirManager = new ShamirManager();
      const shamirBackup = await shamirManager.splitSecret(backup, {
        threshold: 3,
        totalShares: 5,
      });

      const result = await restoreManager.restoreFromShamirShares(
        [shamirBackup.shares[0], shamirBackup.shares[1]],
        testPassword
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient shares');
    });
  });

  describe('autoRestore', () => {
    it('should auto-detect and restore encrypted-json format', async () => {
      const backup = await backupManager.createEncryptedJsonBackup(
        testWalletData,
        testPassword
      );

      const result = await restoreManager.autoRestore(backup, testPassword);

      expect(result.success).toBe(true);
      expect(result.data?.publicKey).toBe(testWalletData.publicKey);
    });

    it('should auto-detect and restore from string', async () => {
      const backup = await backupManager.createEncryptedJsonBackup(
        testWalletData,
        testPassword
      );

      const backupString = JSON.stringify(backup);
      const result = await restoreManager.autoRestore(backupString, testPassword);

      expect(result.success).toBe(true);
      expect(result.data?.publicKey).toBe(testWalletData.publicKey);
    });
  });

  describe('parseBackupString', () => {
    it('should parse valid backup string', async () => {
      const backup = await backupManager.createEncryptedJsonBackup(
        testWalletData,
        testPassword
      );

      const backupString = JSON.stringify(backup);
      const parsed = restoreManager.parseBackupString(backupString);

      expect(parsed).not.toBeNull();
      expect(parsed?.version).toBe(BACKUP_VERSION);
    });

    it('should return null for invalid string', () => {
      const parsed = restoreManager.parseBackupString('invalid-json');
      expect(parsed).toBeNull();
    });
  });

  describe('parseBase64Backup', () => {
    it('should parse valid base64 backup', async () => {
      const backup = await backupManager.createEncryptedJsonBackup(
        testWalletData,
        testPassword
      );

      const base64 = Buffer.from(JSON.stringify(backup)).toString('base64');
      const parsed = restoreManager.parseBase64Backup(base64);

      expect(parsed).not.toBeNull();
      expect(parsed?.version).toBe(BACKUP_VERSION);
    });

    it('should return null for invalid base64', () => {
      const parsed = restoreManager.parseBase64Backup('not-valid-base64!!!');
      expect(parsed).toBeNull();
    });
  });

  describe('validateBackup', () => {
    it('should validate correct backup structure', async () => {
      const backup = await backupManager.createEncryptedJsonBackup(
        testWalletData,
        testPassword
      );

      const result = restoreManager.validateBackup(backup);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should report validation errors', () => {
      const result = restoreManager.validateBackup({
        version: '1.0.0',
        encryptionAlgorithm: 'AES-256-GCM',
        kdf: 'PBKDF2',
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
