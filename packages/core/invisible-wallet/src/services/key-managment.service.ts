/**
 * @fileoverview Key Management Service for Invisible Wallet
 * @description Handles secure key storage, retrieval, and session management
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import crypto from 'crypto';
import { Keypair } from '@stellar/stellar-sdk';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import {
  encryptPrivateKey,
  decryptPrivateKey,
  generateSessionToken,
  hashPassword,
  verifyPassword,
  validatePassword,
} from '../utils/encryption.utils';
import {
  WalletSession,
  DeviceInfo,
  InvisibleWallet,
} from '../types/wallet.types';
import { supabaseClient } from '../../../stellar-sdk/src/utils/supabase-client';

/**
 * Service class for key management operations
 */
export class KeyManagementService {
  private supabase = supabaseClient;
  private activeSessions: Map<string, WalletSession> = new Map();
  private sessionTimeout: number = 3600000; // 1 hour default

  constructor(sessionTimeout?: number) {
    if (sessionTimeout) {
      this.sessionTimeout = sessionTimeout;
    }
    this.startSessionCleanup();
  }

  /**
   * Generates a new Stellar keypair
   * @returns Keypair object
   */
  generateKeypair(): { publicKey: string; secretKey: string } {
    const keypair = Keypair.random();
    return {
      publicKey: keypair.publicKey(),
      secretKey: keypair.secret(),
    };
  }

  /**
   * Generates a BIP39 mnemonic
   * @param strength - Entropy strength (128, 160, 192, 224, 256)
   * @returns Mnemonic phrase
   */
  generateMnemonic(strength: number = 256): string {
    if (![128, 160, 192, 224, 256].includes(strength)) {
      throw new Error('Invalid mnemonic strength');
    }
    return bip39.generateMnemonic(strength);
  }

  /**
   * Derives keypair from mnemonic using BIP44 path
   * @param mnemonic - BIP39 mnemonic phrase
   * @param accountIndex - Account index for derivation
   * @returns Keypair object
   */
  async deriveKeypairFromMnemonic(
    mnemonic: string,
    accountIndex: number = 0
  ): Promise<{ publicKey: string; secretKey: string }> {
    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic phrase');
    }

    const seed = await bip39.mnemonicToSeed(mnemonic);
    const path = `m/44'/148'/${accountIndex}'`;
    const { key } = derivePath(path, seed.toString('hex'));
    const keypair = Keypair.fromRawEd25519Seed(Buffer.from(key));

    return {
      publicKey: keypair.publicKey(),
      secretKey: keypair.secret(),
    };
  }

  /**
   * Securely stores private key
   * @param secretKey - Private key to store
   * @param password - Password for encryption
   * @returns Encrypted private key
   */
  storePrivateKey(secretKey: string, password: string): string {
    validatePassword(password);
    return encryptPrivateKey(secretKey, password);
  }

  /**
   * Retrieves and decrypts private key
   * @param encryptedKey - Encrypted private key
   * @param password - Password for decryption
   * @returns Decrypted private key
   */
  retrievePrivateKey(encryptedKey: string, password: string): string {
    try {
      return decryptPrivateKey(encryptedKey, password);
    } catch (error) {
      throw new Error('Invalid password or corrupted key data');
    }
  }

  /**
   * Creates a new session for a wallet
   * @param walletId - Wallet ID
   * @param userId - User ID
   * @param deviceInfo - Optional device information
   * @returns Wallet session
   */
  async createSession(
    walletId: string,
    userId: string,
    deviceInfo?: DeviceInfo
  ): Promise<WalletSession> {
    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + this.sessionTimeout);

    const session: WalletSession = {
      walletId,
      userId,
      sessionToken,
      expiresAt,
      createdAt: new Date(),
      isActive: true,
      deviceInfo,
    };

    // Store in memory
    this.activeSessions.set(sessionToken, session);

    // Store in database
    try {
      const { error } = await this.supabase.from('wallet_sessions').insert([
        {
          wallet_id: walletId,
          user_id: userId,
          session_token: sessionToken,
          expires_at: expiresAt.toISOString(),
          created_at: session.createdAt.toISOString(),
          is_active: true,
          device_info: deviceInfo,
        },
      ]);

      if (error) {
        console.warn('Failed to store session in database:', error);
      }
    } catch (error) {
      console.warn('Database session storage error:', error);
    }

    return session;
  }

  /**
   * Validates a session
   * @param sessionToken - Session token to validate
   * @returns Validation result
   */
  async validateSession(sessionToken: string): Promise<{
    valid: boolean;
    session?: WalletSession;
    reason?: string;
  }> {
    const session = this.activeSessions.get(sessionToken);

    if (!session) {
      return { valid: false, reason: 'Session not found' };
    }

    if (!session.isActive) {
      return { valid: false, reason: 'Session is inactive' };
    }

    if (new Date() > session.expiresAt) {
      this.revokeSession(sessionToken);
      return { valid: false, reason: 'Session expired' };
    }

    return { valid: true, session };
  }

  /**
   * Refreshes a session
   * @param sessionToken - Session token to refresh
   * @returns Updated session or null
   */
  async refreshSession(sessionToken: string): Promise<WalletSession | null> {
    const validation = await this.validateSession(sessionToken);

    if (!validation.valid || !validation.session) {
      return null;
    }

    const newExpiresAt = new Date(Date.now() + this.sessionTimeout);
    validation.session.expiresAt = newExpiresAt;

    // Update in database
    try {
      await this.supabase
        .from('wallet_sessions')
        .update({ expires_at: newExpiresAt.toISOString() })
        .eq('session_token', sessionToken);
    } catch (error) {
      console.warn('Failed to update session in database:', error);
    }

    return validation.session;
  }

  /**
   * Revokes a session
   * @param sessionToken - Session token to revoke
   */
  async revokeSession(sessionToken: string): Promise<void> {
    const session = this.activeSessions.get(sessionToken);

    if (session) {
      session.isActive = false;
      this.activeSessions.delete(sessionToken);

      // Update in database
      try {
        await this.supabase
          .from('wallet_sessions')
          .update({ is_active: false })
          .eq('session_token', sessionToken);
      } catch (error) {
        console.warn('Failed to revoke session in database:', error);
      }
    }
  }

  /**
   * Revokes all sessions for a wallet
   * @param walletId - Wallet ID
   */
  async revokeAllWalletSessions(walletId: string): Promise<void> {
    // Revoke from memory
    for (const [token, session] of this.activeSessions.entries()) {
      if (session.walletId === walletId) {
        session.isActive = false;
        this.activeSessions.delete(token);
      }
    }

    // Revoke from database
    try {
      await this.supabase
        .from('wallet_sessions')
        .update({ is_active: false })
        .eq('wallet_id', walletId);
    } catch (error) {
      console.warn('Failed to revoke wallet sessions in database:', error);
    }
  }

  /**
   * Gets active sessions for a wallet
   * @param walletId - Wallet ID
   * @returns Array of active sessions
   */
  async getActiveSessions(walletId: string): Promise<WalletSession[]> {
    const sessions: WalletSession[] = [];

    for (const session of this.activeSessions.values()) {
      if (session.walletId === walletId && session.isActive) {
        const validation = await this.validateSession(session.sessionToken);
        if (validation.valid) {
          sessions.push(session);
        }
      }
    }

    return sessions;
  }

  /**
   * Changes wallet password
   * @param wallet - Wallet object
   * @param oldPassword - Current password
   * @param newPassword - New password
   * @returns Updated encrypted private key
   */
  async changePassword(
    wallet: InvisibleWallet,
    oldPassword: string,
    newPassword: string
  ): Promise<string> {
    // Validate new password
    validatePassword(newPassword);

    // Decrypt with old password
    const secretKey = this.retrievePrivateKey(
      wallet.encryptedPrivateKey,
      oldPassword
    );

    // Encrypt with new password
    const newEncryptedKey = this.storePrivateKey(secretKey, newPassword);

    // Update in database
    try {
      const { error } = await this.supabase
        .from('wallets')
        .update({
          privateKey: newEncryptedKey,
          updatedAt: new Date().toISOString(),
        })
        .eq('id', wallet.id);

      if (error) {
        throw new Error(`Failed to update password: ${error.message}`);
      }
    } catch (error) {
      throw new Error(
        `Password change failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }

    // Revoke all existing sessions for security
    await this.revokeAllWalletSessions(wallet.id);

    return newEncryptedKey;
  }

  /**
   * Verifies password without decrypting
   * @param encryptedKey - Encrypted private key
   * @param password - Password to verify
   * @returns Boolean indicating if password is correct
   */
  verifyPassword(encryptedKey: string, password: string): boolean {
    try {
      decryptPrivateKey(encryptedKey, password);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generates a recovery code
   * @returns Recovery code
   */
  generateRecoveryCode(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Starts automatic session cleanup
   */
  private startSessionCleanup(): void {
    setInterval(() => {
      const now = new Date();
      for (const [token, session] of this.activeSessions.entries()) {
        if (now > session.expiresAt) {
          this.revokeSession(token);
        }
      }
    }, 60000); // Check every minute
  }

  /**
   * Exports wallet backup data (encrypted)
   * @param wallet - Wallet to backup
   * @param password - Password for encryption
   * @returns Encrypted backup data
   */
  exportWalletBackup(wallet: InvisibleWallet, password: string): string {
    const backupData = {
      id: wallet.id,
      publicKey: wallet.publicKey,
      encryptedPrivateKey: wallet.encryptedPrivateKey,
      network: wallet.network,
      metadata: wallet.metadata,
      createdAt: wallet.createdAt,
      timestamp: new Date().toISOString(),
    };

    return encryptPrivateKey(JSON.stringify(backupData), password);
  }

  /**
   * Imports wallet from backup
   * @param backupData - Encrypted backup data
   * @param password - Password for decryption
   * @returns Wallet data
   */
  importWalletBackup(
    backupData: string,
    password: string
  ): Partial<InvisibleWallet> {
    try {
      const decrypted = decryptPrivateKey(backupData, password);
      return JSON.parse(decrypted);
    } catch (error) {
      throw new Error('Invalid backup data or password');
    }
  }
}
