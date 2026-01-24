/**
 * @fileoverview Backup types and interfaces
 * @description Type definitions for wallet backup/restore functionality
 * @author Galaxy DevKit Team
 * @version 1.0.0
 */

export type KDFType = 'PBKDF2' | 'Argon2';
export type BackupFormat = 'encrypted-json' | 'qr-code' | 'mnemonic' | 'paper-wallet';
export type EncryptionAlgorithm = 'AES-256-GCM';

export interface PBKDF2Params {
  salt: string;
  iterations: number;
  keyLength: number;
  digest: string;
}

export interface Argon2Params {
  salt: string;
  memoryCost: number;
  timeCost: number;
  parallelism: number;
  hashLength: number;
  type: 'argon2id' | 'argon2i' | 'argon2d';
}

export type KDFParams = PBKDF2Params | Argon2Params;

export interface BackupMetadata {
  created: string;
  accounts: number;
  checksum: string;
  walletId?: string;
  network?: string;
  label?: string;
}

export interface EncryptedBackup {
  version: string;
  encryptionAlgorithm: EncryptionAlgorithm;
  kdf: KDFType;
  kdfParams: KDFParams;
  iv: string;
  authTag: string;
  ciphertext: string;
  metadata: BackupMetadata;
}

export interface ShamirShare {
  index: number;
  data: string;
  threshold: number;
  total: number;
  checksum: string;
}

export interface ShamirBackup {
  version: string;
  threshold: number;
  total: number;
  shares: ShamirShare[];
  metadata: BackupMetadata;
}

export interface WalletBackupData {
  id: string;
  publicKey: string;
  encryptedPrivateKey: string;
  network: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface BackupOptions {
  format: BackupFormat;
  kdf: KDFType;
  label?: string;
  includeMetadata?: boolean;
}

export interface RestoreOptions {
  validateChecksum?: boolean;
  migrateFormat?: boolean;
}

export interface QRCodeOptions {
  size?: number;
  errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
  margin?: number;
}

export interface PaperWalletOptions {
  includeQR?: boolean;
  includeInstructions?: boolean;
  theme?: 'light' | 'dark';
}

export interface MnemonicBackup {
  version: string;
  mnemonic: string;
  derivationPath: string;
  accountIndex: number;
  metadata: BackupMetadata;
}

export interface LegacyBackupFormat {
  salt: string;
  iv: string;
  authTag: string;
  ciphertext: string;
}

export interface BackupValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  format: BackupFormat | 'legacy' | 'unknown';
  version?: string;
}

export interface MigrationResult {
  success: boolean;
  backup?: EncryptedBackup;
  error?: string;
  fromFormat: string;
  toFormat: string;
}

export const BACKUP_VERSION = '2.0.0';
export const DEFAULT_PBKDF2_ITERATIONS = 100000;
export const DEFAULT_ARGON2_MEMORY_COST = 65536;
export const DEFAULT_ARGON2_TIME_COST = 3;
export const DEFAULT_ARGON2_PARALLELISM = 4;
