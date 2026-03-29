/**
 * @fileoverview Shamir Secret Sharing Tests
 * @description Tests for Shamir secret sharing functionality
 */

import { ShamirManager } from '../shamir/shamir-manager.js';
import { BackupManager } from '../services/backup-manager.js';
import { EncryptedBackup, WalletBackupData, ShamirShare } from '../types/backup-types.js';

describe('ShamirManager', () => {
  let shamirManager: ShamirManager;
  let backupManager: BackupManager;
  let testBackup: EncryptedBackup;
  const testPassword = 'TestPassword123!';

  beforeEach(async () => {
    shamirManager = new ShamirManager();
    backupManager = new BackupManager();

    const testWalletData: WalletBackupData = {
      id: 'test-wallet-id',
      publicKey: 'GBXYZ123456789TESTPUBLICKEY',
      encryptedPrivateKey: 'encrypted-secret-key-data',
      network: 'testnet',
      metadata: { label: 'Test Wallet' },
      createdAt: new Date().toISOString(),
    };

    testBackup = await backupManager.createEncryptedJsonBackup(
      testWalletData,
      testPassword
    );
  });

  describe('splitSecret', () => {
    it('should split backup into specified number of shares', async () => {
      const shamirBackup = await shamirManager.splitSecret(testBackup, {
        threshold: 2,
        totalShares: 3,
      });

      expect(shamirBackup.shares).toHaveLength(3);
      expect(shamirBackup.threshold).toBe(2);
      expect(shamirBackup.total).toBe(3);
    });

    it('should create unique shares', async () => {
      const shamirBackup = await shamirManager.splitSecret(testBackup, {
        threshold: 3,
        totalShares: 5,
      });

      const uniqueData = new Set(shamirBackup.shares.map(s => s.data));
      expect(uniqueData.size).toBe(5);
    });

    it('should assign sequential indices', async () => {
      const shamirBackup = await shamirManager.splitSecret(testBackup, {
        threshold: 2,
        totalShares: 4,
      });

      const indices = shamirBackup.shares.map(s => s.index);
      expect(indices).toEqual([1, 2, 3, 4]);
    });

    it('should include checksum for each share', async () => {
      const shamirBackup = await shamirManager.splitSecret(testBackup, {
        threshold: 2,
        totalShares: 3,
      });

      for (const share of shamirBackup.shares) {
        expect(share.checksum).toBeDefined();
        expect(typeof share.checksum).toBe('string');
        expect(share.checksum.length).toBe(8);
      }
    });

    it('should throw error if threshold < 2', async () => {
      await expect(
        shamirManager.splitSecret(testBackup, {
          threshold: 1,
          totalShares: 3,
        })
      ).rejects.toThrow('Threshold must be at least 2');
    });

    it('should throw error if threshold > totalShares', async () => {
      await expect(
        shamirManager.splitSecret(testBackup, {
          threshold: 5,
          totalShares: 3,
        })
      ).rejects.toThrow('Threshold cannot exceed total shares');
    });
  });

  describe('combineShares', () => {
    it('should reconstruct backup from minimum threshold shares', async () => {
      const shamirBackup = await shamirManager.splitSecret(testBackup, {
        threshold: 2,
        totalShares: 3,
      });

      const reconstructed = await shamirManager.combineShares([
        shamirBackup.shares[0],
        shamirBackup.shares[1],
      ]);

      expect(reconstructed.version).toBe(testBackup.version);
      expect(reconstructed.ciphertext).toBe(testBackup.ciphertext);
    });

    it('should reconstruct from any combination of threshold shares', async () => {
      const shamirBackup = await shamirManager.splitSecret(testBackup, {
        threshold: 2,
        totalShares: 3,
      });

      const combinations = [
        [shamirBackup.shares[0], shamirBackup.shares[1]],
        [shamirBackup.shares[0], shamirBackup.shares[2]],
        [shamirBackup.shares[1], shamirBackup.shares[2]],
      ];

      for (const combination of combinations) {
        const reconstructed = await shamirManager.combineShares(combination);
        expect(reconstructed.ciphertext).toBe(testBackup.ciphertext);
      }
    });

    it('should reconstruct from all shares', async () => {
      const shamirBackup = await shamirManager.splitSecret(testBackup, {
        threshold: 2,
        totalShares: 3,
      });

      const reconstructed = await shamirManager.combineShares(shamirBackup.shares);

      expect(reconstructed.ciphertext).toBe(testBackup.ciphertext);
    });

    it('should throw error with insufficient shares', async () => {
      const shamirBackup = await shamirManager.splitSecret(testBackup, {
        threshold: 3,
        totalShares: 5,
      });

      await expect(
        shamirManager.combineShares([shamirBackup.shares[0], shamirBackup.shares[1]])
      ).rejects.toThrow('Insufficient shares');
    });

    it('should throw error with no shares', async () => {
      await expect(shamirManager.combineShares([])).rejects.toThrow(
        'No shares provided'
      );
    });

    it('should throw error with duplicate shares', async () => {
      const shamirBackup = await shamirManager.splitSecret(testBackup, {
        threshold: 2,
        totalShares: 3,
      });

      await expect(
        shamirManager.combineShares([shamirBackup.shares[0], shamirBackup.shares[0]])
      ).rejects.toThrow('Duplicate share indices');
    });
  });

  describe('validateShare', () => {
    it('should validate correct share', async () => {
      const shamirBackup = await shamirManager.splitSecret(testBackup, {
        threshold: 2,
        totalShares: 3,
      });

      expect(shamirManager.validateShare(shamirBackup.shares[0])).toBe(true);
    });

    it('should reject share with invalid index', () => {
      const invalidShare: ShamirShare = {
        index: 0,
        data: 'dGVzdA==',
        threshold: 2,
        total: 3,
        checksum: '12345678',
      };

      expect(shamirManager.validateShare(invalidShare)).toBe(false);
    });

    it('should reject share with invalid checksum', async () => {
      const shamirBackup = await shamirManager.splitSecret(testBackup, {
        threshold: 2,
        totalShares: 3,
      });

      const invalidShare = {
        ...shamirBackup.shares[0],
        checksum: 'wrongchecksum',
      };

      expect(shamirManager.validateShare(invalidShare)).toBe(false);
    });

    it('should reject share with empty data', () => {
      const invalidShare: ShamirShare = {
        index: 1,
        data: '',
        threshold: 2,
        total: 3,
        checksum: '12345678',
      };

      expect(shamirManager.validateShare(invalidShare)).toBe(false);
    });
  });

  describe('createShareCard', () => {
    it('should create valid share card', async () => {
      const shamirBackup = await shamirManager.splitSecret(testBackup, {
        threshold: 2,
        totalShares: 3,
      });

      const card = shamirManager.createShareCard(shamirBackup.shares[0]);

      expect(typeof card).toBe('string');
      const parsed = JSON.parse(card);
      expect(parsed.type).toBe('shamir-share');
      expect(parsed.share).toBeDefined();
    });
  });

  describe('parseShareCard', () => {
    it('should parse valid share card', async () => {
      const shamirBackup = await shamirManager.splitSecret(testBackup, {
        threshold: 2,
        totalShares: 3,
      });

      const card = shamirManager.createShareCard(shamirBackup.shares[0]);
      const parsed = shamirManager.parseShareCard(card);

      expect(parsed.index).toBe(shamirBackup.shares[0].index);
      expect(parsed.data).toBe(shamirBackup.shares[0].data);
    });

    it('should throw error for invalid card', () => {
      expect(() => shamirManager.parseShareCard('invalid')).toThrow(
        'Failed to parse share card'
      );
    });
  });

  describe('getSharesForDistribution', () => {
    it('should return shares with instructions', async () => {
      const shamirBackup = await shamirManager.splitSecret(testBackup, {
        threshold: 2,
        totalShares: 3,
      });

      const distribution = shamirManager.getSharesForDistribution(shamirBackup);

      expect(distribution).toHaveLength(3);
      for (const item of distribution) {
        expect(item.share).toBeDefined();
        expect(item.instructions).toBeDefined();
        expect(item.instructions).toContain('SHAMIR SECRET SHARE');
      }
    });
  });
});
