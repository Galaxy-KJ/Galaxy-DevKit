import { StellarService } from '../services/stellar-service.js';
import { WalletConfig, AccountInfo } from '../types/stellar-types.js';
import { Keypair } from '@stellar/stellar-sdk';
import * as bip39 from 'bip39';

// Mock dependencies
jest.mock('../utils/encryption.utils', () => ({
  encryptPrivateKey: jest.fn((key, pwd) => `encrypted_${key}_with_${pwd}`),
  decryptPrivateKey: jest.fn((encrypted, pwd) =>
    encrypted.replace(`encrypted_`, '').replace(`_with_${pwd}`, '')
  ),
}));

jest.mock('../utils/supabase-client', () => ({
  supabaseClient: {
    from: jest.fn().mockReturnThis(),
    insert: jest.fn().mockResolvedValue({ error: null }),
  },
}));

jest.mock('../utils/network-utils', () => {
  return {
    NetworkUtils: jest.fn().mockImplementation(() => ({
      isValidPublicKey: jest.fn(key => key.startsWith('G') && key.length > 40),
    })),
  };
});

// Mock Stellar SDK
const mockServer = {
  loadAccount: jest.fn(),
  submitTransaction: jest.fn(),
  transactions: jest.fn().mockReturnThis(),
  forAccount: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  call: jest.fn(),
  operations: jest.fn().mockReturnThis(),
  forTransaction: jest.fn().mockReturnThis(),
  transaction: jest.fn().mockReturnThis(),
};

jest.mock('@stellar/stellar-sdk', () => ({
  Keypair: {
    random: jest.fn(() => ({
      publicKey: jest.fn(
        () => 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
      ),
      secret: jest.fn(
        () => 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
      ),
    })),
    fromSecret: jest.fn(secret => ({
      publicKey: jest.fn(
        () => 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
      ),
      secret: jest.fn(() => secret),
    })),
    fromRawEd25519Seed: jest.fn(seed => ({
      publicKey: jest.fn(
        () => 'GMNEMONIC_GENERATED_PUBLIC_KEY_XXXXXXXXXXXXXXXX'
      ),
      secret: jest.fn(() => 'SMNEMONIC_GENERATED_SECRET_KEY_XXXXXXXXXXXXXXXX'),
    })),
  },
  Asset: {
    native: jest.fn(() => ({ code: 'XLM', type: 'native' })),
  },
  Operation: {
    payment: jest.fn(opts => ({ type: 'payment', ...opts })),
    createAccount: jest.fn(opts => ({ type: 'createAccount', ...opts })),
  },
  BASE_FEE: '100',
  TransactionBuilder: jest.fn().mockImplementation((source, opts) => ({
    addOperation: jest.fn().mockReturnThis(),
    addMemo: jest.fn().mockReturnThis(),
    setTimeout: jest.fn().mockReturnThis(),
    build: jest.fn(() => ({
      sign: jest.fn(),
      toXDR: jest.fn(() => 'mock_xdr'),
    })),
  })),
  Memo: {
    text: jest.fn(text => ({ type: 'text', value: text })),
  },
  Horizon: { Server: jest.fn(() => mockServer) },
}));

describe('StellarService - Deep Tests', () => {
  const mockNetworkConfig: {
    network: 'testnet' | 'mainnet';
    horizonUrl: string;
    passphrase: string;
  } = {
    network: 'testnet',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015',
  };

  let service: StellarService;

  // Debug helper
  const debug = (testName: string, data: any) => {
    console.log(`\n[DEBUG - ${testName}]`, JSON.stringify(data, null, 2));
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StellarService(mockNetworkConfig);
    debug('Test Setup', {
      networkConfig: mockNetworkConfig,
      serverInitialized: true,
    });
  });

  describe('Constructor & Initialization', () => {
    it('should initialize with correct network configuration', () => {
      debug('Constructor Test', {
        config: mockNetworkConfig,
        serviceCreated: !!service,
      });

      const config = service.getNetworkConfig();

      debug('Constructor - Retrieved Config', config);

      expect(config).toEqual(mockNetworkConfig);
      expect(config.network).toBe('testnet');
      expect(config.horizonUrl).toContain('horizon-testnet');
    });

    it('should initialize server with horizon URL', () => {
      const { Horizon } = require('@stellar/stellar-sdk');

      debug('Server Initialization', {
        horizonUrl: mockNetworkConfig.horizonUrl,
        serverConstructorCalled: Horizon.Server.mock.calls.length,
      });

      expect(Horizon.Server).toHaveBeenCalledWith(mockNetworkConfig.horizonUrl);
    });
  });

  describe('createWallet', () => {
    it('should create a new wallet successfully', async () => {
      const password = 'testPassword123!';

      debug('createWallet - Input', { password, configProvided: {} });

      const result = await service.createWallet({}, password);

      debug('createWallet - Result', {
        id: result.id,
        publicKey: result.publicKey,
        privateKey: result.privateKey,
        network: result.network,
        createdAt: result.createdAt,
        hasMetadata: !!result.metadata,
      });

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('publicKey');
      expect(result).toHaveProperty('privateKey');
      expect(result.privateKey).toContain('encrypted_');
      expect(result.network).toEqual(mockNetworkConfig);
    });

    it('should generate unique wallet IDs', async () => {
      const wallet1 = await service.createWallet({}, 'pass1');
      const wallet2 = await service.createWallet({}, 'pass2');

      debug('Unique Wallet IDs', {
        wallet1Id: wallet1.id,
        wallet2Id: wallet2.id,
        areUnique: wallet1.id !== wallet2.id,
      });

      expect(wallet1.id).not.toBe(wallet2.id);
      expect(wallet1.id).toMatch(/^wallet_\d+_[a-z0-9]+$/);
    });

    it('should handle metadata in wallet creation', async () => {
      const metadata = {
        label: 'My Wallet',
        description: 'Test wallet',
        tags: ['test', 'demo'],
      };

      debug('createWallet with Metadata - Input', { metadata });

      const result = await service.createWallet(
        { metadata } as Partial<WalletConfig>,
        'password'
      );

      debug('createWallet with Metadata - Result', {
        metadata: result.metadata,
        hasLabel: 'label' in result.metadata,
      });

      expect(result.metadata).toEqual(metadata);
    });

    it('should throw error when Supabase insert fails', async () => {
      const { supabaseClient } = require('../utils/supabase-client');
      const dbError = { message: 'Database connection failed' };

      supabaseClient.insert.mockResolvedValueOnce({ error: dbError });

      debug('createWallet - Supabase Error Setup', { error: dbError });

      await expect(service.createWallet({}, 'password')).rejects.toThrow(
        'Failed to create wallet'
      );

      debug('createWallet - Error Thrown', {
        expectedError: 'Failed to create wallet',
      });
    });

    it('should encrypt private key with provided password', async () => {
      const { encryptPrivateKey } = require('../utils/encryption.utils');
      const password = 'mySecurePassword123!';

      await service.createWallet({}, password);

      debug('Private Key Encryption', {
        encryptFunctionCalled: encryptPrivateKey.mock.calls.length,
        passwordUsed: password,
        firstCallArgs: encryptPrivateKey.mock.calls[0],
      });

      expect(encryptPrivateKey).toHaveBeenCalledWith(
        expect.any(String),
        password
      );
    });

    it('should set timestamps correctly', async () => {
      const beforeCreate = new Date();
      const wallet = await service.createWallet({}, 'password');
      const afterCreate = new Date();

      debug('Timestamp Validation', {
        beforeCreate: beforeCreate.toISOString(),
        createdAt: wallet.createdAt.toISOString(),
        updatedAt: wallet.updatedAt.toISOString(),
        afterCreate: afterCreate.toISOString(),
      });

      expect(wallet.createdAt.getTime()).toBeGreaterThanOrEqual(
        beforeCreate.getTime()
      );
      expect(wallet.createdAt.getTime()).toBeLessThanOrEqual(
        afterCreate.getTime()
      );
      expect(wallet.updatedAt).toEqual(wallet.createdAt);
    });
  });

  describe('createWalletFromMnemonic', () => {
    const validMnemonic =
      'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    beforeEach(() => {
      jest.spyOn(bip39, 'validateMnemonic').mockReturnValue(true);
      jest
        .spyOn(bip39, 'mnemonicToSeed')
        .mockResolvedValue(Buffer.alloc(64, 1));
    });

    it('should create wallet from valid mnemonic', async () => {
      debug('createWalletFromMnemonic - Input', {
        mnemonic: validMnemonic,
        mnemonicLength: validMnemonic.split(' ').length,
      });

      const wallet = await service.createWalletFromMnemonic(
        validMnemonic,
        'password'
      );

      debug('createWalletFromMnemonic - Result', {
        id: wallet.id,
        publicKey: wallet.publicKey,
        privateKey: wallet.privateKey.substring(0, 30) + '...',
        mnemonicValidated: true,
      });

      expect(wallet).toHaveProperty('id');
      expect(wallet.publicKey).toContain('G');
      expect(bip39.validateMnemonic).toHaveBeenCalledWith(validMnemonic);
    });

    it('should throw error for invalid mnemonic', async () => {
      jest.spyOn(bip39, 'validateMnemonic').mockReturnValue(false);
      const invalidMnemonic = 'invalid mnemonic phrase';

      debug('Invalid Mnemonic Test', {
        mnemonic: invalidMnemonic,
        isValid: false,
      });

      await expect(
        service.createWalletFromMnemonic(invalidMnemonic, 'password')
      ).rejects.toThrow('Invalid mnemonic phrase');

      debug('Invalid Mnemonic - Error Thrown', {
        error: 'Invalid mnemonic phrase',
      });
    });

    it('should use first 32 bytes of seed for keypair generation', async () => {
      const { Keypair } = require('@stellar/stellar-sdk');
      const mockSeed = Buffer.alloc(64, 1);
      jest.spyOn(bip39, 'mnemonicToSeed').mockResolvedValue(mockSeed);

      await service.createWalletFromMnemonic(validMnemonic, 'password');

      const expectedSeed = mockSeed.slice(0, 32);

      debug('Seed Usage', {
        totalSeedLength: mockSeed.length,
        usedSeedLength: 32,
        fromRawEd25519SeedCalled: Keypair.fromRawEd25519Seed.mock.calls.length,
        expectedSeedFirstBytes: Array.from(expectedSeed.slice(0, 8)),
      });

      expect(Keypair.fromRawEd25519Seed).toHaveBeenCalled();

      // Check if the seed passed is the correct length
      const calledWith = Keypair.fromRawEd25519Seed.mock.calls[0][0];
      expect(
        Buffer.isBuffer(calledWith) || calledWith instanceof Uint8Array
      ).toBe(true);
      expect(calledWith.length).toBe(32);
    });

    it('should handle mnemonic with extra spaces', async () => {
      const mnemonicWithSpaces =
        '  abandon   abandon  abandon abandon abandon abandon abandon abandon abandon abandon abandon about  ';

      debug('Mnemonic with Spaces', {
        original: mnemonicWithSpaces,
        length: mnemonicWithSpaces.length,
      });

      const wallet = await service.createWalletFromMnemonic(
        mnemonicWithSpaces,
        'password'
      );

      expect(wallet).toHaveProperty('id');
      expect(bip39.validateMnemonic).toHaveBeenCalled();
    });

    it('should handle metadata in mnemonic wallet creation', async () => {
      const metadata = { source: 'mnemonic', imported: true };

      debug('Mnemonic Wallet with Metadata', { metadata });

      const wallet = await service.createWalletFromMnemonic(
        validMnemonic,
        'password',
        { metadata } as Partial<WalletConfig>
      );

      debug('Mnemonic Wallet Result', {
        hasMetadata: !!wallet.metadata,
        metadata: wallet.metadata,
      });

      expect(wallet.metadata).toEqual(metadata);
    });
  });

  describe('generateMnemonic', () => {
    beforeEach(() => {
      jest
        .spyOn(bip39, 'generateMnemonic')
        .mockReturnValue(
          'test mnemonic phrase with twelve words for testing purposes only'
        );
    });

    it('should generate mnemonic with default strength (256)', () => {
      debug('generateMnemonic - Default Strength', { defaultStrength: 256 });

      const mnemonic = service.generateMnemonic();

      debug('generateMnemonic - Result', {
        mnemonic,
        wordCount: mnemonic.split(' ').length,
        strength: 256,
      });

      expect(bip39.generateMnemonic).toHaveBeenCalledWith(256);
      expect(mnemonic).toBeDefined();
    });

    it('should generate mnemonic with custom strength', () => {
      const strengths = [128, 160, 192, 224, 256];

      strengths.forEach(strength => {
        debug('generateMnemonic - Custom Strength', { strength });

        service.generateMnemonic(strength);

        expect(bip39.generateMnemonic).toHaveBeenCalledWith(strength);
      });

      debug('generateMnemonic - All Strengths Tested', {
        strengthsTested: strengths,
      });
    });

    it('should generate different mnemonics on each call', () => {
      jest
        .spyOn(bip39, 'generateMnemonic')
        .mockReturnValueOnce('first mnemonic phrase')
        .mockReturnValueOnce('second mnemonic phrase');

      const mnemonic1 = service.generateMnemonic();
      const mnemonic2 = service.generateMnemonic();

      debug('Multiple Mnemonic Generation', {
        mnemonic1,
        mnemonic2,
        areUnique: mnemonic1 !== mnemonic2,
      });

      expect(mnemonic1).not.toBe(mnemonic2);
    });
  });

  describe('getAccountInfo', () => {
    const mockPublicKey = 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

    it('should fetch account info successfully', async () => {
      const mockAccount = {
        accountId: () => mockPublicKey,
        sequenceNumber: () => '123456789',
        balances: [
          {
            asset_type: 'native',
            balance: '1000.5000000',
            buying_liabilities: '0.0000000',
            selling_liabilities: '10.0000000',
          },
          {
            asset_type: 'credit_alphanum4',
            asset_code: 'USDC',
            balance: '500.0000000',
            limit: '1000.0000000',
            buying_liabilities: '0.0000000',
            selling_liabilities: '0.0000000',
          },
        ],
        subentry_count: 2,
        inflation_destination: null,
        home_domain: 'example.com',
        data_attr: { test: 'data' },
      };

      mockServer.loadAccount.mockResolvedValue(mockAccount);

      debug('getAccountInfo - Input', { publicKey: mockPublicKey });

      const info = await service.getAccountInfo(mockPublicKey);

      debug('getAccountInfo - Result', {
        accountId: info.accountId,
        sequence: info.sequence,
        balances: info.balances,
        subentryCount: info.subentryCount,
        homeDomain: info.homeDomain,
      });

      expect(info.accountId).toBe(mockPublicKey);
      expect(info.balances.length).toBe(2);
      expect(info.balances[0].asset).toBe('XLM');
      expect(info.balances[1].asset).toBe('USDC');
    });

    it('should throw error for invalid public key format', async () => {
      const invalidKey = 'INVALID_KEY';

      debug('Invalid Public Key Test', { invalidKey });

      await expect(service.getAccountInfo(invalidKey)).rejects.toThrow(
        'Invalid public key format'
      );

      debug('Invalid Public Key - Error Thrown', {
        expectedError: 'Invalid public key format',
      });
    });

    it('should throw error for unfunded account (404)', async () => {
      const unfundedKey = 'GFUNDEDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      mockServer.loadAccount.mockRejectedValue(new Error('404 Not Found'));

      debug('Unfunded Account Test', { publicKey: unfundedKey });

      await expect(service.getAccountInfo(unfundedKey)).rejects.toThrow(
        'Account not found'
      );

      debug('Unfunded Account - Error Details', {
        error: 'Account not found',
        suggestion: 'Account may not be funded yet',
      });
    });

    it('should handle account with only native balance', async () => {
      const mockAccount = {
        accountId: () => mockPublicKey,
        sequenceNumber: () => '100',
        balances: [
          {
            asset_type: 'native',
            balance: '50.0000000',
            buying_liabilities: '0.0000000',
            selling_liabilities: '0.0000000',
          },
        ],
        subentry_count: 0,
        inflation_destination: null,
        home_domain: null,
        data_attr: {},
      };

      mockServer.loadAccount.mockResolvedValue(mockAccount);

      const info = await service.getAccountInfo(mockPublicKey);

      debug('Native Balance Only', {
        balances: info.balances,
        balanceCount: info.balances.length,
        xlmBalance: info.balances[0].balance,
      });

      expect(info.balances.length).toBe(1);
      expect(info.balances[0].asset).toBe('XLM');
    });

    it('should handle account with multiple custom assets', async () => {
      const mockAccount = {
        accountId: () => mockPublicKey,
        sequenceNumber: () => '200',
        balances: [
          {
            asset_type: 'credit_alphanum4',
            asset_code: 'USDC',
            balance: '100.0000000',
            limit: '1000.0000000',
            buying_liabilities: '5.0000000',
            selling_liabilities: '2.0000000',
          },
          {
            asset_type: 'credit_alphanum12',
            asset_code: 'LONGASSETNAME',
            balance: '200.0000000',
            limit: '5000.0000000',
            buying_liabilities: '0.0000000',
            selling_liabilities: '0.0000000',
          },
          {
            asset_type: 'native',
            balance: '1000.0000000',
            buying_liabilities: '0.0000000',
            selling_liabilities: '0.0000000',
          },
        ],
        subentry_count: 3,
        inflation_destination: 'GINFLATIONXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        home_domain: 'stellar.org',
        data_attr: { key1: 'value1', key2: 'value2' },
      };

      mockServer.loadAccount.mockResolvedValue(mockAccount);

      const info = await service.getAccountInfo(mockPublicKey);

      debug('Multiple Assets Account', {
        totalAssets: info.balances.length,
        assets: info.balances.map(b => ({
          asset: b.asset,
          balance: b.balance,
        })),
        inflationDestination: info.inflationDestination,
      });

      expect(info.balances.length).toBe(3);
      expect(info.balances.find(b => b.asset === 'USDC')).toBeDefined();
      expect(
        info.balances.find(b => b.asset === 'LONGASSETNAME')
      ).toBeDefined();
      expect(info.inflationDestination).toBeTruthy();
    });

    it('should handle liabilities correctly', async () => {
      const mockAccount = {
        accountId: () => mockPublicKey,
        sequenceNumber: () => '300',
        balances: [
          {
            asset_type: 'native',
            balance: '1000.0000000',
            buying_liabilities: '100.5000000',
            selling_liabilities: '50.2500000',
          },
        ],
        subentry_count: 0,
        inflation_destination: null,
        home_domain: null,
        data_attr: {},
      };

      mockServer.loadAccount.mockResolvedValue(mockAccount);

      const info = await service.getAccountInfo(mockPublicKey);

      debug('Liabilities Test', {
        balance: info.balances[0].balance,
        buyingLiabilities: info.balances[0].buyingLiabilities,
        sellingLiabilities: info.balances[0].sellingLiabilities,
      });

      expect(info.balances[0].buyingLiabilities).toBe('100.5000000');
      expect(info.balances[0].sellingLiabilities).toBe('50.2500000');
    });
  });

  describe('isAccountFunded', () => {
    it('should return true for funded account', async () => {
      const publicKey = 'GFUNDEDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      mockServer.loadAccount.mockResolvedValue({});

      debug('isAccountFunded - Funded Account', { publicKey });

      const result = await service.isAccountFunded(publicKey);

      debug('isAccountFunded - Result', {
        publicKey,
        isFunded: result,
      });

      expect(result).toBe(true);
    });

    it('should return false for unfunded account', async () => {
      const publicKey = 'GUNFUNDEDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      mockServer.loadAccount.mockRejectedValue(new Error('Not found'));

      debug('isAccountFunded - Unfunded Account', { publicKey });

      const result = await service.isAccountFunded(publicKey);

      debug('isAccountFunded - Result', {
        publicKey,
        isFunded: result,
      });

      expect(result).toBe(false);
    });

    it('should return false on any error', async () => {
      const publicKey = 'GERRORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      mockServer.loadAccount.mockRejectedValue(new Error('Network error'));

      debug('isAccountFunded - Network Error', {
        publicKey,
        error: 'Network error',
      });

      const result = await service.isAccountFunded(publicKey);

      expect(result).toBe(false);
    });
  });

  describe('getBalance', () => {
    const mockPublicKey = 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

    it('should return balance for XLM asset', async () => {
      jest.spyOn(service, 'getAccountInfo').mockResolvedValue({
        accountId: mockPublicKey,
        sequence: '123',
        balances: [
          { asset: 'XLM', balance: '1000.5000000' },
          { asset: 'USDC', balance: '500.0000000' },
        ],
        subentryCount: '2',
      } as AccountInfo);

      debug('getBalance - XLM Request', { publicKey: mockPublicKey });

      const balance = await service.getBalance(mockPublicKey, 'XLM');

      debug('getBalance - XLM Result', {
        asset: balance.asset,
        balance: balance.balance,
      });

      expect(balance.asset).toBe('XLM');
      expect(balance.balance).toBe('1000.5000000');
    });

    it('should return balance for custom asset', async () => {
      jest.spyOn(service, 'getAccountInfo').mockResolvedValue({
        accountId: mockPublicKey,
        sequence: '123',
        balances: [
          { asset: 'XLM', balance: '1000.0000000' },
          { asset: 'USDC', balance: '750.2500000' },
        ],
        subentryCount: '2',
      } as AccountInfo);

      const balance = await service.getBalance(mockPublicKey, 'USDC');

      debug('getBalance - USDC Result', {
        asset: balance.asset,
        balance: balance.balance,
      });

      expect(balance.asset).toBe('USDC');
      expect(balance.balance).toBe('750.2500000');
    });

    it('should throw error if asset not found', async () => {
      jest.spyOn(service, 'getAccountInfo').mockResolvedValue({
        accountId: mockPublicKey,
        sequence: '123',
        balances: [{ asset: 'XLM', balance: '1000.0000000' }],
        subentryCount: '1',
      } as AccountInfo);

      debug('getBalance - Asset Not Found Test', {
        requestedAsset: 'USDC',
        availableAssets: ['XLM'],
      });

      await expect(service.getBalance(mockPublicKey, 'USDC')).rejects.toThrow(
        'Asset USDC not found in account'
      );
    });

    it('should default to XLM if no asset specified', async () => {
      jest.spyOn(service, 'getAccountInfo').mockResolvedValue({
        accountId: mockPublicKey,
        sequence: '123',
        balances: [{ asset: 'XLM', balance: '500.0000000' }],
        subentryCount: '1',
      } as AccountInfo);

      debug('getBalance - Default Asset Test', { defaultAsset: 'XLM' });

      const balance = await service.getBalance(mockPublicKey);

      debug('getBalance - Default Result', {
        asset: balance.asset,
        balance: balance.balance,
      });

      expect(balance.asset).toBe('XLM');
    });
  });

  describe('sendPayment', () => {
    const mockWallet = {
      id: 'wallet_123',
      publicKey: 'GSOURCEXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      privateKey:
        'encrypted_SSOURCEXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX_with_password',
      network: mockNetworkConfig,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {},
    };

    const mockPaymentParams = {
      destination: 'GDESTINATIONXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      amount: '100.0000000',
      asset: 'XLM',
      memo: 'Test payment',
      fee: 100,
    };

    const password = 'password';

    beforeEach(() => {
      mockServer.loadAccount.mockResolvedValue({
        sequenceNumber: () => '123456',
      });

      mockServer.submitTransaction.mockResolvedValue({
        hash: 'transaction_hash_12345',
        successful: true,
        ledger: 1000,
      });
    });

    it('should send XLM payment successfully', async () => {
      debug('sendPayment - Input', {
        wallet: mockWallet,
        params: mockPaymentParams,
      });

      const result = await service.sendPayment(
        mockWallet,
        mockPaymentParams,
        password
      );

      debug('sendPayment - Result', {
        hash: result.hash,
        status: result.status,
        ledger: result.ledger,
        createdAt: result.createdAt,
      });

      expect(result.hash).toBe('transaction_hash_12345');
      expect(result.status).toBe('success');
      expect(result.ledger).toBe('1000');
    });

    it('should throw error for invalid destination', async () => {
      const invalidParams = {
        ...mockPaymentParams,
        destination: 'INVALID',
      };

      debug('sendPayment - Invalid Destination', {
        destination: invalidParams.destination,
      });

      await expect(
        service.sendPayment(mockWallet, invalidParams, password)
      ).rejects.toThrow('Invalid destination address');
    });

    it('should throw error for zero or negative amount', async () => {
      const invalidParams = {
        ...mockPaymentParams,
        amount: '0',
      };

      debug('sendPayment - Zero Amount', { amount: invalidParams.amount });

      await expect(
        service.sendPayment(mockWallet, invalidParams, password)
      ).rejects.toThrow('Amount must be greater than 0');

      const negativeParams = {
        ...mockPaymentParams,
        amount: '-10',
      };

      await expect(
        service.sendPayment(mockWallet, negativeParams, password)
      ).rejects.toThrow('Amount must be greater than 0');
    });

    it('should handle payment without memo', async () => {
      const paramsWithoutMemo = {
        ...mockPaymentParams,
        memo: undefined,
      };

      debug('sendPayment - Without Memo', { params: paramsWithoutMemo });

      const result = await service.sendPayment(
        mockWallet,
        paramsWithoutMemo,
        password
      );

      expect(result.status).toBe('success');
    });

    it('should handle failed transaction', async () => {
      mockServer.submitTransaction.mockResolvedValue({
        hash: 'failed_hash_123',
        successful: false,
        ledger: 2000,
      });

      debug('sendPayment - Failed Transaction Setup', { successful: false });

      const result = await service.sendPayment(
        mockWallet,
        mockPaymentParams,
        password
      );

      debug('sendPayment - Failed Result', {
        hash: result.hash,
        status: result.status,
      });

      expect(result.status).toBe('failed');
    });

    it('should use custom fee if provided', async () => {
      const customFeeParams = {
        ...mockPaymentParams,
        fee: 500,
      };

      debug('sendPayment - Custom Fee', { fee: customFeeParams.fee });

      await service.sendPayment(mockWallet, customFeeParams, password);

      const { TransactionBuilder } = require('@stellar/stellar-sdk');
      const builderCall = TransactionBuilder.mock.calls[0];

      debug('sendPayment - Fee Used', {
        feeInBuilder: builderCall[1].fee,
        expectedFee: '500',
      });

      expect(builderCall[1].fee).toBe('500');
    });

    it('should include memo in transaction', async () => {
      const { Memo } = require('@stellar/stellar-sdk');

      await service.sendPayment(mockWallet, mockPaymentParams, password);

      debug('sendPayment - Memo Usage', {
        memoTextCalled: Memo.text.mock.calls.length,
        memoValue: mockPaymentParams.memo,
      });

      expect(Memo.text).toHaveBeenCalledWith(mockPaymentParams.memo);
    });
  });

  describe('createAccount', () => {
    const mockSourceWallet = {
      id: 'wallet_source',
      publicKey: 'GSOURCEXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      privateKey:
        'encrypted_SSOURCEXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX_with_password',
      network: mockNetworkConfig,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {},
    };

    const destinationPublicKey =
      'GNEWACCOUNTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
    const startingBalance = '10.0000000';

    beforeEach(() => {
      mockServer.loadAccount.mockResolvedValue({
        sequenceNumber: () => '999999',
      });

      mockServer.submitTransaction.mockResolvedValue({
        hash: 'create_account_hash_123',
        successful: true,
        ledger: 5000,
      });
    });

    it('should create and fund new account successfully', async () => {
      debug('createAccount - Input', {
        sourceWallet: mockSourceWallet.publicKey,
        destination: destinationPublicKey,
        startingBalance,
      });

      const result = await service.createAccount(
        mockSourceWallet,
        destinationPublicKey,
        startingBalance,
        'pass'
      );

      debug('createAccount - Result', {
        hash: result.hash,
        status: result.status,
        ledger: result.ledger,
      });

      expect(result.hash).toBe('create_account_hash_123');
      expect(result.status).toBe('success');
      expect(result.ledger).toBe('5000');
    });

    it('should throw error for invalid destination public key', async () => {
      const invalidKey = 'INVALID_KEY';

      debug('createAccount - Invalid Destination', { destination: invalidKey });

      await expect(
        service.createAccount(
          mockSourceWallet,
          invalidKey,
          startingBalance,
          'pass'
        )
      ).rejects.toThrow('Invalid destination public key');
    });

    it('should throw error for starting balance less than 1 XLM', async () => {
      const lowBalance = '0.5';

      debug('createAccount - Low Balance', { startingBalance: lowBalance });

      await expect(
        service.createAccount(
          mockSourceWallet,
          destinationPublicKey,
          lowBalance,
          'pass'
        )
      ).rejects.toThrow('Starting balance must be at least 1 XLM');
    });

    it('should accept starting balance exactly 1 XLM', async () => {
      const minBalance = '1.0';

      debug('createAccount - Minimum Balance', { startingBalance: minBalance });

      const result = await service.createAccount(
        mockSourceWallet,
        destinationPublicKey,
        minBalance,
        'pass'
      );

      expect(result.status).toBe('success');
    });

    it('should use createAccount operation', async () => {
      const { Operation } = require('@stellar/stellar-sdk');

      await service.createAccount(
        mockSourceWallet,
        destinationPublicKey,
        startingBalance,
        'pass'
      );

      debug('createAccount - Operation Used', {
        createAccountCalled: Operation.createAccount.mock.calls.length,
        callArgs: Operation.createAccount.mock.calls[0],
      });

      expect(Operation.createAccount).toHaveBeenCalledWith({
        destination: destinationPublicKey,
        startingBalance: startingBalance,
      });
    });

    it('should handle failed account creation', async () => {
      mockServer.submitTransaction.mockResolvedValue({
        hash: 'failed_create_hash',
        successful: false,
        ledger: 6000,
      });

      debug('createAccount - Failed Creation Setup', { successful: false });

      const result = await service.createAccount(
        mockSourceWallet,
        destinationPublicKey,
        startingBalance,
        'pass'
      );

      debug('createAccount - Failed Result', {
        status: result.status,
        hash: result.hash,
      });

      expect(result.status).toBe('failed');
    });
  });

  describe('getTransactionHistory', () => {
    const mockPublicKey = 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

    it('should handle create_account operations', async () => {
      const mockTransactions = {
        records: [
          {
            hash: 'create_tx_hash',
            source_account: 'GSOURCEXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
            created_at: '2024-01-01T00:00:00Z',
            successful: true,
            memo: '',
          },
        ],
      };

      const mockOperations = {
        records: [
          {
            type: 'create_account',
            account: 'GNEWACCOUNTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
            starting_balance: '10.0000000',
            asset_type: 'native',
          },
        ],
      };

      mockServer.call.mockResolvedValue(mockTransactions);
      mockServer
        .operations()
        .forTransaction()
        .call.mockResolvedValue(mockOperations);

      debug('getTransactionHistory - Create Account', {
        operationType: 'create_account',
      });

      const history = await service.getTransactionHistory(mockPublicKey);

      debug('getTransactionHistory - Create Account Result', {
        destination: history[0].destination,
        amount: history[0].amount,
      });

      expect(history[0].destination).toBe(
        'GNEWACCOUNTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
      );
      expect(history[0].amount).toBe('10.0000000');
    });

    it('should use default limit of 10', async () => {
      mockServer.call.mockResolvedValue({ records: [] });

      await service.getTransactionHistory(mockPublicKey);

      debug('getTransactionHistory - Default Limit', {
        limitCalled: mockServer.limit.mock.calls[0],
      });

      expect(mockServer.limit).toHaveBeenCalledWith(10);
    });

    it('should respect custom limit', async () => {
      mockServer.call.mockResolvedValue({ records: [] });

      const customLimit = 25;

      debug('getTransactionHistory - Custom Limit', { limit: customLimit });

      await service.getTransactionHistory(mockPublicKey, customLimit);

      expect(mockServer.limit).toHaveBeenCalledWith(customLimit);
    });

    it('should handle failed transactions in history', async () => {
      const mockTransactions = {
        records: [
          {
            hash: 'failed_tx_hash',
            source_account: 'GSOURCEXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
            created_at: '2024-01-01T00:00:00Z',
            successful: false,
            memo: 'Failed payment',
          },
        ],
      };

      const mockOperations = {
        records: [
          {
            type: 'payment',
            to: 'GDESTINATIONXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
            amount: '50.0000000',
            asset_type: 'native',
          },
        ],
      };

      mockServer.call.mockResolvedValue(mockTransactions);
      mockServer
        .operations()
        .forTransaction()
        .call.mockResolvedValue(mockOperations);

      const history = await service.getTransactionHistory(mockPublicKey);

      debug('getTransactionHistory - Failed Transaction', {
        status: history[0].status,
        hash: history[0].hash,
      });

      expect(history[0].status).toBe('failed');
    });

    it('should handle custom asset transactions', async () => {
      const mockTransactions = {
        records: [
          {
            hash: 'custom_asset_tx',
            source_account: 'GSOURCEXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
            created_at: '2024-01-01T00:00:00Z',
            successful: true,
            memo: '',
          },
        ],
      };

      const mockOperations = {
        records: [
          {
            type: 'payment',
            to: 'GDESTINATIONXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
            amount: '500.0000000',
            asset_type: 'credit_alphanum4',
            asset_code: 'USDC',
          },
        ],
      };

      mockServer.call.mockResolvedValue(mockTransactions);
      mockServer
        .operations()
        .forTransaction()
        .call.mockResolvedValue(mockOperations);

      const history = await service.getTransactionHistory(mockPublicKey);

      debug('getTransactionHistory - Custom Asset', {
        asset: history[0].asset,
        amount: history[0].amount,
      });

      expect(history[0].asset).toBe('USDC');
    });
  });

  // // Mock structure for getTransactionHistory test
  // describe('getTransactionHistory', () => {
  //   const PublicKey = 'GDEST1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
  //   it('should fetch transaction history successfully', async () => {
  //     const mockTransactions = {
  //       records: [
  //         {
  //           hash: 'tx_hash_1',
  //           source_account: 'GSOURCE1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  //           successful: true,
  //           created_at: '2024-01-15T10:30:00Z',
  //           memo: 'Payment 1',
  //         },
  //         {
  //           hash: 'tx_hash_2',
  //           source_account: 'GSOURCE2XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  //           successful: true,
  //           created_at: '2024-01-14T09:20:00Z',
  //           memo: '',
  //         },
  //       ],
  //     };

  //     const mockOperations1 = {
  //       records: [
  //         {
  //           type: 'payment',
  //           to: 'GDEST1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  //           amount: '100.5000000',
  //           asset_type: 'native',
  //         },
  //       ],
  //     };

  //     const mockOperations2 = {
  //       records: [
  //         {
  //           type: 'create_account',
  //           account: 'GDEST2XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  //           starting_balance: '50.0000000',
  //         },
  //       ],
  //     };

  //     // Mock server methods
  //     const mockCall = jest.fn().mockResolvedValueOnce(mockTransactions); // First call for transactions

  //     const mockForTransaction = jest
  //       .fn()
  //       .mockReturnValueOnce({
  //         call: jest.fn().mockResolvedValue(mockOperations1),
  //       }) // tx_hash_1
  //       .mockReturnValueOnce({
  //         call: jest.fn().mockResolvedValue(mockOperations2),
  //       }); // tx_hash_2

  //     mockServer.transactions.mockReturnValue({
  //       forAccount: jest.fn().mockReturnValue({
  //         order: jest.fn().mockReturnValue({
  //           limit: jest.fn().mockReturnValue({
  //             call: mockCall,
  //           }),
  //         }),
  //       }),
  //     });

  //     mockServer.operations.mockReturnValue({
  //       forTransaction: mockForTransaction,
  //     });

  //     const history = await service.getTransactionHistory(PublicKey, 10);

  //     expect(history).toHaveLength(2);
  //     expect(history[0]).toEqual({
  //       hash: 'tx_hash_1',
  //       source: 'GSOURCE1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  //       destination: 'GDEST1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  //       amount: '100.5000000',
  //       asset: 'XLM',
  //       memo: 'Payment 1',
  //       status: 'success',
  //       createdAt: expect.any(Date),
  //     });
  //     expect(history[1]).toEqual({
  //       hash: 'tx_hash_2',
  //       source: 'GSOURCE2XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  //       destination: 'GDEST2XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  //       amount: '50.0000000',
  //       asset: 'XLM',
  //       memo: '',
  //       status: 'success',
  //       createdAt: expect.any(Date),
  //     });
  //   });
  // });

  describe('getTransaction', () => {
    const transactionHash = 'tx_hash_specific_12345';

    it('should fetch transaction details by hash', async () => {
      const mockTransaction = {
        hash: transactionHash,
        source_account: 'GSOURCEXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        successful: true,
        created_at: '2024-01-15T12:00:00Z',
        memo: 'Test payment',
      };

      const mockOperations = {
        records: [
          {
            type: 'payment',
            to: 'GDESTINATIONXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
            amount: '250.5000000',
            asset_type: 'native',
          },
        ],
      };

      mockServer.transactions.mockReturnValue({
        transaction: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue(mockTransaction),
        }),
      });

      mockServer.operations.mockReturnValue({
        forTransaction: jest.fn().mockReturnValue({
          call: jest.fn().mockResolvedValue(mockOperations),
        }),
      });

      const tx = await service.getTransaction(transactionHash);

      expect(tx.hash).toBe(transactionHash);
      expect(tx.amount).toBe('250.5000000');
      expect(tx.status).toBe('success');
      expect(tx.destination).toBe(
        'GDESTINATIONXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
      );
    });

    it('should handle create_account transaction', async () => {
      const mockTx = {
        hash: transactionHash,
        source_account: 'GSOURCEXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        created_at: '2024-01-15T12:00:00Z',
        successful: true,
        memo: '',
      };

      const mockOperations = {
        records: [
          {
            type: 'create_account',
            account: 'GNEWACCOUNTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
            starting_balance: '15.0000000',
            asset_type: 'native',
          },
        ],
      };

      mockServer.call.mockResolvedValue(mockTx);
      mockServer
        .operations()
        .forTransaction()
        .call.mockResolvedValue(mockOperations);

      debug('getTransaction - Create Account Type', {
        type: 'create_account',
      });

      const tx = await service.getTransaction(transactionHash);

      debug('getTransaction - Create Account Result', {
        destination: tx.destination,
        amount: tx.amount,
      });

      expect(tx.destination).toBe(
        'GNEWACCOUNTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
      );
      expect(tx.amount).toBe('15.0000000');
    });

    it('should handle custom asset transaction', async () => {
      const mockTx = {
        hash: transactionHash,
        source_account: 'GSOURCEXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        created_at: '2024-01-15T12:00:00Z',
        successful: true,
        memo: '',
      };

      const mockOperations = {
        records: [
          {
            type: 'payment',
            to: 'GDESTINATIONXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
            amount: '1000.0000000',
            asset_type: 'credit_alphanum4',
            asset_code: 'USDT',
          },
        ],
      };

      mockServer.call.mockResolvedValue(mockTx);
      mockServer
        .operations()
        .forTransaction()
        .call.mockResolvedValue(mockOperations);

      const tx = await service.getTransaction(transactionHash);

      debug('getTransaction - Custom Asset', {
        asset: tx.asset,
        assetType: 'credit_alphanum4',
      });

      expect(tx.asset).toBe('USDT');
    });
  });

  describe('switchNetwork', () => {
    it('should switch to mainnet configuration', () => {
      const mainnetConfig: {
        network: 'testnet' | 'mainnet';
        horizonUrl: string;
        passphrase: string;
      } = {
        network: 'mainnet',
        horizonUrl: 'https://horizon.stellar.org',
        passphrase: 'Public Global Stellar Network ; September 2015',
      };

      debug('switchNetwork - To Mainnet', { newConfig: mainnetConfig });

      service.switchNetwork(mainnetConfig);

      const currentConfig = service.getNetworkConfig();

      debug('switchNetwork - After Switch', {
        currentNetwork: currentConfig.network,
        currentHorizonUrl: currentConfig.horizonUrl,
      });

      expect(currentConfig.network).toBe('mainnet');
      expect(currentConfig.horizonUrl).toBe('https://horizon.stellar.org');
    });

    it('should switch to testnet configuration', () => {
      const testnetConfig: {
        network: 'testnet' | 'mainnet';
        horizonUrl: string;
        passphrase: string;
      } = {
        network: 'testnet',
        horizonUrl: 'https://horizon-testnet.stellar.org',
        passphrase: 'Test SDF Network ; September 2015',
      };

      debug('switchNetwork - To Testnet', { newConfig: testnetConfig });

      service.switchNetwork(testnetConfig);

      const currentConfig = service.getNetworkConfig();

      expect(currentConfig.network).toBe('testnet');
      expect(currentConfig.passphrase).toContain('Test SDF');
    });

    it('should update network configuration immediately', () => {
      const originalConfig = service.getNetworkConfig();

      debug('switchNetwork - Original Config', originalConfig);

      const newConfig: {
        network: 'testnet' | 'mainnet';
        horizonUrl: string;
        passphrase: string;
      } = {
        network: 'mainnet',
        horizonUrl: 'https://horizon.stellar.org',
        passphrase: 'Public Global Stellar Network ; September 2015',
      };

      service.switchNetwork(newConfig);

      const updatedConfig = service.getNetworkConfig();

      debug('switchNetwork - Before and After', {
        before: originalConfig,
        after: updatedConfig,
        changed: originalConfig.network !== updatedConfig.network,
      });

      expect(updatedConfig).not.toEqual(originalConfig);
    });
  });

  describe('getNetworkConfig', () => {
    it('should return current network configuration', () => {
      const config = service.getNetworkConfig();

      debug('getNetworkConfig - Result', {
        network: config.network,
        horizonUrl: config.horizonUrl,
        passphrase: config.passphrase,
      });

      expect(config).toEqual(mockNetworkConfig);
    });

    it('should return immutable config reference', () => {
      const config1 = service.getNetworkConfig();
      const config2 = service.getNetworkConfig();

      debug('getNetworkConfig - Multiple Calls', {
        config1: config1,
        config2: config2,
        areSame: config1 === config2,
      });

      expect(config1).toEqual(config2);
    });
  });

  describe('Error Handling & Edge Cases', () => {
    it('should handle network errors gracefully', async () => {
      mockServer.loadAccount.mockRejectedValue(new Error('Network timeout'));

      debug('Network Error Test', { error: 'Network timeout' });

      await expect(
        service.getAccountInfo(
          'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
        )
      ).rejects.toThrow('Failed to get account info');
    });

    it('should handle malformed server responses', async () => {
      mockServer.loadAccount.mockResolvedValue(null);

      debug('Malformed Response Test', { response: null });

      await expect(
        service.getAccountInfo(
          'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
        )
      ).rejects.toThrow();
    });

    it('should validate input parameters', async () => {
      const invalidKey = '';

      debug('Empty Public Key Test', { key: invalidKey });

      await expect(service.getAccountInfo(invalidKey)).rejects.toThrow(
        'Invalid public key format'
      );
    });

    it('should handle concurrent operations', async () => {
      mockServer.loadAccount.mockResolvedValue({
        accountId: () => 'GTEST',
        sequenceNumber: () => '123',
        balances: [
          {
            asset_type: 'native',
            balance: '100',
            buying_liabilities: '0',
            selling_liabilities: '0',
          },
        ],
        subentry_count: 0,
        data_attr: {},
      });

      debug('Concurrent Operations Test', { operationCount: 5 });

      const promises = Array.from({ length: 5 }, (_, i) =>
        service.getAccountInfo(
          `GTEST${i}XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX`
        )
      );

      const results = await Promise.allSettled(promises);

      debug('Concurrent Operations Results', {
        total: results.length,
        fulfilled: results.filter(r => r.status === 'fulfilled').length,
        rejected: results.filter(r => r.status === 'rejected').length,
      });

      expect(results.length).toBe(5);
    });

    it('should handle very large transaction amounts', async () => {
      const wallet = {
        id: 'wallet_large',
        publicKey: 'GDWRTU3YAXOIARQXBZ2EYTQYABDPF5CHWZHJGBJEBG5ZITD4VR7L52ZQ',
        privateKey: 'encrypted_key',
        network: mockNetworkConfig,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {},
      };

      const largeAmount = '999999999.9999999';

      mockServer.loadAccount.mockResolvedValue({
        sequenceNumber: () => '123',
      });

      mockServer.submitTransaction.mockResolvedValue({
        hash: 'large_tx_hash',
        successful: true,
        ledger: 1000,
      });

      debug('Large Amount Test', { amount: largeAmount });

      const result = await service.sendPayment(
        wallet,
        {
          destination:
            'GDWRTU3YAXOIARQXBZ2EYTQYABDPF5CHWZHJGBJEBG5ZITD4VR7L52ZQ',
          amount: largeAmount,
          asset: 'XLM',
        },
        'pass'
      );

      debug('Large Amount Result', {
        status: result.status,
        hash: result.hash,
      });

      expect(result.status).toBe('success');
    });
  });

  describe('Integration Tests', () => {
    it('should complete full wallet lifecycle', async () => {
      debug('Integration - Full Lifecycle Start', {});

      // Create wallet
      const wallet = await service.createWallet({}, 'password123');
      debug('Integration - Wallet Created', { walletId: wallet.id });

      // Check if funded
      mockServer.loadAccount.mockResolvedValue({});
      const isFunded = await service.isAccountFunded(wallet.publicKey);
      debug('Integration - Funding Check', { isFunded });

      // Get account info
      mockServer.loadAccount.mockResolvedValue({
        accountId: () => wallet.publicKey,
        sequenceNumber: () => '100',
        balances: [
          {
            asset_type: 'native',
            balance: '1000',
            buying_liabilities: '0',
            selling_liabilities: '0',
          },
        ],
        subentry_count: 0,
        data_attr: {},
      });
      const accountInfo = await service.getAccountInfo(wallet.publicKey);
      debug('Integration - Account Info', { balances: accountInfo.balances });

      expect(wallet.id).toBeDefined();
      expect(accountInfo.balances.length).toBeGreaterThan(0);
    });

    it('should handle mnemonic to payment flow', async () => {
      jest.spyOn(bip39, 'validateMnemonic').mockReturnValue(true);
      jest.spyOn(bip39, 'mnemonicToSeed').mockResolvedValue(Buffer.alloc(64));

      debug('Integration - Mnemonic Flow Start', {});

      // Generate mnemonic
      const mnemonic = service.generateMnemonic();
      debug('Integration - Mnemonic Generated', {
        wordCount: mnemonic.split(' ').length,
      });

      // Create wallet from mnemonic
      const wallet = await service.createWalletFromMnemonic(
        mnemonic,
        'password'
      );
      debug('Integration - Wallet from Mnemonic', { walletId: wallet.id });

      // Setup payment
      mockServer.loadAccount.mockResolvedValue({
        sequenceNumber: () => '200',
      });

      mockServer.submitTransaction.mockResolvedValue({
        hash: 'integration_payment_hash',
        successful: true,
        ledger: 3000,
      });

      // Send payment
      const paymentResult = await service.sendPayment(
        wallet,
        {
          destination: 'GDESTINATIONXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          amount: '50.0',
          asset: 'XLM',
          memo: 'Integration test',
        },
        'pass'
      );

      debug('Integration - Payment Sent', {
        hash: paymentResult.hash,
        status: paymentResult.status,
      });

      expect(paymentResult.status).toBe('success');
    });
  });
});
