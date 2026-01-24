/**
 * @fileoverview Backup Module Entry Point
 * @description Exports all backup/restore functionality
 * @author Galaxy DevKit Team
 * @version 1.0.0
 */

// Types
export * from './types/backup-types';

// Encryption Providers
export type { IKDFProvider } from './encryption/kdf-provider';
export { BaseKDFProvider } from './encryption/kdf-provider';
export { PBKDF2Provider } from './encryption/pbkdf2-provider';
export { Argon2Provider } from './encryption/argon2-provider';

// Validation
export { BackupValidator } from './validation/backup-validator';
export {
  generateChecksum as generateBackupChecksum,
  verifyChecksum as verifyBackupChecksum,
  generateShortChecksum,
  generateHMAC as generateBackupHMAC,
  verifyHMAC as verifyBackupHMAC,
} from './validation/checksum.utils';

// Formats
export { BaseBackupFormat } from './formats/base-format';
export type { FormatOptions } from './formats/base-format';
export { EncryptedJsonFormat } from './formats/encrypted-json.format';
export type { EncryptedJsonOptions } from './formats/encrypted-json.format';
export { QRCodeFormat } from './formats/qr-code.format';
export type { QRCodeBackup, QRCodeFormatOptions } from './formats/qr-code.format';
export { PaperWalletFormat } from './formats/paper-wallet.format';
export type { PaperWalletBackup, PaperWalletFormatOptions } from './formats/paper-wallet.format';
export { MnemonicFormat } from './formats/mnemonic.format';
export type { MnemonicOptions } from './formats/mnemonic.format';

// Shamir
export { ShamirManager } from './shamir/shamir-manager';
export type { ShamirSplitOptions } from './shamir/shamir-manager';

// Services
export { BackupManager } from './services/backup-manager';
export type { CreateBackupOptions, ShamirBackupOptions, BackupResult } from './services/backup-manager';
export { RestoreManager } from './services/restore-manager';
export type { RestoreResult } from './services/restore-manager';
export { MigrationService } from './services/migration.service';
