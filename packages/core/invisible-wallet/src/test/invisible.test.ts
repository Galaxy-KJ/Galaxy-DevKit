// @ts-nocheck

/**
 * @fileoverview Tests for Invisible Wallet Service
 * @description Comprehensive test suite for InvisibleWalletService
 */

import { InvisibleWalletService } from '../services/invisible-wallet.service';
import { KeyManagementService } from '../services/key-managment.service';
import { StellarService } from '../../../stellar-sdk/src/services/stellar-service';
import { NetworkUtils } from '../../../stellar-sdk/src/utils/network-utils';
import { WalletEventType } from '../types/wallet.types';
import { NetworkConfig } from '../../../stellar-sdk/src/types/stellar-types';

// Mock dependencies
jest.mock('../services/key-managment.service');
jest.mock('../../../stellar-sdk/src/services/stellar-service');
jest.mock('../../../stellar-sdk/src/utils/network-utils');
jest.mock('../utils/encryption.utils');

describe('InvisibleWalletService', () => {
  let service: InvisibleWalletService;
  let mockKeyManagement: jest.Mocked<KeyManagementService>;
  let mockStellarService: jest.Mocked<StellarService>;
  let mockSupabase: any;

  const mockNetworkConfig: NetworkConfig = {
    network: 'testnet',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015',
  };

  const mockKeypair = {
    publicKey: 'GTEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    secretKey: 'STEST123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  };

  const mockWalletData = {
    id: 'iwallet_123_abc',
    user_id: 'user_123',
    public_key: mockKeypair.publicKey,
    encrypted_private_key: 'encrypted_key_data',
    network: mockNetworkConfig,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: { name: 'My Wallet', isDefault: true },
    backup_status: {
      isBackedUp: false,
      backupMethod: 'none',
    },
  };

  const mockSession = {
    id: 'session_123',
    walletId: 'iwallet_123_abc',
    userId: 'user_123',
    token: 'session_token_123',
    expiresAt: new Date(Date.now() + 3600000),
    createdAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Create chainable Supabase mock
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
    };

    // Setup KeyManagementService mock
    mockKeyManagement = {
      generateKeypair: jest.fn().mockReturnValue(mockKeypair),
      storePrivateKey: jest.fn().mockReturnValue('encrypted_key_data'),
      createSession: jest.fn().mockResolvedValue(mockSession),
      verifyPassword: jest.fn().mockReturnValue(true),
      validateSession: jest.fn().mockResolvedValue({ valid: true }),
      revokeSession: jest.fn().mockResolvedValue(undefined),
      revokeAllWalletSessions: jest.fn().mockResolvedValue(undefined),
      deriveKeypairFromMnemonic: jest.fn().mockResolvedValue(mockKeypair),
      changePassword: jest.fn().mockResolvedValue(undefined),
      exportWalletBackup: jest.fn().mockReturnValue('backup_data'),
    } as any;

    (KeyManagementService as jest.Mock).mockImplementation(
      () => mockKeyManagement
    );

    // Setup StellarService mock
    mockStellarService = {
      getAccountInfo: jest.fn().mockResolvedValue({
        id: mockKeypair.publicKey,
        sequence: '123',
        balances: [],
      }),
      getBalance: jest.fn().mockResolvedValue({
        balance: '100',
        asset: 'XLM',
      }),
      sendPayment: jest.fn().mockResolvedValue({
        hash: 'tx_hash_123',
        ledger: 12345,
        success: true,
      }),
      getTransactionHistory: jest.fn().mockResolvedValue([]),
    } as any;

    (StellarService as jest.Mock).mockImplementation(() => mockStellarService);

    // Create service instance
    service = new InvisibleWalletService(mockNetworkConfig);

    // Inject mocked supabase
    (service as any).supabase = mockSupabase;
  });

  describe('createWallet', () => {
    it('should create a new wallet successfully', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null });

      const network = {
        network: 'testnet' as const,
        horizonUrl: 'https://horizon-testnet.stellar.org',
        passphrase: 'Test SDF Network ; September 2015',
      };

      const config = {
        userId: 'user_123',
        email: 'test@example.com',
        network: network,
      };

      const result = await service.createWallet(config, 'Password123!');

      expect(result).toHaveProperty('wallet');
      expect(result).toHaveProperty('session');
      expect(result.wallet.publicKey).toBe(mockKeypair.publicKey);
      expect(mockKeyManagement.generateKeypair).toHaveBeenCalled();
      expect(mockKeyManagement.storePrivateKey).toHaveBeenCalledWith(
        mockKeypair.secretKey,
        'Password123!'
      );
      expect(mockSupabase.from).toHaveBeenCalledWith('invisible_wallets');
      expect(mockSupabase.insert).toHaveBeenCalled();
    });

    it('should throw error if database insert fails', async () => {
      mockSupabase.insert.mockResolvedValue({
        error: { message: 'Database error' },
      });

      const network = {
        network: 'testnet' as const,
        horizonUrl: 'https://horizon-testnet.stellar.org',
        passphrase: 'Test SDF Network ; September 2015',
      };

      const config = {
        userId: 'user_123',
        email: 'test@example.com',
        network: network,
      };

      await expect(
        service.createWallet(config, 'Password123!')
      ).rejects.toThrow('Failed to save wallet: Database error');
    });

    it('should include device info when provided', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null });

      const network = {
        network: 'testnet' as const,
        horizonUrl: 'https://horizon-testnet.stellar.org',
        passphrase: 'Test SDF Network ; September 2015',
      };

      const config = {
        userId: 'user_123',
        email: 'test@example.com',
        network: network,
      };

      const deviceInfo = {
        deviceId: 'device_123',
        platform: 'web',
        userAgent: 'Mozilla/5.0',
      };

      await service.createWallet(config, 'Password123!', deviceInfo);

      expect(mockKeyManagement.createSession).toHaveBeenCalledWith(
        expect.any(String),
        'user_123',
        deviceInfo
      );
    });
  });

  describe('createWalletFromMnemonic', () => {
    it('should create wallet from mnemonic successfully', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null });

      const network = {
        network: 'testnet' as const,
        horizonUrl: 'https://horizon-testnet.stellar.org',
        passphrase: 'Test SDF Network ; September 2015',
      };

      const config = {
        userId: 'user_123',
        email: 'test@example.com',
        network: network,
      };

      const mnemonic =
        'word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12';

      const result = await service.createWalletFromMnemonic(
        config,
        mnemonic,
        'Password123!'
      );

      expect(result).toHaveProperty('wallet');
      expect(result.wallet.backupStatus.isBackedUp).toBe(true);
      expect(mockKeyManagement.deriveKeypairFromMnemonic).toHaveBeenCalledWith(
        mnemonic
      );
      expect(mockKeyManagement.storePrivateKey).toHaveBeenCalledTimes(2);
    });

    it('should throw error for invalid mnemonic', async () => {
      mockKeyManagement.deriveKeypairFromMnemonic.mockRejectedValue(
        new Error('Invalid mnemonic')
      );

      const network = {
        network: 'testnet' as const,
        horizonUrl: 'https://horizon-testnet.stellar.org',
        passphrase: 'Test SDF Network ; September 2015',
      };

      const config = {
        userId: 'user_123',
        email: 'test@example.com',
        network: network,
      };

      await expect(
        service.createWalletFromMnemonic(config, 'invalid', 'Password123!')
      ).rejects.toThrow('Failed to create wallet from mnemonic');
    });
  });

  describe('lockWallet', () => {
    it('should lock wallet with session token', async () => {
      mockSupabase.single.mockResolvedValue({
        data: mockWalletData,
        error: null,
      });

      await service.lockWallet('iwallet_123_abc', 'session_token_123');

      expect(mockKeyManagement.revokeSession).toHaveBeenCalledWith(
        'session_token_123'
      );
    });

    it('should revoke all sessions if no token provided', async () => {
      mockSupabase.single.mockResolvedValue({
        data: mockWalletData,
        error: null,
      });

      await service.lockWallet('iwallet_123_abc');

      expect(mockKeyManagement.revokeAllWalletSessions).toHaveBeenCalledWith(
        'iwallet_123_abc'
      );
    });
  });

  describe('getWalletById', () => {
    it('should retrieve wallet by ID', async () => {
      mockSupabase.single.mockResolvedValue({
        data: mockWalletData,
        error: null,
      });

      const wallet = await service.getWalletById('iwallet_123_abc');

      expect(wallet).not.toBeNull();
      expect(wallet?.id).toBe('iwallet_123_abc');
      expect(wallet?.publicKey).toBe(mockKeypair.publicKey);
    });

    it('should return null for non-existent wallet', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      });

      const wallet = await service.getWalletById('nonexistent');

      expect(wallet).toBeNull();
    });
  });

  describe('getUserWallets', () => {
    it('should retrieve all user wallets', async () => {
      mockSupabase.order.mockResolvedValue({
        data: [mockWalletData, { ...mockWalletData, id: 'iwallet_456_def' }],
        error: null,
      });

      const wallets = await service.getUserWallets('user_123');

      expect(wallets).toHaveLength(2);
      expect(mockSupabase.eq).toHaveBeenCalledWith('user_id', 'user_123');
      expect(mockSupabase.order).toHaveBeenCalledWith('created_at', {
        ascending: false,
      });
    });

    it('should return empty array on error', async () => {
      mockSupabase.order.mockResolvedValue({
        data: null,
        error: { message: 'Error' },
      });

      const wallets = await service.getUserWallets('user_123');

      expect(wallets).toEqual([]);
    });
  });

  describe('getAccountInfo', () => {
    it('should get account info for wallet', async () => {
      mockSupabase.single.mockResolvedValue({
        data: mockWalletData,
        error: null,
      });

      const accountInfo = await service.getAccountInfo('iwallet_123_abc');

      expect(mockStellarService.getAccountInfo).toHaveBeenCalledWith(
        mockKeypair.publicKey
      );
      expect(accountInfo).toHaveProperty('id');
    });

    it('should throw error if wallet not found', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      });

      await expect(service.getAccountInfo('nonexistent')).rejects.toThrow(
        'Wallet not found'
      );
    });
  });

  describe('getBalance', () => {
    it('should get wallet balance', async () => {
      mockSupabase.single.mockResolvedValue({
        data: mockWalletData,
        error: null,
      });

      const balance = await service.getBalance('iwallet_123_abc');

      expect(mockStellarService.getBalance).toHaveBeenCalledWith(
        mockKeypair.publicKey,
        'XLM'
      );
      expect(balance).toHaveProperty('balance');
    });

    it('should get balance for specific asset', async () => {
      mockSupabase.single.mockResolvedValue({
        data: mockWalletData,
        error: null,
      });

      await service.getBalance('iwallet_123_abc', 'USDC');

      expect(mockStellarService.getBalance).toHaveBeenCalledWith(
        mockKeypair.publicKey,
        'USDC'
      );
    });
  });

  describe('sendPayment', () => {
    it('should send payment successfully', async () => {
      mockSupabase.single.mockResolvedValue({
        data: mockWalletData,
        error: null,
      });

      const paymentParams = {
        destination: 'GDEST123456789',
        amount: '10',
        asset: 'XLM' as const,
      };

      const result = await service.sendPayment(
        'iwallet_123_abc',
        'session_token_123',
        paymentParams,
        'Password123!'
      );

      expect(mockKeyManagement.validateSession).toHaveBeenCalledWith(
        'session_token_123'
      );
      expect(mockStellarService.sendPayment).toHaveBeenCalled();
      expect(result.hash).toBe('tx_hash_123');
    });

    it('should throw error for invalid session', async () => {
      mockKeyManagement.validateSession.mockResolvedValue({ valid: false });

      const paymentParams = {
        destination: 'GDEST123456789',
        amount: '10',
        asset: 'XLM' as const,
      };

      await expect(
        service.sendPayment(
          'iwallet_123_abc',
          'invalid_token',
          paymentParams,
          'Password123!'
        )
      ).rejects.toThrow('Invalid or expired session');
    });

    it('should throw error if wallet not found', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      });

      const paymentParams = {
        destination: 'GDEST123456789',
        amount: '10',
        asset: 'XLM' as const,
      };

      await expect(
        service.sendPayment(
          'nonexistent',
          'session_token_123',
          paymentParams,
          'Password123!'
        )
      ).rejects.toThrow('Wallet not found');
    });
  });

  describe('getTransactionHistory', () => {
    it('should get transaction history', async () => {
      mockSupabase.single.mockResolvedValue({
        data: mockWalletData,
        error: null,
      });

      const transactions =
        await service.getTransactionHistory('iwallet_123_abc');

      expect(mockStellarService.getTransactionHistory).toHaveBeenCalledWith(
        mockKeypair.publicKey,
        10
      );
    });

    it('should respect custom limit', async () => {
      mockSupabase.single.mockResolvedValue({
        data: mockWalletData,
        error: null,
      });

      await service.getTransactionHistory('iwallet_123_abc', 25);

      expect(mockStellarService.getTransactionHistory).toHaveBeenCalledWith(
        mockKeypair.publicKey,
        25
      );
    });
  });

  describe('changePassword', () => {
    it('should change wallet password', async () => {
      mockSupabase.single.mockResolvedValue({
        data: mockWalletData,
        error: null,
      });

      await service.changePassword(
        'iwallet_123_abc',
        'OldPassword123!',
        'NewPassword456!'
      );

      expect(mockKeyManagement.changePassword).toHaveBeenCalled();
    });

    it('should throw error if wallet not found', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      });

      await expect(
        service.changePassword('nonexistent', 'old', 'new')
      ).rejects.toThrow('Wallet not found');
    });
  });

  describe('updateMetadata', () => {
    it('should throw error if wallet not found', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      });

      await expect(
        service.exportBackup('nonexistent', 'Password123!')
      ).rejects.toThrow('Wallet not found');
    });
  });
});
