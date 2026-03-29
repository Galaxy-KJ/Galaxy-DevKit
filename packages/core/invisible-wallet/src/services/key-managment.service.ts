// @ts-nocheck

/**
 * @fileoverview Key Management Service for Invisible Wallet
 * @description Handles session management and client-side key utilities
 * @author @ryzen_xp
 * @version 2.0.0
 * @since 2024-12-01
 *
 * ARCHITECTURE (Phase 1 – Non-custodial):
 *   storePrivateKey(), retrievePrivateKey(), and the DB write inside
 *   changePassword() have been removed. Private keys are managed exclusively
 *   on the client device. This service retains:
 *     - Keypair / mnemonic generation utilities (used before the public key is
 *       sent to the server)
 *     - Session management (in-memory + Supabase shadow)
 *     - Rate limiting for unlock attempts
 */

import crypto from 'crypto';
import { Keypair } from '@stellar/stellar-sdk';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import {
  generateSessionToken,
  validatePassword,
} from '../utils/encryption.utils.js';
import {
  WalletSession,
  DeviceInfo,
} from '../types/wallet.types.js';
import { supabaseClient } from '../../../stellar-sdk/src/utils/supabase-client.js';

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes

export class KeyManagementService {
  private supabase = supabaseClient;
  private activeSessions: Map<string, WalletSession> = new Map();
  private sessionTimeout: number = 3_600_000; // 1 hour
  private rateLimiter: Map<string, { attempts: number; lockedUntil: Date | null }> = new Map();
  private cleanupTimer?: NodeJS.Timeout;

  constructor(sessionTimeout?: number) {
    if (sessionTimeout) this.sessionTimeout = sessionTimeout;
    this.startSessionCleanup();
  }

  // ---------------------------------------------------------------------------
  // Client-side keypair utilities
  // (These run before the public key is registered on the server.)
  // ---------------------------------------------------------------------------

  /**
   * Generates a new random Stellar keypair.
   * The secret key must be encrypted and stored on the client device only.
   */
  generateKeypair(): { publicKey: string; secretKey: string } {
    const keypair = Keypair.random();
    return {
      publicKey: keypair.publicKey(),
      secretKey: keypair.secret(),
    };
  }

  /**
   * Generates a BIP39 mnemonic phrase.
   * @param strength - Entropy bits (128 | 160 | 192 | 224 | 256)
   */
  generateMnemonic(strength: number = 256): string {
    if (![128, 160, 192, 224, 256].includes(strength)) {
      throw new Error('Invalid mnemonic strength');
    }
    return bip39.generateMnemonic(strength);
  }

  /**
   * Derives a Stellar keypair from a BIP39 mnemonic using BIP44 path.
   * Runs on the client device; only the resulting public key goes to the server.
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

  /** Generates a random recovery code (used for local backup flows). */
  generateRecoveryCode(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  // ---------------------------------------------------------------------------
  // Session management
  // ---------------------------------------------------------------------------

  private hashSessionToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

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

    // In-memory store is the primary source of truth
    this.activeSessions.set(sessionToken, session);

    // Persist hashed token to Supabase (best-effort)
    try {
      const { error } = await this.supabase.from('wallet_sessions').insert([
        {
          wallet_id: walletId,
          user_id: userId,
          session_token: this.hashSessionToken(sessionToken),
          expires_at: expiresAt.toISOString(),
          created_at: session.createdAt.toISOString(),
          is_active: true,
          device_info: deviceInfo,
        },
      ]);
      if (error) console.warn('Failed to persist session to database:', error.message);
    } catch (error) {
      console.warn('Database session storage error:', error);
    }

    return session;
  }

  async validateSession(sessionToken: string): Promise<{
    valid: boolean;
    session?: WalletSession;
    reason?: string;
  }> {
    const session = this.activeSessions.get(sessionToken);
    if (!session) return { valid: false, reason: 'Session not found' };
    if (!session.isActive) return { valid: false, reason: 'Session is inactive' };
    if (new Date() > session.expiresAt) {
      await this.revokeSession(sessionToken);
      return { valid: false, reason: 'Session expired' };
    }
    return { valid: true, session };
  }

  async refreshSession(sessionToken: string): Promise<WalletSession | null> {
    const validation = await this.validateSession(sessionToken);
    if (!validation.valid || !validation.session) return null;

    const newExpiresAt = new Date(Date.now() + this.sessionTimeout);
    validation.session.expiresAt = newExpiresAt;

    try {
      await this.supabase
        .from('wallet_sessions')
        .update({ expires_at: newExpiresAt.toISOString() })
        .eq('session_token', this.hashSessionToken(sessionToken));
    } catch (error) {
      console.warn('Failed to update session in database:', error);
    }

    return validation.session;
  }

  async revokeSession(sessionToken: string): Promise<void> {
    const session = this.activeSessions.get(sessionToken);
    if (!session) return;

    session.isActive = false;
    this.activeSessions.delete(sessionToken);

    try {
      await this.supabase
        .from('wallet_sessions')
        .update({ is_active: false })
        .eq('session_token', this.hashSessionToken(sessionToken));
    } catch (error) {
      console.warn('Failed to revoke session in database:', error);
    }
  }

  async revokeAllWalletSessions(walletId: string): Promise<void> {
    for (const [token, session] of this.activeSessions.entries()) {
      if (session.walletId === walletId) {
        session.isActive = false;
        this.activeSessions.delete(token);
      }
    }

    try {
      await this.supabase
        .from('wallet_sessions')
        .update({ is_active: false })
        .eq('wallet_id', walletId);
    } catch (error) {
      console.warn('Failed to revoke wallet sessions in database:', error);
    }
  }

  async getActiveSessions(walletId: string): Promise<WalletSession[]> {
    const sessions: WalletSession[] = [];
    for (const session of this.activeSessions.values()) {
      if (session.walletId === walletId && session.isActive) {
        const validation = await this.validateSession(session.sessionToken);
        if (validation.valid) sessions.push(session);
      }
    }
    return sessions;
  }

  // ---------------------------------------------------------------------------
  // Rate limiting (guards the client-side unlock flow)
  // ---------------------------------------------------------------------------

  private checkRateLimit(walletId: string): void {
    const entry = this.rateLimiter.get(walletId);
    if (!entry) return;

    if (entry.lockedUntil && new Date() < entry.lockedUntil) {
      const remaining = Math.ceil((entry.lockedUntil.getTime() - Date.now()) / 1000);
      throw new Error(`Account locked. Try again in ${remaining} seconds.`);
    }

    if (entry.lockedUntil && new Date() >= entry.lockedUntil) {
      this.rateLimiter.delete(walletId);
    }
  }

  private recordFailedAttempt(walletId: string): void {
    const entry = this.rateLimiter.get(walletId) || { attempts: 0, lockedUntil: null };
    entry.attempts++;
    if (entry.attempts >= MAX_ATTEMPTS) {
      entry.lockedUntil = new Date(Date.now() + LOCKOUT_DURATION);
    }
    this.rateLimiter.set(walletId, entry);
  }

  private resetRateLimit(walletId: string): void {
    this.rateLimiter.delete(walletId);
  }

  /**
   * Records a failed on-device unlock attempt for rate-limiting purposes.
   * The server never sees the password; it only tracks the attempt count.
   */
  recordUnlockFailure(walletId: string): void {
    this.checkRateLimit(walletId); // throws if locked
    this.recordFailedAttempt(walletId);
  }

  /** Resets the rate-limit counter after a successful on-device unlock. */
  recordUnlockSuccess(walletId: string): void {
    this.resetRateLimit(walletId);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  private startSessionCleanup(): void {
    this.cleanupTimer = setInterval(async () => {
      const now = new Date();
      for (const [token, session] of this.activeSessions.entries()) {
        if (now > session.expiresAt) {
          await this.revokeSession(token);
        }
      }
    }, 60_000);
  }

  /** Stop the cleanup timer and clear all in-memory state. */
  public dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.rateLimiter.clear();
    this.activeSessions.clear();
  }
}