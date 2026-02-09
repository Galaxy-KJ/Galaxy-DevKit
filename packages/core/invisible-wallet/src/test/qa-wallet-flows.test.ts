// @ts-nocheck

/**
 * @fileoverview QA Test Suite — Invisible Wallet End-to-End Flows
 * @description Validates all critical wallet operations: creation, unlock,
 *   payments, swaps (generic + XLM/USDC), trustlines, transaction signing,
 *   password change, and backup export.
 *
 * All mock data uses PLACEHOLDER values only — no real keys, secrets, or
 * credentials are included. Safe for npm publication.
 */

import { InvisibleWalletService } from '../services/invisible-wallet.service.js';
import { KeyManagementService } from '../services/key-managment.service.js';
import { StellarService } from '../../../stellar-sdk/src/services/stellar-service.js';
import type { NetworkConfig } from '../../../stellar-sdk/src/types/stellar-types.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock('../../../stellar-sdk/src/utils/supabase-client', () => ({
  supabaseClient: {
    from: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
  },
}));
jest.mock('../services/key-managment.service');
jest.mock('../../../stellar-sdk/src/services/stellar-service');
jest.mock('../../../stellar-sdk/src/utils/network-utils');
jest.mock('../utils/encryption.utils');
jest.mock('../../../stellar-sdk/src/path-payments/path-payment-manager');

// ---------------------------------------------------------------------------
// Shared fixtures — ALL values are synthetic placeholders
// ---------------------------------------------------------------------------

const MOCK_NETWORK: NetworkConfig = {
  network: 'testnet',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  passphrase: 'Test SDF Network ; September 2015',
};

const MOCK_PUBLIC_KEY = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const MOCK_ENCRYPTED_KEY = 'mock_salt:mock_iv:mock_tag:mock_ciphertext';
const MOCK_PASSWORD = 'TestPass123!';
const MOCK_WALLET_ID = 'iwallet_test_abc123';
const MOCK_USER_ID = 'user_qa_001';
const MOCK_SESSION_TOKEN = 'session_placeholder_token';

const mockKeypair = {
  publicKey: MOCK_PUBLIC_KEY,
  secretKey: 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH',
};

const mockWalletRow = {
  id: MOCK_WALLET_ID,
  user_id: MOCK_USER_ID,
  public_key: MOCK_PUBLIC_KEY,
  encrypted_private_key: MOCK_ENCRYPTED_KEY,
  network: MOCK_NETWORK,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  metadata: { name: 'QA Wallet' },
  backup_status: { isBackedUp: false, backupMethod: 'none' },
};

const mockSession = {
  id: 'sess_qa_001',
  walletId: MOCK_WALLET_ID,
  userId: MOCK_USER_ID,
  token: MOCK_SESSION_TOKEN,
  expiresAt: new Date(Date.now() + 3_600_000),
  createdAt: new Date(),
};

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('QA — Invisible Wallet Full Flow', () => {
  let service: InvisibleWalletService;
  let mockKeyMgmt: jest.Mocked<KeyManagementService>;
  let mockStellar: jest.Mocked<StellarService>;
  let mockSupabase: any;
  let mockPathPaymentManager: any;

  // ── Setup ──────────────────────────────────────────────────────────────

  beforeEach(() => {
    jest.clearAllMocks();

    // Chainable Supabase mock
    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
    };

    // KeyManagementService
    mockKeyMgmt = {
      generateKeypair: jest.fn().mockReturnValue(mockKeypair),
      storePrivateKey: jest.fn().mockResolvedValue(MOCK_ENCRYPTED_KEY),
      createSession: jest.fn().mockResolvedValue(mockSession),
      verifyPassword: jest.fn().mockResolvedValue(true),
      validateSession: jest.fn().mockResolvedValue({ valid: true }),
      revokeSession: jest.fn().mockResolvedValue(undefined),
      revokeAllWalletSessions: jest.fn().mockResolvedValue(undefined),
      deriveKeypairFromMnemonic: jest.fn().mockResolvedValue(mockKeypair),
      changePassword: jest.fn().mockResolvedValue(undefined),
      exportWalletBackup: jest.fn().mockResolvedValue('encrypted_backup_blob'),
      retrievePrivateKey: jest.fn().mockResolvedValue(mockKeypair.secretKey),
    } as any;
    (KeyManagementService as jest.Mock).mockImplementation(() => mockKeyMgmt);

    // StellarService
    mockStellar = {
      getAccountInfo: jest.fn().mockResolvedValue({
        id: MOCK_PUBLIC_KEY,
        sequence: '1000',
        balances: [
          { asset: 'native', balance: '500.0000000' },
          { asset: 'USDC', balance: '120.0000000' },
        ],
      }),
      getBalance: jest.fn().mockResolvedValue({
        balance: '500.0000000',
        asset: 'XLM',
      }),
      sendPayment: jest.fn().mockResolvedValue({
        hash: 'txhash_payment_001',
        status: 'success',
        ledger: '54321',
        createdAt: new Date(),
      }),
      getTransactionHistory: jest.fn().mockResolvedValue([
        {
          hash: 'txhash_hist_001',
          source: MOCK_PUBLIC_KEY,
          destination: 'GDEST_PLACEHOLDER',
          amount: '25',
          asset: 'XLM',
          status: 'success',
          createdAt: new Date(),
        },
      ]),
      addTrustline: jest.fn().mockResolvedValue({
        hash: 'txhash_trustline_001',
        status: 'success',
        ledger: '54322',
        createdAt: new Date(),
      }),
    } as any;
    (StellarService as jest.Mock).mockImplementation(() => mockStellar);

    // PathPaymentManager
    mockPathPaymentManager = {
      executeSwap: jest.fn().mockResolvedValue({
        path: [],
        inputAmount: '100',
        outputAmount: '12.50',
        price: '0.1250',
        priceImpact: '0.35',
        transactionHash: 'txhash_swap_001',
        highImpactWarning: false,
      }),
    };

    service = new InvisibleWalletService(MOCK_NETWORK);
    (service as any).supabase = mockSupabase;
    (service as any).pathPaymentManager = mockPathPaymentManager;
  });

  // =====================================================================
  // 1. WALLET CREATION
  // =====================================================================

  describe('Wallet Creation', () => {
    const walletConfig = {
      userId: MOCK_USER_ID,
      email: 'qa@placeholder.test',
      network: MOCK_NETWORK,
    };

    it('should create a wallet and return wallet + session', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null });

      const result = await service.createWallet(walletConfig, MOCK_PASSWORD);

      expect(result).toHaveProperty('wallet');
      expect(result).toHaveProperty('session');
      expect(result.wallet.publicKey).toBe(MOCK_PUBLIC_KEY);
      expect(result.wallet.userId).toBe(MOCK_USER_ID);
      expect(mockKeyMgmt.generateKeypair).toHaveBeenCalledTimes(1);
      expect(mockKeyMgmt.storePrivateKey).toHaveBeenCalledWith(
        mockKeypair.secretKey,
        MOCK_PASSWORD
      );
      expect(mockSupabase.from).toHaveBeenCalledWith('invisible_wallets');
    });

    it('should persist the encrypted key, never the raw secret', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null });

      const result = await service.createWallet(walletConfig, MOCK_PASSWORD);

      expect(result.wallet.encryptedPrivateKey).toBe(MOCK_ENCRYPTED_KEY);
      // The raw secret must NOT appear anywhere in the returned wallet
      expect(JSON.stringify(result.wallet)).not.toContain(mockKeypair.secretKey);
    });

    it('should reject on database failure', async () => {
      mockSupabase.insert.mockResolvedValue({
        error: { message: 'insert failed' },
      });

      await expect(
        service.createWallet(walletConfig, MOCK_PASSWORD)
      ).rejects.toThrow('Failed to save wallet');
    });

    it('should forward device info to session creation', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null });
      const device = { deviceId: 'dev_001', platform: 'web', userAgent: 'QA' };

      await service.createWallet(walletConfig, MOCK_PASSWORD, device);

      expect(mockKeyMgmt.createSession).toHaveBeenCalledWith(
        expect.any(String),
        MOCK_USER_ID,
        device
      );
    });
  });

  // =====================================================================
  // 2. WALLET CREATION FROM MNEMONIC
  // =====================================================================

  describe('Wallet Creation from Mnemonic', () => {
    const walletConfig = {
      userId: MOCK_USER_ID,
      email: 'qa@placeholder.test',
      network: MOCK_NETWORK,
    };
    const mnemonic = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

    it('should import wallet from BIP39 mnemonic', async () => {
      mockSupabase.insert.mockResolvedValue({ error: null });

      const result = await service.createWalletFromMnemonic(
        walletConfig,
        mnemonic,
        MOCK_PASSWORD
      );

      expect(result.wallet.publicKey).toBe(MOCK_PUBLIC_KEY);
      expect(result.wallet.backupStatus.isBackedUp).toBe(true);
      expect(mockKeyMgmt.deriveKeypairFromMnemonic).toHaveBeenCalledWith(mnemonic);
      // Private key + seed both encrypted
      expect(mockKeyMgmt.storePrivateKey).toHaveBeenCalledTimes(2);
    });

    it('should reject invalid mnemonic', async () => {
      mockKeyMgmt.deriveKeypairFromMnemonic.mockRejectedValue(
        new Error('Invalid mnemonic')
      );

      await expect(
        service.createWalletFromMnemonic(walletConfig, 'bad phrase', MOCK_PASSWORD)
      ).rejects.toThrow('Failed to create wallet from mnemonic');
    });
  });

  // =====================================================================
  // 3. UNLOCK WALLET
  // =====================================================================

  describe('Unlock Wallet', () => {
    it('should unlock with correct password and return session', async () => {
      mockSupabase.single.mockResolvedValue({
        data: mockWalletRow,
        error: null,
      });
      mockSupabase.update.mockReturnThis();

      const result = await service.unlockWallet(MOCK_WALLET_ID, MOCK_PASSWORD);

      expect(result.success).toBe(true);
      expect(result.session).toBeDefined();
      expect(mockKeyMgmt.verifyPassword).toHaveBeenCalledWith(
        MOCK_ENCRYPTED_KEY,
        MOCK_PASSWORD,
        MOCK_WALLET_ID
      );
      expect(mockKeyMgmt.createSession).toHaveBeenCalledWith(
        MOCK_WALLET_ID,
        MOCK_USER_ID,
        undefined
      );
    });

    it('should fail with wrong password', async () => {
      mockSupabase.single.mockResolvedValue({
        data: mockWalletRow,
        error: null,
      });
      mockKeyMgmt.verifyPassword.mockReturnValue(false);

      const result = await service.unlockWallet(MOCK_WALLET_ID, 'WrongPass1!');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid password');
    });

    it('should fail when wallet does not exist', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      });

      const result = await service.unlockWallet('nonexistent', MOCK_PASSWORD);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Wallet not found');
    });

    it('should accept device info on unlock', async () => {
      mockSupabase.single.mockResolvedValue({
        data: mockWalletRow,
        error: null,
      });
      mockSupabase.update.mockReturnThis();
      const device = { deviceId: 'dev_002', platform: 'ios', userAgent: 'QA' };

      await service.unlockWallet(MOCK_WALLET_ID, MOCK_PASSWORD, device);

      expect(mockKeyMgmt.createSession).toHaveBeenCalledWith(
        MOCK_WALLET_ID,
        MOCK_USER_ID,
        device
      );
    });
  });

  // =====================================================================
  // 4. LOCK WALLET
  // =====================================================================

  describe('Lock Wallet', () => {
    beforeEach(() => {
      mockSupabase.single.mockResolvedValue({
        data: mockWalletRow,
        error: null,
      });
    });

    it('should revoke specific session when token is provided', async () => {
      await service.lockWallet(MOCK_WALLET_ID, MOCK_SESSION_TOKEN);

      expect(mockKeyMgmt.revokeSession).toHaveBeenCalledWith(MOCK_SESSION_TOKEN);
    });

    it('should revoke all sessions when no token is provided', async () => {
      await service.lockWallet(MOCK_WALLET_ID);

      expect(mockKeyMgmt.revokeAllWalletSessions).toHaveBeenCalledWith(MOCK_WALLET_ID);
    });
  });

  // =====================================================================
  // 5. SEND PAYMENT
  // =====================================================================

  describe('Send Payment', () => {
    const paymentParams = {
      destination: 'GDEST_PLACEHOLDER_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      amount: '25',
      asset: 'XLM',
    };

    beforeEach(() => {
      mockSupabase.single.mockResolvedValue({
        data: mockWalletRow,
        error: null,
      });
    });

    it('should send XLM payment successfully', async () => {
      const result = await service.sendPayment(
        MOCK_WALLET_ID,
        MOCK_SESSION_TOKEN,
        paymentParams,
        MOCK_PASSWORD
      );

      expect(result.hash).toBe('txhash_payment_001');
      expect(result.status).toBe('success');
      expect(mockKeyMgmt.validateSession).toHaveBeenCalledWith(MOCK_SESSION_TOKEN);
      expect(mockStellar.sendPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          publicKey: MOCK_PUBLIC_KEY,
          privateKey: MOCK_ENCRYPTED_KEY,
        }),
        paymentParams,
        MOCK_PASSWORD
      );
    });

    it('should reject with invalid session', async () => {
      mockKeyMgmt.validateSession.mockResolvedValue({ valid: false });

      await expect(
        service.sendPayment(
          MOCK_WALLET_ID,
          'expired_token',
          paymentParams,
          MOCK_PASSWORD
        )
      ).rejects.toThrow('Invalid or expired session');
    });

    it('should reject when wallet not found', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      });

      await expect(
        service.sendPayment(
          'nonexistent',
          MOCK_SESSION_TOKEN,
          paymentParams,
          MOCK_PASSWORD
        )
      ).rejects.toThrow('Wallet not found');
    });

    it('should propagate Stellar network errors', async () => {
      mockStellar.sendPayment.mockRejectedValue(
        new Error('Insufficient funds')
      );

      await expect(
        service.sendPayment(
          MOCK_WALLET_ID,
          MOCK_SESSION_TOKEN,
          paymentParams,
          MOCK_PASSWORD
        )
      ).rejects.toThrow('Insufficient funds');
    });
  });

  // =====================================================================
  // 6. ADD TRUSTLINE
  // =====================================================================

  describe('Add Trustline', () => {
    const trustlineParams = {
      assetCode: 'USDC',
      assetIssuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    };

    beforeEach(() => {
      mockSupabase.single.mockResolvedValue({
        data: mockWalletRow,
        error: null,
      });
    });

    it('should add trustline successfully', async () => {
      const result = await service.addTrustline(
        MOCK_WALLET_ID,
        MOCK_SESSION_TOKEN,
        trustlineParams,
        MOCK_PASSWORD
      );

      expect(result.hash).toBe('txhash_trustline_001');
      expect(result.status).toBe('success');
      expect(mockStellar.addTrustline).toHaveBeenCalledWith(
        expect.objectContaining({ publicKey: MOCK_PUBLIC_KEY }),
        'USDC',
        trustlineParams.assetIssuer,
        undefined,
        MOCK_PASSWORD
      );
    });

    it('should pass custom limit when provided', async () => {
      await service.addTrustline(
        MOCK_WALLET_ID,
        MOCK_SESSION_TOKEN,
        { ...trustlineParams, limit: '50000' },
        MOCK_PASSWORD
      );

      expect(mockStellar.addTrustline).toHaveBeenCalledWith(
        expect.any(Object),
        'USDC',
        trustlineParams.assetIssuer,
        '50000',
        MOCK_PASSWORD
      );
    });

    it('should reject with invalid session', async () => {
      mockKeyMgmt.validateSession.mockResolvedValue({ valid: false });

      await expect(
        service.addTrustline(
          MOCK_WALLET_ID,
          'bad_token',
          trustlineParams,
          MOCK_PASSWORD
        )
      ).rejects.toThrow('Invalid or expired session');
    });

    it('should reject when wallet not found', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      });

      await expect(
        service.addTrustline(
          'nonexistent',
          MOCK_SESSION_TOKEN,
          trustlineParams,
          MOCK_PASSWORD
        )
      ).rejects.toThrow('Wallet not found');
    });
  });

  // =====================================================================
  // 7. GENERIC SWAP
  // =====================================================================

  describe('Swap (generic)', () => {
    const swapParams = {
      sendAssetCode: 'XLM',
      destAssetCode: 'USDC',
      destAssetIssuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      amount: '100',
      type: 'strict_send' as const,
    };

    beforeEach(() => {
      mockSupabase.single.mockResolvedValue({
        data: mockWalletRow,
        error: null,
      });
    });

    it('should execute XLM → USDC swap', async () => {
      const result = await service.swap(
        MOCK_WALLET_ID,
        MOCK_SESSION_TOKEN,
        swapParams,
        MOCK_PASSWORD
      );

      expect(result.inputAmount).toBe('100');
      expect(result.outputAmount).toBe('12.50');
      expect(result.transactionHash).toBe('txhash_swap_001');
      expect(result.highImpactWarning).toBe(false);
      expect(mockPathPaymentManager.executeSwap).toHaveBeenCalledWith(
        expect.objectContaining({ publicKey: MOCK_PUBLIC_KEY }),
        expect.objectContaining({ amount: '100', type: 'strict_send', maxSlippage: 1 }),
        MOCK_PASSWORD,
        MOCK_PUBLIC_KEY
      );
    });

    it('should execute reverse swap (USDC → XLM)', async () => {
      const reverseParams = {
        sendAssetCode: 'USDC',
        sendAssetIssuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
        destAssetCode: 'XLM',
        amount: '50',
        type: 'strict_send' as const,
      };

      await service.swap(
        MOCK_WALLET_ID,
        MOCK_SESSION_TOKEN,
        reverseParams,
        MOCK_PASSWORD
      );

      expect(mockPathPaymentManager.executeSwap).toHaveBeenCalledWith(
        expect.objectContaining({ publicKey: MOCK_PUBLIC_KEY }),
        expect.objectContaining({ amount: '50' }),
        MOCK_PASSWORD,
        MOCK_PUBLIC_KEY
      );
    });

    it('should honour custom maxSlippage', async () => {
      await service.swap(
        MOCK_WALLET_ID,
        MOCK_SESSION_TOKEN,
        { ...swapParams, maxSlippage: 3 },
        MOCK_PASSWORD
      );

      expect(mockPathPaymentManager.executeSwap).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ maxSlippage: 3 }),
        MOCK_PASSWORD,
        MOCK_PUBLIC_KEY
      );
    });

    it('should report high price impact warning from path engine', async () => {
      mockPathPaymentManager.executeSwap.mockResolvedValue({
        path: [],
        inputAmount: '10000',
        outputAmount: '800',
        price: '0.08',
        priceImpact: '12.5',
        transactionHash: 'txhash_swap_002',
        highImpactWarning: true,
      });

      const result = await service.swap(
        MOCK_WALLET_ID,
        MOCK_SESSION_TOKEN,
        { ...swapParams, amount: '10000' },
        MOCK_PASSWORD
      );

      expect(result.highImpactWarning).toBe(true);
      expect(parseFloat(result.priceImpact)).toBeGreaterThan(5);
    });

    it('should reject with invalid session', async () => {
      mockKeyMgmt.validateSession.mockResolvedValue({ valid: false });

      await expect(
        service.swap(MOCK_WALLET_ID, 'bad', swapParams, MOCK_PASSWORD)
      ).rejects.toThrow('Invalid or expired session');
    });

    it('should reject when wallet not found', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      });

      await expect(
        service.swap('missing', MOCK_SESSION_TOKEN, swapParams, MOCK_PASSWORD)
      ).rejects.toThrow('Wallet not found');
    });
  });

  // =====================================================================
  // 8. SWAP XLM ↔ USDC (pre-configured)
  // =====================================================================

  describe('swapXlmUsdc', () => {
    beforeEach(() => {
      mockSupabase.single.mockResolvedValue({
        data: mockWalletRow,
        error: null,
      });
      mockPathPaymentManager.executeSwap.mockResolvedValue({
        path: [],
        inputAmount: '50',
        outputAmount: '6.25',
        price: '0.125',
        priceImpact: '0.2',
        transactionHash: 'txhash_xlmusdc_001',
        highImpactWarning: false,
      });
    });

    it('should swap XLM to USDC with pre-configured issuer', async () => {
      const result = await service.swapXlmUsdc(
        MOCK_WALLET_ID,
        MOCK_SESSION_TOKEN,
        'xlm_to_usdc',
        '50',
        MOCK_PASSWORD
      );

      expect(result.inputAmount).toBe('50');
      expect(result.outputAmount).toBe('6.25');
      expect(result.transactionHash).toBe('txhash_xlmusdc_001');
      expect(mockPathPaymentManager.executeSwap).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ amount: '50', type: 'strict_send', maxSlippage: 1 }),
        MOCK_PASSWORD,
        MOCK_PUBLIC_KEY
      );
    });

    it('should swap USDC to XLM with pre-configured issuer', async () => {
      await service.swapXlmUsdc(
        MOCK_WALLET_ID,
        MOCK_SESSION_TOKEN,
        'usdc_to_xlm',
        '10',
        MOCK_PASSWORD
      );

      expect(mockPathPaymentManager.executeSwap).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ amount: '10', type: 'strict_send' }),
        MOCK_PASSWORD,
        MOCK_PUBLIC_KEY
      );
    });

    it('should apply custom slippage tolerance', async () => {
      await service.swapXlmUsdc(
        MOCK_WALLET_ID,
        MOCK_SESSION_TOKEN,
        'xlm_to_usdc',
        '50',
        MOCK_PASSWORD,
        2.5
      );

      expect(mockPathPaymentManager.executeSwap).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({ maxSlippage: 2.5 }),
        MOCK_PASSWORD,
        MOCK_PUBLIC_KEY
      );
    });

    it('should reject with invalid session', async () => {
      mockKeyMgmt.validateSession.mockResolvedValue({ valid: false });

      await expect(
        service.swapXlmUsdc(
          MOCK_WALLET_ID,
          'expired',
          'xlm_to_usdc',
          '50',
          MOCK_PASSWORD
        )
      ).rejects.toThrow('Invalid or expired session');
    });
  });

  // =====================================================================
  // 9. SIGN EXTERNAL TRANSACTION
  // =====================================================================

  describe('Sign Transaction (XDR)', () => {
    beforeEach(() => {
      mockSupabase.single.mockResolvedValue({
        data: mockWalletRow,
        error: null,
      });
    });

    it('should sign an unsigned XDR and return signedXdr + hash', async () => {
      const mockTx = {
        sign: jest.fn(),
        toXDR: jest.fn().mockReturnValue('signed_xdr_placeholder'),
        hash: jest.fn().mockReturnValue(Buffer.from('deadbeef', 'hex')),
      };

      const { Keypair: StellarKeypair, TransactionBuilder: StellarTxBuilder } =
        require('@stellar/stellar-sdk');
      jest.spyOn(StellarKeypair, 'fromSecret').mockReturnValue({ publicKey: jest.fn() });
      jest.spyOn(StellarTxBuilder, 'fromXDR').mockReturnValue(mockTx);

      const result = await service.signTransaction(
        MOCK_WALLET_ID,
        MOCK_SESSION_TOKEN,
        'unsigned_xdr_placeholder',
        MOCK_PASSWORD
      );

      expect(result.signedXdr).toBe('signed_xdr_placeholder');
      expect(result.hash).toBe('deadbeef');
      expect(mockKeyMgmt.retrievePrivateKey).toHaveBeenCalledWith(
        MOCK_ENCRYPTED_KEY,
        MOCK_PASSWORD
      );
      expect(mockTx.sign).toHaveBeenCalled();

      StellarKeypair.fromSecret.mockRestore();
      StellarTxBuilder.fromXDR.mockRestore();
    });

    it('should reject with invalid session', async () => {
      mockKeyMgmt.validateSession.mockResolvedValue({ valid: false });

      await expect(
        service.signTransaction(
          MOCK_WALLET_ID,
          'bad',
          'some_xdr',
          MOCK_PASSWORD
        )
      ).rejects.toThrow('Invalid or expired session');
    });

    it('should reject when wallet not found', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      });

      await expect(
        service.signTransaction(
          'missing',
          MOCK_SESSION_TOKEN,
          'some_xdr',
          MOCK_PASSWORD
        )
      ).rejects.toThrow('Wallet not found');
    });
  });

  // =====================================================================
  // 10. BALANCE & ACCOUNT INFO
  // =====================================================================

  describe('Balance & Account Info', () => {
    beforeEach(() => {
      mockSupabase.single.mockResolvedValue({
        data: mockWalletRow,
        error: null,
      });
    });

    it('should return XLM balance by default', async () => {
      const balance = await service.getBalance(MOCK_WALLET_ID);

      expect(balance.balance).toBe('500.0000000');
      expect(mockStellar.getBalance).toHaveBeenCalledWith(MOCK_PUBLIC_KEY, 'XLM');
    });

    it('should return USDC balance when requested', async () => {
      mockStellar.getBalance.mockResolvedValue({
        balance: '120.0000000',
        asset: 'USDC',
      });

      const balance = await service.getBalance(MOCK_WALLET_ID, 'USDC');

      expect(balance.balance).toBe('120.0000000');
      expect(mockStellar.getBalance).toHaveBeenCalledWith(MOCK_PUBLIC_KEY, 'USDC');
    });

    it('should return full account info with balances', async () => {
      const info = await service.getAccountInfo(MOCK_WALLET_ID);

      expect(info.balances).toHaveLength(2);
      expect(mockStellar.getAccountInfo).toHaveBeenCalledWith(MOCK_PUBLIC_KEY);
    });

    it('should throw when wallet not found (getBalance)', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      });

      await expect(service.getBalance('missing')).rejects.toThrow('Wallet not found');
    });

    it('should throw when wallet not found (getAccountInfo)', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      });

      await expect(service.getAccountInfo('missing')).rejects.toThrow('Wallet not found');
    });
  });

  // =====================================================================
  // 11. TRANSACTION HISTORY
  // =====================================================================

  describe('Transaction History', () => {
    beforeEach(() => {
      mockSupabase.single.mockResolvedValue({
        data: mockWalletRow,
        error: null,
      });
    });

    it('should return recent transactions with default limit', async () => {
      const history = await service.getTransactionHistory(MOCK_WALLET_ID);

      expect(history).toHaveLength(1);
      expect(history[0].hash).toBe('txhash_hist_001');
      expect(mockStellar.getTransactionHistory).toHaveBeenCalledWith(
        MOCK_PUBLIC_KEY,
        10
      );
    });

    it('should respect custom limit', async () => {
      await service.getTransactionHistory(MOCK_WALLET_ID, 50);

      expect(mockStellar.getTransactionHistory).toHaveBeenCalledWith(
        MOCK_PUBLIC_KEY,
        50
      );
    });
  });

  // =====================================================================
  // 12. CHANGE PASSWORD
  // =====================================================================

  describe('Change Password', () => {
    it('should change password when wallet exists', async () => {
      mockSupabase.single.mockResolvedValue({
        data: mockWalletRow,
        error: null,
      });

      await service.changePassword(
        MOCK_WALLET_ID,
        MOCK_PASSWORD,
        'NewSecure456!'
      );

      expect(mockKeyMgmt.changePassword).toHaveBeenCalled();
    });

    it('should reject when wallet not found', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      });

      await expect(
        service.changePassword('missing', MOCK_PASSWORD, 'New1!')
      ).rejects.toThrow('Wallet not found');
    });
  });

  // =====================================================================
  // 13. EXPORT BACKUP
  // =====================================================================

  describe('Export Backup', () => {
    it('should return encrypted backup blob', async () => {
      mockSupabase.single.mockResolvedValue({
        data: mockWalletRow,
        error: null,
      });

      const backup = await service.exportBackup(MOCK_WALLET_ID, MOCK_PASSWORD);

      expect(backup).toBe('encrypted_backup_blob');
      expect(mockKeyMgmt.exportWalletBackup).toHaveBeenCalled();
    });

    it('should reject when wallet not found', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      });

      await expect(
        service.exportBackup('missing', MOCK_PASSWORD)
      ).rejects.toThrow('Wallet not found');
    });
  });

  // =====================================================================
  // 14. WALLET RETRIEVAL
  // =====================================================================

  describe('Wallet Retrieval', () => {
    it('should retrieve wallet by ID', async () => {
      mockSupabase.single.mockResolvedValue({
        data: mockWalletRow,
        error: null,
      });

      const wallet = await service.getWalletById(MOCK_WALLET_ID);

      expect(wallet).not.toBeNull();
      expect(wallet?.id).toBe(MOCK_WALLET_ID);
      expect(wallet?.publicKey).toBe(MOCK_PUBLIC_KEY);
    });

    it('should return null for non-existent wallet', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Not found' },
      });

      const wallet = await service.getWalletById('nonexistent');
      expect(wallet).toBeNull();
    });

    it('should retrieve all wallets for a user', async () => {
      mockSupabase.order.mockResolvedValue({
        data: [
          mockWalletRow,
          { ...mockWalletRow, id: 'iwallet_test_def456' },
        ],
        error: null,
      });

      const wallets = await service.getUserWallets(MOCK_USER_ID);

      expect(wallets).toHaveLength(2);
      expect(mockSupabase.eq).toHaveBeenCalledWith('user_id', MOCK_USER_ID);
      expect(mockSupabase.order).toHaveBeenCalledWith('created_at', {
        ascending: false,
      });
    });

    it('should return empty array on DB error', async () => {
      mockSupabase.order.mockResolvedValue({
        data: null,
        error: { message: 'DB error' },
      });

      const wallets = await service.getUserWallets(MOCK_USER_ID);
      expect(wallets).toEqual([]);
    });
  });

  // =====================================================================
  // 15. SESSION VALIDATION GUARD
  // =====================================================================

  describe('Session Validation (cross-cutting)', () => {
    beforeEach(() => {
      mockSupabase.single.mockResolvedValue({
        data: mockWalletRow,
        error: null,
      });
    });

    it('should block payment with expired session', async () => {
      mockKeyMgmt.validateSession.mockResolvedValue({
        valid: false,
        reason: 'Session expired',
      });

      await expect(
        service.sendPayment(
          MOCK_WALLET_ID,
          'expired',
          { destination: 'GDEST', amount: '1', asset: 'XLM' },
          MOCK_PASSWORD
        )
      ).rejects.toThrow('Invalid or expired session');
    });

    it('should block swap with expired session', async () => {
      mockKeyMgmt.validateSession.mockResolvedValue({ valid: false });

      await expect(
        service.swap(
          MOCK_WALLET_ID,
          'expired',
          {
            sendAssetCode: 'XLM',
            destAssetCode: 'USDC',
            destAssetIssuer: 'GISSUER',
            amount: '1',
            type: 'strict_send',
          },
          MOCK_PASSWORD
        )
      ).rejects.toThrow('Invalid or expired session');
    });

    it('should block trustline with expired session', async () => {
      mockKeyMgmt.validateSession.mockResolvedValue({ valid: false });

      await expect(
        service.addTrustline(
          MOCK_WALLET_ID,
          'expired',
          { assetCode: 'USDC', assetIssuer: 'GISSUER' },
          MOCK_PASSWORD
        )
      ).rejects.toThrow('Invalid or expired session');
    });

    it('should block signTransaction with expired session', async () => {
      mockKeyMgmt.validateSession.mockResolvedValue({ valid: false });

      await expect(
        service.signTransaction(MOCK_WALLET_ID, 'expired', 'xdr', MOCK_PASSWORD)
      ).rejects.toThrow('Invalid or expired session');
    });
  });

  // =====================================================================
  // 16. SECURITY — NO SENSITIVE DATA LEAKS
  // =====================================================================

  describe('Security — No Sensitive Data in Outputs', () => {
    beforeEach(() => {
      mockSupabase.insert.mockResolvedValue({ error: null });
      mockSupabase.single.mockResolvedValue({
        data: mockWalletRow,
        error: null,
      });
    });

    it('createWallet result must not contain the raw secret key', async () => {
      const result = await service.createWallet(
        { userId: MOCK_USER_ID, email: 'qa@test.dev', network: MOCK_NETWORK },
        MOCK_PASSWORD
      );

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(mockKeypair.secretKey);
      expect(serialized).not.toContain(MOCK_PASSWORD);
    });

    it('unlockWallet result must not contain password or raw key', async () => {
      mockSupabase.update.mockReturnThis();

      const result = await service.unlockWallet(MOCK_WALLET_ID, MOCK_PASSWORD);

      const serialized = JSON.stringify(result);
      expect(serialized).not.toContain(MOCK_PASSWORD);
      expect(serialized).not.toContain(mockKeypair.secretKey);
    });

    it('getWalletById must not return raw secret key', async () => {
      const wallet = await service.getWalletById(MOCK_WALLET_ID);

      const serialized = JSON.stringify(wallet);
      expect(serialized).not.toContain(mockKeypair.secretKey);
    });
  });
});
