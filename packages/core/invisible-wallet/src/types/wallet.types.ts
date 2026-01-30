// @ts-nocheck

/**
 * @fileoverview Type definitions for Invisible Wallet System
 * @description Contains all interfaces and types for invisible wallet functionality
 * @author @ryzen_xp
 * @version 1.0.0
 * @since 2024-12-01
 */

import { NetworkConfig } from '../../../stellar-sdk/src/types/stellar-types';


export interface InvisibleWalletConfig {
  userId: string;
  email?: string;
  network: NetworkConfig;
  autoBackup?: boolean;
  sessionTimeout?: number;
  biometricEnabled?: boolean;
}


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


export interface BackupStatus {
  isBackedUp: boolean;
  lastBackupAt?: Date;
  backupMethod?: 'cloud' | 'local' | 'none';
  backupLocation?: string;
}


export interface WalletSession {
  walletId: string;
  userId: string;
  sessionToken: string;
  expiresAt: Date;
  createdAt: Date;
  isActive: boolean;
  deviceInfo?: DeviceInfo;
}


export interface DeviceInfo {
  deviceId?: string;
  deviceName?: string;
  platform?: string;
  browser?: string;
  ipAddress?: string;
}


export interface KeyDerivationParams {
  iterations: number;
  keyLength: number;
  digest: string;
  salt?: Buffer;
}


export interface EncryptedData {
  ciphertext: string;
  iv: string;
  salt: string;
  authTag: string;
  algorithm: string;
}


export interface WalletRecoveryOptions {
  email?: string;
  phoneNumber?: string;
  securityQuestions?: SecurityQuestion[];
  recoveryPhrase?: string;
}


export interface SecurityQuestion {
  question: string;
  answerHash: string;
}


export interface WalletCreationResult {
  wallet: InvisibleWallet;
  session: WalletSession;
  backupRecommendation: string;
}


export interface WalletUnlockResult {
  success: boolean;
  session?: WalletSession;
  error?: string;
}


export interface WalletOperationResult {
  success: boolean;
  data?: any;
  error?: string;
  timestamp: Date;
}


export enum PasswordStrength {
  WEAK = 'weak',
  MEDIUM = 'medium',
  STRONG = 'strong',
  VERY_STRONG = 'very_strong',
}


export enum WalletStatus {
  ACTIVE = 'active',
  LOCKED = 'locked',
  SUSPENDED = 'suspended',
  ARCHIVED = 'archived',
}


export enum AuthMethod {
  PASSWORD = 'password',
  BIOMETRIC = 'biometric',
  PIN = 'pin',
  PASSKEY = 'passkey',
}


export enum WalletEventType {
  CREATED = 'created',
  UNLOCKED = 'unlocked',
  LOCKED = 'locked',
  TRANSACTION_SENT = 'transaction_sent',
  BACKUP_CREATED = 'backup_created',
  PASSWORD_CHANGED = 'password_changed',
  RECOVERY_INITIATED = 'recovery_initiated',
}


export interface WalletEvent {
  id: string;
  walletId: string;
  userId: string;
  eventType: WalletEventType;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}
