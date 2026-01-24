/**
 * @fileoverview Restore Manager
 * @description Handles wallet restoration from various backup formats
 * @author Galaxy DevKit Team
 * @version 1.0.0
 */

import {
  EncryptedBackup,
  WalletBackupData,
  RestoreOptions,
  BackupValidationResult,
  ShamirShare,
  MnemonicBackup,
} from '../types/backup-types';
import { EncryptedJsonFormat } from '../formats/encrypted-json.format';
import { QRCodeBackup } from '../formats/qr-code.format';
import { PaperWalletBackup } from '../formats/paper-wallet.format';
import { MnemonicFormat } from '../formats/mnemonic.format';
import { ShamirManager } from '../shamir/shamir-manager';
import { BackupValidator } from '../validation/backup-validator';
import { MigrationService } from './migration.service';

export interface RestoreResult {
  success: boolean;
  data?: WalletBackupData;
  error?: string;
  warnings: string[];
  migrated: boolean;
  originalFormat: string;
}

export class RestoreManager {
  private encryptedJsonFormat: EncryptedJsonFormat;
  private mnemonicFormat: MnemonicFormat;
  private shamirManager: ShamirManager;
  private validator: BackupValidator;
  private migrationService: MigrationService;

  constructor() {
    this.encryptedJsonFormat = new EncryptedJsonFormat();
    this.mnemonicFormat = new MnemonicFormat();
    this.shamirManager = new ShamirManager();
    this.validator = new BackupValidator();
    this.migrationService = new MigrationService();
  }

  async restoreFromEncryptedJson(
    backup: EncryptedBackup,
    password: string,
    options?: RestoreOptions
  ): Promise<RestoreResult> {
    const warnings: string[] = [];

    const validation = this.validator.validateEncryptedBackup(backup);
    if (!validation.valid) {
      return {
        success: false,
        error: `Invalid backup: ${validation.errors.join(', ')}`,
        warnings: validation.warnings,
        migrated: false,
        originalFormat: 'encrypted-json',
      };
    }

    warnings.push(...validation.warnings);

    if (options?.validateChecksum && !this.validator.validateChecksum(backup)) {
      return {
        success: false,
        error: 'Checksum validation failed',
        warnings,
        migrated: false,
        originalFormat: 'encrypted-json',
      };
    }

    try {
      const data = await this.encryptedJsonFormat.decode(backup, password);

      return {
        success: true,
        data,
        warnings,
        migrated: false,
        originalFormat: 'encrypted-json',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Restore failed',
        warnings,
        migrated: false,
        originalFormat: 'encrypted-json',
      };
    }
  }

  async restoreFromQRCode(
    backup: QRCodeBackup,
    password: string,
    options?: RestoreOptions
  ): Promise<RestoreResult> {
    return this.restoreFromEncryptedJson(
      backup.encryptedBackup,
      password,
      options
    );
  }

  async restoreFromPaperWallet(
    backup: PaperWalletBackup,
    password: string,
    options?: RestoreOptions
  ): Promise<RestoreResult> {
    return this.restoreFromEncryptedJson(
      backup.encryptedBackup,
      password,
      options
    );
  }

  async restoreFromMnemonic(
    backup: MnemonicBackup,
    password: string,
    _options?: RestoreOptions
  ): Promise<RestoreResult> {
    try {
      const data = await this.mnemonicFormat.decode(backup, password);

      return {
        success: true,
        data,
        warnings: [],
        migrated: false,
        originalFormat: 'mnemonic',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Mnemonic restore failed',
        warnings: [],
        migrated: false,
        originalFormat: 'mnemonic',
      };
    }
  }

  async restoreFromMnemonicPhrase(
    mnemonic: string,
    accountIndex: number = 0
  ): Promise<RestoreResult> {
    if (!this.mnemonicFormat.validateMnemonic(mnemonic)) {
      return {
        success: false,
        error: 'Invalid mnemonic phrase',
        warnings: [],
        migrated: false,
        originalFormat: 'mnemonic-phrase',
      };
    }

    try {
      const keypair = await this.mnemonicFormat.deriveKeypair(mnemonic, accountIndex);

      const data: WalletBackupData = {
        id: '',
        publicKey: keypair.publicKey(),
        encryptedPrivateKey: keypair.secret(),
        network: 'testnet',
        createdAt: new Date().toISOString(),
      };

      return {
        success: true,
        data,
        warnings: ['Wallet restored from mnemonic phrase. Remember to encrypt the private key.'],
        migrated: false,
        originalFormat: 'mnemonic-phrase',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Derivation failed',
        warnings: [],
        migrated: false,
        originalFormat: 'mnemonic-phrase',
      };
    }
  }

  async restoreFromShamirShares(
    shares: ShamirShare[],
    password: string,
    options?: RestoreOptions
  ): Promise<RestoreResult> {
    try {
      const encryptedBackup = await this.shamirManager.combineShares(shares);

      return this.restoreFromEncryptedJson(encryptedBackup, password, options);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Shamir reconstruction failed',
        warnings: [],
        migrated: false,
        originalFormat: 'shamir',
      };
    }
  }

  async restoreFromLegacy(
    legacyData: string,
    password: string,
    options?: RestoreOptions
  ): Promise<RestoreResult> {
    const format = this.migrationService.detectFormat(legacyData);

    if (format === 'unknown') {
      return {
        success: false,
        error: 'Unknown backup format',
        warnings: [],
        migrated: false,
        originalFormat: 'unknown',
      };
    }

    if (format === 'new') {
      try {
        const backup = JSON.parse(legacyData) as EncryptedBackup;
        return this.restoreFromEncryptedJson(backup, password, options);
      } catch {
        return {
          success: false,
          error: 'Failed to parse backup data',
          warnings: [],
          migrated: false,
          originalFormat: 'encrypted-json',
        };
      }
    }

    if (options?.migrateFormat !== false) {
      const migrationResult = await this.migrationService.migrateLegacyBackup(
        legacyData,
        password
      );

      if (migrationResult.success && migrationResult.backup) {
        const restoreResult = await this.restoreFromEncryptedJson(
          migrationResult.backup,
          password,
          options
        );

        return {
          ...restoreResult,
          migrated: true,
          originalFormat: format,
          warnings: [
            ...restoreResult.warnings,
            `Backup migrated from ${format} to encrypted-json format`,
          ],
        };
      }

      return {
        success: false,
        error: migrationResult.error || 'Migration failed',
        warnings: [],
        migrated: false,
        originalFormat: format,
      };
    }

    return {
      success: false,
      error: 'Legacy format detected but migration disabled',
      warnings: ['Enable migrateFormat option to restore legacy backups'],
      migrated: false,
      originalFormat: format,
    };
  }

  async autoRestore(
    backupData: string | object,
    password: string,
    options?: RestoreOptions
  ): Promise<RestoreResult> {
    if (typeof backupData === 'string') {
      return this.restoreFromLegacy(backupData, password, options);
    }

    const backupObj = backupData as Record<string, unknown>;

    if (backupObj.qrDataUrl && backupObj.encryptedBackup) {
      return this.restoreFromQRCode(backupData as QRCodeBackup, password, options);
    }

    if (backupObj.html && backupObj.encryptedBackup) {
      return this.restoreFromPaperWallet(backupData as PaperWalletBackup, password, options);
    }

    if (backupObj.mnemonic && backupObj.derivationPath) {
      return this.restoreFromMnemonic(backupData as MnemonicBackup, password, options);
    }

    if (backupObj.version && backupObj.encryptionAlgorithm) {
      return this.restoreFromEncryptedJson(
        backupData as EncryptedBackup,
        password,
        options
      );
    }

    return {
      success: false,
      error: 'Unable to determine backup format',
      warnings: [],
      migrated: false,
      originalFormat: 'unknown',
    };
  }

  validateBackup(backup: unknown): BackupValidationResult {
    return this.validator.validateEncryptedBackup(backup);
  }

  parseShareCard(cardData: string): ShamirShare {
    return this.shamirManager.parseShareCard(cardData);
  }

  parseBackupString(backupString: string): EncryptedBackup | null {
    try {
      const parsed = JSON.parse(backupString);
      if (this.encryptedJsonFormat.validate(parsed)) {
        return parsed as EncryptedBackup;
      }
      return null;
    } catch {
      return null;
    }
  }

  parseBase64Backup(base64: string): EncryptedBackup | null {
    try {
      const jsonString = Buffer.from(base64, 'base64').toString('utf8');
      return this.parseBackupString(jsonString);
    } catch {
      return null;
    }
  }
}
