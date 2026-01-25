/**
 * @fileoverview Backup Manager Tests
 * @description Tests for backup creation functionality
 */

import { BackupManager, CreateBackupOptions } from '../services/backup-manager';
import { EncryptedBackup, WalletBackupData, BACKUP_VERSION } from '../types/backup-types';
import { InvisibleWallet, BackupStatus } from '../../types/wallet.types';

describe('BackupManager', () => {
  let manager: BackupManager;
  let testWallet: InvisibleWallet;
  let testWalletData: WalletBackupData;
  const testPassword = 'TestPassword123!';

  beforeEach(() => {
    manager = new BackupManager();

    testWallet = {
      id: 'test-wallet-id',
      userId: 'test-user-id',
      publicKey: 'GBXYZ123456789TESTPUBLICKEY',
      encryptedPrivateKey: 'encrypted-secret-key-data',
      network: { network: 'testnet', horizonUrl: 'https://horizon-testnet.stellar.org', passphrase: 'Test SDF Network ; September 2015' },
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: { label: 'Test Wallet' },
      backupStatus: {
        isBackedUp: false,
        backupMethod: 'none',
      } as BackupStatus,
    };

    testWalletData = {
      id: testWallet.id,
      publicKey: testWallet.publicKey,
      encryptedPrivateKey: testWallet.encryptedPrivateKey,
      network: 'testnet',
      metadata: testWallet.metadata,
      createdAt: testWallet.createdAt.toISOString(),
    };
  });

  describe('createEncryptedJsonBackup', () => {
    it('should create encrypted JSON backup with default settings', async () => {
      const backup = await manager.createEncryptedJsonBackup(
        testWalletData,
        testPassword
      );

      expect(backup.version).toBe(BACKUP_VERSION);
      expect(backup.encryptionAlgorithm).toBe('AES-256-GCM');
      expect(backup.kdf).toBe('Argon2');
      expect(backup.ciphertext).toBeDefined();
      expect(backup.iv).toBeDefined();
      expect(backup.authTag).toBeDefined();
      expect(backup.metadata).toBeDefined();
      expect(backup.metadata.created).toBeDefined();
      expect(backup.metadata.checksum).toBeDefined();
    });

    it('should create backup with PBKDF2', async () => {
      const backup = await manager.createEncryptedJsonBackup(
        testWalletData,
        testPassword,
        { format: 'encrypted-json', kdf: 'PBKDF2' }
      );

      expect(backup.kdf).toBe('PBKDF2');
      expect(backup.kdfParams).toHaveProperty('iterations');
    });

    it('should create backup with Argon2', async () => {
      const backup = await manager.createEncryptedJsonBackup(
        testWalletData,
        testPassword,
        { format: 'encrypted-json', kdf: 'Argon2' }
      );

      expect(backup.kdf).toBe('Argon2');
      expect(backup.kdfParams).toHaveProperty('memoryCost');
      expect(backup.kdfParams).toHaveProperty('timeCost');
    });

    it('should include label in metadata when provided', async () => {
      const backup = await manager.createEncryptedJsonBackup(
        testWalletData,
        testPassword,
        { format: 'encrypted-json', kdf: 'Argon2', label: 'My Backup' }
      );

      expect((backup.metadata as any).label).toBe('My Backup');
    });
  });

  describe('createBackup', () => {
    it('should create encrypted-json backup', async () => {
      const options: CreateBackupOptions = {
        format: 'encrypted-json',
        kdf: 'Argon2',
      };

      const backup = await manager.createBackup(testWallet, testPassword, options);

      expect((backup as EncryptedBackup).version).toBe(BACKUP_VERSION);
    });

    it('should create QR code backup', async () => {
      const options: CreateBackupOptions = {
        format: 'qr-code',
        kdf: 'Argon2',
      };

      const backup = await manager.createBackup(testWallet, testPassword, options);

      expect((backup as any).qrDataUrl).toBeDefined();
      expect((backup as any).qrDataUrl).toContain('data:image/');
    });

    it('should create paper wallet backup', async () => {
      const options: CreateBackupOptions = {
        format: 'paper-wallet',
        kdf: 'Argon2',
      };

      const backup = await manager.createBackup(testWallet, testPassword, options);

      expect((backup as any).html).toBeDefined();
      expect((backup as any).html).toContain('<!DOCTYPE html>');
    });

    it('should create mnemonic backup', async () => {
      const options: CreateBackupOptions = {
        format: 'mnemonic',
        kdf: 'Argon2',
        mnemonicStrength: 256,
      };

      const backup = await manager.createBackup(testWallet, testPassword, options);

      expect((backup as any).mnemonic).toBeDefined();
      expect((backup as any).derivationPath).toBeDefined();
    });
  });

  describe('createShamirBackup', () => {
    it('should create Shamir backup with correct threshold', async () => {
      const backup = await manager.createShamirBackup(
        testWallet,
        testPassword,
        { threshold: 2, totalShares: 3 }
      );

      expect(backup.threshold).toBe(2);
      expect(backup.total).toBe(3);
      expect(backup.shares).toHaveLength(3);
    });

    it('should create unique shares', async () => {
      const backup = await manager.createShamirBackup(
        testWallet,
        testPassword,
        { threshold: 3, totalShares: 5 }
      );

      const shareData = backup.shares.map(s => s.data);
      const uniqueShares = new Set(shareData);
      expect(uniqueShares.size).toBe(5);
    });
  });

  describe('exportBackupAsString', () => {
    it('should export backup as JSON string', async () => {
      const backup = await manager.createEncryptedJsonBackup(
        testWalletData,
        testPassword
      );

      const exported = manager.exportBackupAsString(backup);

      expect(typeof exported).toBe('string');
      expect(() => JSON.parse(exported)).not.toThrow();
    });
  });

  describe('exportBackupAsBase64', () => {
    it('should export backup as base64 string', async () => {
      const backup = await manager.createEncryptedJsonBackup(
        testWalletData,
        testPassword
      );

      const exported = manager.exportBackupAsBase64(backup);

      expect(typeof exported).toBe('string');
      expect(() => Buffer.from(exported, 'base64')).not.toThrow();
    });
  });

  describe('validateBackup', () => {
    it('should validate correct backup', async () => {
      const backup = await manager.createEncryptedJsonBackup(
        testWalletData,
        testPassword
      );

      expect(manager.validateBackup(backup)).toBe(true);
    });

    it('should reject invalid backup', () => {
      expect(manager.validateBackup({ invalid: 'data' })).toBe(false);
    });
  });

  describe('getBackupInfo', () => {
    it('should return backup information', async () => {
      const backup = await manager.createEncryptedJsonBackup(
        testWalletData,
        testPassword
      );

      const info = manager.getBackupInfo(backup);

      expect(info.version).toBe(BACKUP_VERSION);
      expect(info.encryption).toBe('AES-256-GCM');
      expect(info.kdf).toBe('Argon2');
      expect(info.created).toBeDefined();
      expect(info.checksum).toBeDefined();
    });
  });
});
