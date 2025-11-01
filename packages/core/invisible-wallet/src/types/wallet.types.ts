/**
 * @fileoverview Type definitions for Invisible Wallet System
 * @description Contains all interfaces and types for invisible wallet functionality
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { NetworkConfig } from '../../../stellar-sdk/src/types/stellar-types';

/**
 * Invisible wallet configuration
 */
export interface InvisibleWalletConfig {
  userId: string;
  email?: string;
  network: NetworkConfig;
  autoBackup?: boolean;
  sessionTimeout?: number;
  biometricEnabled?: boolean;
}

/**
 * Invisible wallet structure
 */
export interface InvisibleWallet {
  id: string;
  userId: string;
  publicKey: string;
  encryptedPrivateKey: string;
  encryptedSeed?: string;
  network: NetworkConfig;
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt?: Date;
  metadata: Record<string, unknown>;
  backupStatus: BackupStatus;
}


/**
 * Backup status
 */
export interface BackupStatus {
  isBackedUp: boolean;
  lastBackupAt?: Date;
  backupMethod?: 'cloud' | 'local' | 'none';
  backupLocation?: string;
}

/**
 * Wallet session
 */
export interface WalletSession {
  walletId: string;
  userId: string;
  sessionToken: string;
  expiresAt: Date;
  createdAt: Date;
  isActive: boolean;
  deviceInfo?: DeviceInfo;
}

/**
 * Device information
 */
export interface DeviceInfo {
  deviceId?: string;
  deviceName?: string;
  platform?: string;
  browser?: string;
  ipAddress?: string;
}

/**
 * Key derivation parameters
 */
export interface KeyDerivationParams {
  iterations: number;
  keyLength: number;
  digest: string;
  salt?: Buffer;
}

/**
 * Encrypted data structure
 */
export interface EncryptedData {
  ciphertext: string;
  iv: string;
  salt: string;
  authTag: string;
  algorithm: string;
}

/**
 * Wallet recovery options
 */
export interface WalletRecoveryOptions {
  email?: string;
  phoneNumber?: string;
  securityQuestions?: SecurityQuestion[];
  recoveryPhrase?: string;
}

/**
 * Security question
 */
export interface SecurityQuestion {
  question: string;
  answerHash: string;
}

/**
 * Wallet creation result
 */
export interface WalletCreationResult {
  wallet: InvisibleWallet;
  session: WalletSession;
  backupRecommendation: string;
}

/**
 * Wallet unlock result
 */
export interface WalletUnlockResult {
  success: boolean;
  session?: WalletSession;
  error?: string;
}

/**
 * Wallet operation result
 */
export interface WalletOperationResult {
  success: boolean;
  data?: any;
  error?: string;
  timestamp: Date;
}

/**
 * Password strength
 */
export enum PasswordStrength {
  WEAK = 'weak',
  MEDIUM = 'medium',
  STRONG = 'strong',
  VERY_STRONG = 'very_strong',
}

/**
 * Wallet status
 */
export enum WalletStatus {
  ACTIVE = 'active',
  LOCKED = 'locked',
  SUSPENDED = 'suspended',
  ARCHIVED = 'archived',
}

/**
 * Authentication method
 */
export enum AuthMethod {
  PASSWORD = 'password',
  BIOMETRIC = 'biometric',
  PIN = 'pin',
  PASSKEY = 'passkey',
}

/**
 * Wallet event type
 */
export enum WalletEventType {
  CREATED = 'created',
  UNLOCKED = 'unlocked',
  LOCKED = 'locked',
  TRANSACTION_SENT = 'transaction_sent',
  BACKUP_CREATED = 'backup_created',
  PASSWORD_CHANGED = 'password_changed',
  RECOVERY_INITIATED = 'recovery_initiated',
}

/**
 * Wallet event
 */
export interface WalletEvent {
  id: string;
  walletId: string;
  userId: string;
  eventType: WalletEventType;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}
