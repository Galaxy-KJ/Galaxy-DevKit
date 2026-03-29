/**
 * @fileoverview Backup Module Entry Point
 * @description Exports all backup/restore functionality
 * @author Galaxy DevKit Team
 * @version 1.0.0
 */

// Types
export * from './types/backup-types.js';

// Encryption Providers
export type { IKDFProvider } from './encryption/kdf-provider.js';
export { BaseKDFProvider } from './encryption/kdf-provider.js';
export { PBKDF2Provider } from './encryption/pbkdf2-provider.js';
export { Argon2Provider } from './encryption/argon2-provider.js';

// Validation
export { BackupValidator } from './validation/backup-validator.js';
export {
  generateChecksum as generateBackupChecksum,
  verifyChecksum as verifyBackupChecksum,
  generateShortChecksum,
  generateHMAC as generateBackupHMAC,
  verifyHMAC as verifyBackupHMAC,
} from './validation/checksum.utils.js';

// Formats
export { BaseBackupFormat } from './formats/base-format.js';
export type { FormatOptions } from './formats/base-format.js';
export { EncryptedJsonFormat } from './formats/encrypted-json.format.js';
export type { EncryptedJsonOptions } from './formats/encrypted-json.format.js';
export { QRCodeFormat } from './formats/qr-code.format.js';
export type { QRCodeBackup, QRCodeFormatOptions } from './formats/qr-code.format.js';
export { PaperWalletFormat } from './formats/paper-wallet.format.js';
export type { PaperWalletBackup, PaperWalletFormatOptions } from './formats/paper-wallet.format.js';
export { MnemonicFormat } from './formats/mnemonic.format.js';
export type { MnemonicOptions } from './formats/mnemonic.format.js';

// Shamir
export { ShamirManager } from './shamir/shamir-manager.js';
export type { ShamirSplitOptions } from './shamir/shamir-manager.js';

// Services
export { BackupManager } from './services/backup-manager.js';
export type { CreateBackupOptions, ShamirBackupOptions, BackupResult } from './services/backup-manager.js';
export { RestoreManager } from './services/restore-manager.js';
export type { RestoreResult } from './services/restore-manager.js';
export { MigrationService } from './services/migration.service.js';
