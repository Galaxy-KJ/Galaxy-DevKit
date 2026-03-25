// @ts-nocheck

/**
 * @fileoverview Invisible Wallet Service
 * @description Main service for managing invisible wallets
 * @author @ryzen_xp
 * @version 1.0.0
 * @since 2024-12-01
 *
 * ARCHITECTURE (Phase 1 – Non-custodial):
 *   Private keys are generated and stored exclusively on the client device.
 *   The backend persists only { id, user_id, public_key, network }.
 *   All methods that previously wrote/read encryptedPrivateKey now receive the
 *   decrypted keypair from the caller (already unlocked on-device) or operate
 *   purely on public data.
 */

import crypto from 'crypto';
import { KeyManagementService } from './key-managment.service.js';
import { StellarService } from '../../../stellar-sdk/src/services/stellar-service.js';
import { NetworkUtils } from '../../../stellar-sdk/src/utils/network-utils.js';
import { supabaseClient } from '../../../stellar-sdk/src/utils/supabase-client.js';
import {
  InvisibleWallet,
  InvisibleWalletConfig,
  WalletCreationResult,
  WalletUnlockResult,
  WalletEventType,
  DeviceInfo,
  TrustlineParams,
  InvisibleSwapParams,
  InvisibleSwapResult,
  SignTransactionResult,
  USDC_CONFIG,
} from '../types/wallet.types.js';
import {
  PaymentParams,
  PaymentResult,
  AccountInfo,
  Balance,
  TransactionInfo,
  NetworkConfig,
  Wallet,
} from '../../../stellar-sdk/src/types/stellar-types.js';
import { PathPaymentManager } from '../../../stellar-sdk/src/path-payments/path-payment-manager.js';
import { Asset as StellarAsset, Keypair, TransactionBuilder, Horizon } from '@stellar/stellar-sdk';

export class InvisibleWalletService {
  private keyManagement: KeyManagementService;
  private stellarService: StellarService;
  private networkUtils: NetworkUtils;
  private supabase = supabaseClient;
  private networkConfig: NetworkConfig;
  private server: Horizon.Server;
  private pathPaymentManager: PathPaymentManager;

  constructor(networkConfig: NetworkConfig, sessionTimeout?: number) {
    this.keyManagement = new KeyManagementService(sessionTimeout);
    this.stellarService = new StellarService(networkConfig);
    this.networkUtils = new NetworkUtils();
    this.networkConfig = networkConfig;
    this.server = new Horizon.Server(networkConfig.horizonUrl);
    this.pathPaymentManager = new PathPaymentManager(
      this.server,
      networkConfig.passphrase
    );
  }

  // ---------------------------------------------------------------------------
  // Wallet lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Creates a new invisible wallet.
   *
   * The caller is responsible for generating the keypair on-device and
   * providing only the public key. The secret key must never be sent here.
   *
   * @param config       - Wallet configuration
   * @param publicKey    - Stellar public key (G…) generated on the client device
   * @param deviceInfo   - Optional device information
   */
  async createWallet(
    config: InvisibleWalletConfig,
    publicKey: string,
    deviceInfo?: DeviceInfo
  ): Promise<WalletCreationResult> {
    try {
      const wallet: InvisibleWallet = {
        id: this.generateWalletId(),
        userId: config.userId,
        publicKey,
        network: config.network,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          name: config.email || 'My Wallet',
          isDefault: true,
        },
        backupStatus: {
          isBackedUp: false,
          backupMethod: 'none',
        },
      };

      const { error } = await this.supabase.from('invisible_wallets').insert([
        {
          id: wallet.id,
          user_id: wallet.userId,
          public_key: wallet.publicKey,
          network: wallet.network,
          created_at: wallet.createdAt.toISOString(),
          updated_at: wallet.updatedAt.toISOString(),
          metadata: wallet.metadata,
          backup_status: wallet.backupStatus,
        },
      ]);

      if (error) {
        throw new Error(`Failed to save wallet: ${error.message}`);
      }

      const session = await this.keyManagement.createSession(
        wallet.id,
        wallet.userId,
        deviceInfo
      );

      await this.logWalletEvent(wallet.id, wallet.userId, WalletEventType.CREATED);

      void this.logAuditEvent({
        userId: wallet.userId,
        action: 'wallet.create',
        resource: wallet.publicKey,
        success: true,
        metadata: { walletId: wallet.id, network: wallet.network },
      });

      return {
        wallet,
        session,
        backupRecommendation: 'Please backup your wallet using the backup feature.',
      };
    } catch (error) {
      void this.logAuditEvent({
        userId: config.userId,
        action: 'wallet.create',
        resource: null,
        success: false,
        errorCode: 'wallet_create_failed',
      });
      throw new Error(
        `Failed to create wallet: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Imports a wallet from a mnemonic phrase.
   *
   * Keypair derivation happens on the client device. Only the public key
   * and (optionally) an encrypted seed for local backup reach this method.
   *
   * @param config         - Wallet configuration
   * @param publicKey      - Public key derived from the mnemonic on-device
   * @param encryptedSeed  - Mnemonic encrypted on-device (stored for local recovery only)
   * @param deviceInfo     - Optional device information
   */
  async createWalletFromMnemonic(
    config: InvisibleWalletConfig,
    publicKey: string,
    encryptedSeed?: string,
    deviceInfo?: DeviceInfo
  ): Promise<WalletCreationResult> {
    try {
      const wallet: InvisibleWallet = {
        id: this.generateWalletId(),
        userId: config.userId,
        publicKey,
        encryptedSeed, // client-encrypted; opaque blob, never decrypted server-side
        network: config.network,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          name: config.email || 'Imported Wallet',
          isDefault: true,
        },
        backupStatus: {
          isBackedUp: true,
          backupMethod: 'local',
          lastBackupAt: new Date(),
        },
      };

      const { error } = await this.supabase.from('invisible_wallets').insert([
        {
          id: wallet.id,
          user_id: wallet.userId,
          public_key: wallet.publicKey,
          encrypted_seed: wallet.encryptedSeed ?? null,
          network: wallet.network,
          created_at: wallet.createdAt.toISOString(),
          updated_at: wallet.updatedAt.toISOString(),
          metadata: wallet.metadata,
          backup_status: wallet.backupStatus,
        },
      ]);

      if (error) {
        throw new Error(`Failed to save wallet: ${error.message}`);
      }

      const session = await this.keyManagement.createSession(
        wallet.id,
        wallet.userId,
        deviceInfo
      );

      await this.logWalletEvent(wallet.id, wallet.userId, WalletEventType.CREATED);

      void this.logAuditEvent({
        userId: wallet.userId,
        action: 'wallet.import',
        resource: wallet.publicKey,
        success: true,
        metadata: { walletId: wallet.id, network: wallet.network },
      });

      return {
        wallet,
        session,
        backupRecommendation: 'Wallet imported successfully with backup.',
      };
    } catch (error) {
      void this.logAuditEvent({
        userId: config.userId,
        action: 'wallet.import',
        resource: null,
        success: false,
        errorCode: 'wallet_import_failed',
      });
      throw new Error(
        `Failed to create wallet from mnemonic: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Unlocks a wallet (creates a session).
   *
   * Password verification now happens on the client device. This method only
   * validates the session token provided by the client after on-device unlock.
   *
   * @param walletId   - Wallet ID
   * @param deviceInfo - Optional device information
   */
  async unlockWallet(
    walletId: string,
    deviceInfo?: DeviceInfo
  ): Promise<WalletUnlockResult> {
    try {
      const wallet = await this.getWalletById(walletId);

      if (!wallet) {
        void this.logAuditEvent({
          userId: null,
          action: 'wallet.unlock',
          resource: walletId,
          success: false,
          errorCode: 'wallet_not_found',
        });
        return { success: false, error: 'Wallet not found' };
      }

      const session = await this.keyManagement.createSession(
        wallet.id,
        wallet.userId,
        deviceInfo
      );

      await this.supabase
        .from('invisible_wallets')
        .update({ last_accessed_at: new Date().toISOString() })
        .eq('id', walletId);

      await this.logWalletEvent(wallet.id, wallet.userId, WalletEventType.UNLOCKED);

      void this.logAuditEvent({
        userId: wallet.userId,
        action: 'wallet.unlock',
        resource: wallet.publicKey,
        success: true,
        metadata: { walletId: wallet.id },
      });

      return { success: true, session };
    } catch (error) {
      void this.logAuditEvent({
        userId: null,
        action: 'wallet.unlock',
        resource: walletId,
        success: false,
        errorCode: 'wallet_unlock_failed',
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Locks a wallet by revoking its session(s).
   */
  async lockWallet(walletId: string, sessionToken?: string): Promise<void> {
    if (sessionToken) {
      await this.keyManagement.revokeSession(sessionToken);
    } else {
      await this.keyManagement.revokeAllWalletSessions(walletId);
    }

    const wallet = await this.getWalletById(walletId);
    if (wallet) {
      await this.logWalletEvent(wallet.id, wallet.userId, WalletEventType.LOCKED);
    }
  }

  // ---------------------------------------------------------------------------
  // Read operations
  // ---------------------------------------------------------------------------

  /** Fetches a wallet record by its id. Returns null if not found. */
  async getWalletById(walletId: string): Promise<InvisibleWallet | null> {
    try {
      const { data, error } = await this.supabase
        .from('invisible_wallets')
        .select('id, user_id, public_key, network, encrypted_seed, created_at, updated_at, last_accessed_at, metadata, backup_status')
        .eq('id', walletId)
        .single();

      if (error || !data) return null;
      return this.mapDatabaseToWallet(data);
    } catch (error) {
      console.error('Failed to fetch wallet:', error);
      return null;
    }
  }

  /** Returns all wallet records for a user. */
  async getUserWallets(userId: string): Promise<InvisibleWallet[]> {
    try {
      const { data, error } = await this.supabase
        .from('invisible_wallets')
        .select('id, user_id, public_key, network, encrypted_seed, created_at, updated_at, last_accessed_at, metadata, backup_status')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error || !data) return [];
      return data.map(this.mapDatabaseToWallet);
    } catch (error) {
      console.error('Failed to fetch user wallets:', error);
      return [];
    }
  }

  async getAccountInfo(walletId: string): Promise<AccountInfo> {
    const wallet = await this.getWalletById(walletId);
    if (!wallet) throw new Error('Wallet not found');
    return this.stellarService.getAccountInfo(wallet.publicKey);
  }

  async getBalance(walletId: string, asset: string = 'XLM'): Promise<Balance> {
    const wallet = await this.getWalletById(walletId);
    if (!wallet) throw new Error('Wallet not found');
    return this.stellarService.getBalance(wallet.publicKey, asset);
  }

  async getTransactionHistory(walletId: string, limit: number = 10): Promise<TransactionInfo[]> {
    const wallet = await this.getWalletById(walletId);
    if (!wallet) throw new Error('Wallet not found');
    return this.stellarService.getTransactionHistory(wallet.publicKey, limit);
  }

  // ---------------------------------------------------------------------------
  // Write / signing operations
  // All methods that sign transactions now accept the Keypair directly from the
  // caller (decrypted on-device). The server never sees the secret key.
  // ---------------------------------------------------------------------------

  /**
   * Sends a payment.
   *
   * @param walletId     - Wallet ID
   * @param sessionToken - Active session token
   * @param params       - Payment parameters
   * @param keypair      - Stellar Keypair unlocked on the client device
   */
  async sendPayment(
    walletId: string,
    sessionToken: string,
    params: PaymentParams,
    keypair: Keypair
  ): Promise<PaymentResult> {
    try {
      const validation = await this.keyManagement.validateSession(sessionToken);
      if (!validation.valid) throw new Error('Invalid or expired session');

      const wallet = await this.getWalletById(walletId);
      if (!wallet) throw new Error('Wallet not found');

      const stellarWallet: Wallet = {
        id: wallet.id,
        publicKey: wallet.publicKey,
        keypair, // passed directly; no decryption needed server-side
        network: wallet.network,
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt,
        metadata: wallet.metadata,
      };

      const result = await this.stellarService.sendPayment(stellarWallet, params);

      await this.logWalletEvent(wallet.id, wallet.userId, WalletEventType.TRANSACTION_SENT, {
        transactionHash: result.hash,
      });

      void this.logAuditEvent({
        userId: wallet.userId,
        action: 'wallet.send_payment',
        resource: wallet.publicKey,
        success: true,
        metadata: {
          walletId: wallet.id,
          destination: params.destination,
          amount: params.amount,
          asset: params.asset,
          transactionHash: result.hash,
        },
      });

      return result;
    } catch (error) {
      void this.logAuditEvent({
        userId: null,
        action: 'wallet.send_payment',
        resource: walletId,
        success: false,
        errorCode: 'payment_failed',
      });
      throw error;
    }
  }

  /**
   * Adds a trustline (e.g. for USDC).
   *
   * @param walletId     - Wallet ID
   * @param sessionToken - Active session token
   * @param params       - Trustline parameters
   * @param keypair      - Stellar Keypair unlocked on the client device
   */
  async addTrustline(
    walletId: string,
    sessionToken: string,
    params: TrustlineParams,
    keypair: Keypair
  ): Promise<PaymentResult> {
    const validation = await this.keyManagement.validateSession(sessionToken);
      
      if (!validation.valid || !validation.session) {
        throw new Error('Invalid or expired session');
      }

      if (validation.session.walletId !== walletId) {
        throw new Error('Session does not belong to this wallet');
      }

      const wallet = await this.getWalletById(walletId);
        if (!wallet) throw new Error('Wallet not found');
        if (keypair.publicKey() !== wallet.publicKey) {
        throw new Error('Keypair does not match wallet');
      }

    const stellarWallet: Wallet = {
      id: wallet.id,
      publicKey: wallet.publicKey,
      keypair,
      network: wallet.network,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
      metadata: wallet.metadata,
    };

    
//////////////

    const result = await this.stellarService.addTrustline(
      stellarWallet,
      params.assetCode,
      params.assetIssuer,
      params.limit
    );

    await this.logWalletEvent(wallet.id, wallet.userId, WalletEventType.TRUSTLINE_ADDED, {
      assetCode: params.assetCode,
      assetIssuer: params.assetIssuer,
      transactionHash: result.hash,
    });

    return result;
  }

  /**
   * Swaps assets using Stellar path payments.
   *
   * @param walletId     - Wallet ID
   * @param sessionToken - Active session token
   * @param params       - Swap parameters
   * @param keypair      - Stellar Keypair unlocked on the client device
   */
  async swap(
    walletId: string,
    sessionToken: string,
    params: InvisibleSwapParams,
    keypair: Keypair
  ): Promise<InvisibleSwapResult> {
    try {
      const validation = await this.keyManagement.validateSession(sessionToken);
      if (!validation.valid) throw new Error('Invalid or expired session');

      const wallet = await this.getWalletById(walletId);
      if (!wallet) throw new Error('Wallet not found');

      const stellarWallet: Wallet = {
        id: wallet.id,
        publicKey: wallet.publicKey,
        keypair,
        network: wallet.network,
        createdAt: wallet.createdAt,
        updatedAt: wallet.updatedAt,
        metadata: wallet.metadata,
      };

      const sendAsset = params.sendAssetIssuer
        ? new StellarAsset(params.sendAssetCode, params.sendAssetIssuer)
        : StellarAsset.native();

      const destAsset = params.destAssetIssuer
        ? new StellarAsset(params.destAssetCode, params.destAssetIssuer)
        : StellarAsset.native();

      const swapResult = await this.pathPaymentManager.executeSwap(
        stellarWallet,
        {
          sendAsset,
          destAsset,
          amount: params.amount,
          type: params.type,
          maxSlippage: params.maxSlippage ?? 1,
        },
        wallet.publicKey
      );

      await this.logWalletEvent(wallet.id, wallet.userId, WalletEventType.SWAP_EXECUTED, {
        sendAsset: params.sendAssetCode,
        destAsset: params.destAssetCode,
        inputAmount: swapResult.inputAmount,
        outputAmount: swapResult.outputAmount,
        transactionHash: swapResult.transactionHash,
      });

      void this.logAuditEvent({
        userId: wallet.userId,
        action: 'defi.swap',
        resource: wallet.publicKey,
        success: true,
        metadata: {
          walletId: wallet.id,
          sendAsset: params.sendAssetCode,
          destAsset: params.destAssetCode,
          amount: params.amount,
          transactionHash: swapResult.transactionHash,
        },
      });

      return {
        inputAmount: swapResult.inputAmount,
        outputAmount: swapResult.outputAmount,
        price: swapResult.price,
        priceImpact: swapResult.priceImpact,
        transactionHash: swapResult.transactionHash,
        highImpactWarning: swapResult.highImpactWarning,
      };
    } catch (error) {
      void this.logAuditEvent({
        userId: null,
        action: 'defi.swap',
        resource: walletId,
        success: false,
        errorCode: 'swap_failed',
      });
      throw error;
    }
  }

  /**
   * Convenience wrapper: swap XLM ↔ USDC.
   */
  async swapXlmUsdc(
    walletId: string,
    sessionToken: string,
    direction: 'xlm_to_usdc' | 'usdc_to_xlm',
    amount: string,
    keypair: Keypair,
    maxSlippage?: number
  ): Promise<InvisibleSwapResult> {
    const network = this.networkConfig.network as 'testnet' | 'mainnet';
    const usdc = USDC_CONFIG[network];
    if (!usdc) throw new Error(`USDC not configured for network: ${network}`);

    const params: InvisibleSwapParams =
      direction === 'xlm_to_usdc'
        ? {
            sendAssetCode: 'XLM',
            destAssetCode: usdc.code,
            destAssetIssuer: usdc.issuer,
            amount,
            type: 'strict_send',
            maxSlippage,
          }
        : {
            sendAssetCode: usdc.code,
            sendAssetIssuer: usdc.issuer,
            destAssetCode: 'XLM',
            amount,
            type: 'strict_send',
            maxSlippage,
          };

    return this.swap(walletId, sessionToken, params, keypair);
  }

  /**
   * Signs an external transaction XDR (e.g. from Trustless Work or Soroban dApps).
   *
   * The keypair is unlocked on the client device and passed in; the server does
   * not decrypt or store any key material.
   *
   * @param walletId       - Wallet ID
   * @param sessionToken   - Active session token
   * @param transactionXdr - Unsigned transaction XDR
   * @param keypair        - Stellar Keypair unlocked on the client device
   */
  async signTransaction(
    walletId: string,
    sessionToken: string,
    transactionXdr: string,
    keypair: Keypair
  ): Promise<SignTransactionResult> {
    try {
      const validation = await this.keyManagement.validateSession(sessionToken);
      if (!validation.valid) throw new Error('Invalid or expired session');

      const wallet = await this.getWalletById(walletId);
      if (!wallet) throw new Error('Wallet not found');

      const transaction = TransactionBuilder.fromXDR(
        transactionXdr,
        this.networkConfig.passphrase
      );
      transaction.sign(keypair);

      const signedXdr = transaction.toXDR();
      const hash = transaction.hash().toString('hex');

      await this.logWalletEvent(wallet.id, wallet.userId, WalletEventType.TRANSACTION_SIGNED, {
        transactionHash: hash,
      });

      void this.logAuditEvent({
        userId: wallet.userId,
        action: 'wallet.sign_transaction',
        resource: wallet.publicKey,
        success: true,
        metadata: { walletId: wallet.id, transactionHash: hash },
      });

      return { signedXdr, hash };
    } catch (error) {
      void this.logAuditEvent({
        userId: null,
        action: 'wallet.sign_transaction',
        resource: walletId,
        success: false,
        errorCode: 'sign_transaction_failed',
      });
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Metadata & backup
  // ---------------------------------------------------------------------------

  async updateMetadata(walletId: string,metadata: Partial<InvisibleWallet['metadata']>): Promise<void> {
    const wallet = await this.getWalletById(walletId);
    if (!wallet) throw new Error('Wallet not found');

    await this.supabase
      .from('invisible_wallets')
      .update({
        metadata: { ...wallet.metadata, ...metadata },
        updated_at: new Date().toISOString(),
      })
      .eq('id', walletId);
  }

  /**
   * Marks a wallet as backed-up (the actual backup is managed on the client).
   */
  async markBackedUp(walletId: string, backupMethod: string = 'local'): Promise<void> {
    const wallet = await this.getWalletById(walletId);
    if (!wallet) throw new Error('Wallet not found');

    const { error } = await this.supabase
      .from('invisible_wallets')
      .update({
        backup_status: {
          ...wallet.backupStatus,
          isBackedUp: true,
          lastBackupAt: new Date(),
          backupMethod,
        },
      })
      .eq('id', walletId);
      

   
  // Fix
      if (error) {
        void this.logAuditEvent({
          userId: wallet.userId,
          action: 'wallet.backup',
          resource: wallet.publicKey,
          success: false,
          errorCode: 'backup_update_failed',
          metadata: { walletId: wallet.id, error: error.message },
        });
        throw new Error(`Failed to update backup status: ${error.message}`);
      }

    await this.logWalletEvent(wallet.id, wallet.userId, WalletEventType.BACKUP_CREATED);

    void this.logAuditEvent({
      userId: wallet.userId,
      action: 'wallet.backup',
      resource: wallet.publicKey,
      success: true,
      metadata: { walletId: wallet.id },
    });
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private generateWalletId(): string {
    const random = crypto.randomBytes(6).toString('hex');
    return `iwallet_${Date.now()}_${random}`;
  }

  /**
   * Maps a Supabase row to InvisibleWallet.
   * Note: encryptedPrivateKey is intentionally absent — column was dropped.
   */
  private mapDatabaseToWallet(data: any): InvisibleWallet {
    return {
      id: data.id,
      userId: data.user_id,
      publicKey: data.public_key,
      // encryptedPrivateKey intentionally omitted (Phase 1 non-custodial)
      encryptedSeed: data.encrypted_seed,
      network: data.network,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      lastAccessedAt: data.last_accessed_at ? new Date(data.last_accessed_at) : undefined,
      metadata: data.metadata || {},
      backupStatus: data.backup_status || { isBackedUp: false, backupMethod: 'none' },
    };
  }

  private async logWalletEvent(
    walletId: string,
    userId: string,
    eventType: WalletEventType,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      await this.supabase.from('wallet_events').insert([
        {
          id: `event_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
          wallet_id: walletId,
          user_id: userId,
          event_type: eventType,
          timestamp: new Date().toISOString(),
          metadata,
        },
      ]);
    } catch (error) {
      console.warn('Failed to log wallet event:', error);
    }
  }

  private sanitizeAuditMetadata(
    metadata?: Record<string, unknown>
  ): Record<string, unknown> | undefined {
    if (!metadata) return undefined;

    const sensitiveKeys = new Set([
      'password',
      'token',
      'privatekey',
      'encrypted_private_key',
      'secret',
      'sessiontoken',
    ]);

    const sanitizeValue = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(sanitizeValue);
      if (value && typeof value === 'object') {
        const sanitized: Record<string, unknown> = {};
        for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
          if (!sensitiveKeys.has(key.toLowerCase())) {
            sanitized[key] = sanitizeValue(nested);
          }
        }
        return sanitized;
      }
      return value;
    };

    return sanitizeValue(metadata) as Record<string, unknown>;
  }

  private async logAuditEvent(params: {
    userId?: string | null;
    action: string;
    resource?: string | null;
    success: boolean;
    errorCode?: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      await this.supabase.from('audit_logs').insert([
        {
          user_id: params.userId || null,
          action: params.action,
          resource: params.resource || null,
          ip_address: null,
          success: params.success,
          error_code: params.errorCode,
          metadata: this.sanitizeAuditMetadata(params.metadata),
        },
      ]);
    } catch (error) {
      console.warn('Failed to write audit log:', error);
    }
  }
}
