/**
 * @fileoverview Invisible Wallet Service
 * @description Main service for managing invisible wallets
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { KeyManagementService } from './key-managment.service';
import { StellarService } from '../../../stellar-sdk/src/services/stellar-service';
import { NetworkUtils } from '../../../stellar-sdk/src/utils/network-utils';
import { supabaseClient } from '../../../stellar-sdk/src/utils/supabase-client';
import {
  InvisibleWallet,
  InvisibleWalletConfig,
  WalletCreationResult,
  WalletUnlockResult,
  WalletEventType,
  DeviceInfo,
} from '../types/wallet.types';
import {
  PaymentParams,
  PaymentResult,
  AccountInfo,
  Balance,
  TransactionInfo,
  NetworkConfig,
  Wallet,
} from '../../../stellar-sdk/src/types/stellar-types';
import { validatePassword } from '../utils/encryption.utils';

/**
 * Invisible Wallet Service
 * Provides seamless wallet management without exposing seed phrases
 */
export class InvisibleWalletService {
  private keyManagement: KeyManagementService;
  private stellarService: StellarService;
  private networkUtils: NetworkUtils;
  private supabase = supabaseClient;

  constructor(networkConfig: NetworkConfig, sessionTimeout?: number) {
    this.keyManagement = new KeyManagementService(sessionTimeout);
    this.stellarService = new StellarService(networkConfig);
    this.networkUtils = new NetworkUtils();
  }

  /**
   * Creates a new invisible wallet
   * @param config - Wallet configuration
   * @param password - Password for encryption
   * @param deviceInfo - Optional device information
   * @returns Wallet creation result
   */
  async createWallet(
    config: InvisibleWalletConfig,
    password: string,
    deviceInfo?: DeviceInfo
  ): Promise<WalletCreationResult> {
    try {
      // Validate password
      validatePassword(password);

      // Generate keypair
      const keypair = this.keyManagement.generateKeypair();

      // Encrypt private key
      const encryptedPrivateKey = this.keyManagement.storePrivateKey(
        keypair.secretKey,
        password
      );

      // Create wallet object
      const wallet: InvisibleWallet = {
        id: this.generateWalletId(),
        userId: config.userId,
        publicKey: keypair.publicKey,
        encryptedPrivateKey,
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

      // Save to database
      const { error } = await this.supabase.from('invisible_wallets').insert([
        {
          id: wallet.id,
          user_id: wallet.userId,
          public_key: wallet.publicKey,
          encrypted_private_key: wallet.encryptedPrivateKey,
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

      // Create session
      const session = await this.keyManagement.createSession(
        wallet.id,
        wallet.userId,
        deviceInfo
      );

      // Log event
      await this.logWalletEvent(
        wallet.id,
        wallet.userId,
        WalletEventType.CREATED
      );

      return {
        wallet,
        session,
        backupRecommendation:
          'Please backup your wallet using the backup feature.',
      };
    } catch (error) {
      throw new Error(
        `Failed to create wallet: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Creates a wallet from mnemonic
   * @param config - Wallet configuration
   * @param mnemonic - BIP39 mnemonic phrase
   * @param password - Password for encryption
   * @param deviceInfo - Optional device information
   * @returns Wallet creation result
   */
  async createWalletFromMnemonic(
    config: InvisibleWalletConfig,
    mnemonic: string,
    password: string,
    deviceInfo?: DeviceInfo
  ): Promise<WalletCreationResult> {
    try {
      validatePassword(password);

      // Derive keypair from mnemonic
      const keypair =
        await this.keyManagement.deriveKeypairFromMnemonic(mnemonic);

      // Encrypt both private key and mnemonic
      const encryptedPrivateKey = this.keyManagement.storePrivateKey(
        keypair.secretKey,
        password
      );
      const encryptedSeed = this.keyManagement.storePrivateKey(
        mnemonic,
        password
      );

      const wallet: InvisibleWallet = {
        id: this.generateWalletId(),
        userId: config.userId,
        publicKey: keypair.publicKey,
        encryptedPrivateKey,
        encryptedSeed,
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
          encrypted_private_key: wallet.encryptedPrivateKey,
          encrypted_seed: wallet.encryptedSeed,
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

      await this.logWalletEvent(
        wallet.id,
        wallet.userId,
        WalletEventType.CREATED
      );

      return {
        wallet,
        session,
        backupRecommendation: 'Wallet imported successfully with backup.',
      };
    } catch (error) {
      throw new Error(
        `Failed to create wallet from mnemonic: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Unlocks a wallet
   * @param walletId - Wallet ID
   * @param password - Wallet password
   * @param deviceInfo - Optional device information
   * @returns Unlock result
   */
  async unlockWallet(
    walletId: string,
    password: string,
    deviceInfo?: DeviceInfo
  ): Promise<WalletUnlockResult> {
    try {
      // Fetch wallet
      const wallet = await this.getWalletById(walletId);

      if (!wallet) {
        return {
          success: false,
          error: 'Wallet not found',
        };
      }

      // Verify password
      const isValid = this.keyManagement.verifyPassword(
        wallet.encryptedPrivateKey,
        password
      );

      if (!isValid) {
        return {
          success: false,
          error: 'Invalid password',
        };
      }

      // Create session
      const session = await this.keyManagement.createSession(
        wallet.id,
        wallet.userId,
        deviceInfo
      );

      // Update last accessed
      await this.supabase
        .from('invisible_wallets')
        .update({
          last_accessed_at: new Date().toISOString(),
        })
        .eq('id', walletId);

      await this.logWalletEvent(
        wallet.id,
        wallet.userId,
        WalletEventType.UNLOCKED
      );

      return {
        success: true,
        session,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Locks a wallet
   * @param walletId - Wallet ID
   * @param sessionToken - Session token to revoke
   */
  async lockWallet(walletId: string, sessionToken?: string): Promise<void> {
    if (sessionToken) {
      await this.keyManagement.revokeSession(sessionToken);
    } else {
      await this.keyManagement.revokeAllWalletSessions(walletId);
    }

    const wallet = await this.getWalletById(walletId);
    if (wallet) {
      await this.logWalletEvent(
        wallet.id,
        wallet.userId,
        WalletEventType.LOCKED
      );
    }
  }

  /**
   * Gets wallet by ID
   * @param walletId - Wallet ID
   * @returns Wallet object or null
   */
  async getWalletById(walletId: string): Promise<InvisibleWallet | null> {
    try {
      const { data, error } = await this.supabase
        .from('invisible_wallets')
        .select('*')
        .eq('id', walletId)
        .single();

      if (error || !data) {
        return null;
      }

      return this.mapDatabaseToWallet(data);
    } catch (error) {
      console.error('Failed to fetch wallet:', error);
      return null;
    }
  }

  /**
   * Gets all wallets for a user
   * @param userId - User ID
   * @returns Array of wallets
   */
  async getUserWallets(userId: string): Promise<InvisibleWallet[]> {
    try {
      const { data, error } = await this.supabase
        .from('invisible_wallets')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error || !data) {
        return [];
      }

      return data.map(this.mapDatabaseToWallet);
    } catch (error) {
      console.error('Failed to fetch user wallets:', error);
      return [];
    }
  }

  /**
   * Gets account information
   * @param walletId - Wallet ID
   * @returns Account information
   */
  async getAccountInfo(walletId: string): Promise<AccountInfo> {
    const wallet = await this.getWalletById(walletId);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    return this.stellarService.getAccountInfo(wallet.publicKey);
  }

  /**
   * Gets wallet balance
   * @param walletId - Wallet ID
   * @param asset - Asset code
   * @returns Balance
   */
  async getBalance(walletId: string, asset: string = 'XLM'): Promise<Balance> {
    const wallet = await this.getWalletById(walletId);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    return this.stellarService.getBalance(wallet.publicKey, asset);
  }

  /**
   * Sends payment
   * @param walletId - Wallet ID
   * @param sessionToken - Session token
   * @param params - Payment parameters
   * @param password - Wallet password
   * @returns Payment result
   */
  async sendPayment(
    walletId: string,
    sessionToken: string,
    params: PaymentParams,
    password: string
  ): Promise<PaymentResult> {

    const validation = await this.keyManagement.validateSession(sessionToken);
    if (!validation.valid) {
      throw new Error('Invalid or expired session');
    }

    const wallet = await this.getWalletById(walletId);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const stellarWallet = {
      id: wallet.id,
      publicKey: wallet.publicKey,
      privateKey: wallet.encryptedPrivateKey,
      network: wallet.network,
      createdAt: wallet.createdAt,
      updatedAt: wallet.updatedAt,
      metadata: wallet.metadata,
    };

    const result = await this.stellarService.sendPayment(
      stellarWallet,
      params,
      password
    );

    await this.logWalletEvent(
      wallet.id,
      wallet.userId,
      WalletEventType.TRANSACTION_SENT,
      { transactionHash: result.hash }
    );

    return result;
  }

  /**
   * Gets transaction history
   * @param walletId - Wallet ID
   * @param limit - Number of transactions
   * @returns Transaction history
   */
  async getTransactionHistory(
    walletId: string,
    limit: number = 10
  ): Promise<TransactionInfo[]> {
    const wallet = await this.getWalletById(walletId);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    return this.stellarService.getTransactionHistory(wallet.publicKey, limit);
  }

  /**
   * Changes wallet password
   * @param walletId - Wallet ID
   * @param oldPassword - Current password
   * @param newPassword - New password
   */
  async changePassword(
    walletId: string,
    oldPassword: string,
    newPassword: string
  ): Promise<void> {
    const wallet = await this.getWalletById(walletId);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    await this.keyManagement.changePassword(wallet, oldPassword, newPassword);

    await this.logWalletEvent(
      wallet.id,
      wallet.userId,
      WalletEventType.PASSWORD_CHANGED
    );
  }

  /**
   * Updates wallet metadata
   * @param walletId - Wallet ID
   * @param metadata - New metadata
   */
  async updateMetadata(
    walletId: string,
    metadata: Partial<Wallet>
  ): Promise<void> {
    const wallet = await this.getWalletById(walletId);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const updatedMetadata = { ...wallet.metadata, ...metadata };

    await this.supabase
      .from('invisible_wallets')
      .update({
        metadata: updatedMetadata,
        updated_at: new Date().toISOString(),
      })
      .eq('id', walletId);
  }

  /**
   * Exports wallet backup
   * @param walletId - Wallet ID
   * @param password - Password for encryption
   * @returns Encrypted backup data
   */
  async exportBackup(walletId: string, password: string): Promise<string> {
    const wallet = await this.getWalletById(walletId);
    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const backup = this.keyManagement.exportWalletBackup(wallet, password);

    await this.supabase
      .from('invisible_wallets')
      .update({
        backup_status: {
          ...wallet.backupStatus,
          isBackedUp: true,
          lastBackupAt: new Date(),
          backupMethod: 'local',
        },
      })
      .eq('id', walletId);

    await this.logWalletEvent(
      wallet.id,
      wallet.userId,
      WalletEventType.BACKUP_CREATED
    );

    return backup;
  }

  /**
   * Logs wallet event
   * @param walletId - Wallet ID
   * @param userId - User ID
   * @param eventType - Event type
   * @param metadata - Optional metadata
   */
  private async logWalletEvent(
    walletId: string,
    userId: string,
    eventType: WalletEventType,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      await this.supabase.from('wallet_events').insert([
        {
          id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
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

  /**
   * Generates a unique wallet ID
   */
  private generateWalletId(): string {
    return `iwallet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Maps database record to wallet object
   */
  private mapDatabaseToWallet(data: any): InvisibleWallet {
    return {
      id: data.id,
      userId: data.user_id,
      publicKey: data.public_key,
      encryptedPrivateKey: data.encrypted_private_key,
      encryptedSeed: data.encrypted_seed,
      network: data.network,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      lastAccessedAt: data.last_accessed_at
        ? new Date(data.last_accessed_at)
        : undefined,
      metadata: data.metadata || {},
      backupStatus: data.backup_status || {
        isBackedUp: false,
        backupMethod: 'none',
      },
    };
  }
}
