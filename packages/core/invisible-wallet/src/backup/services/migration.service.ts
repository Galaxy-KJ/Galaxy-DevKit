/**
 * @fileoverview Migration Service
 * @description Handles migration from legacy backup formats to new format
 * @author Galaxy DevKit Team
 * @version 1.0.0
 */

import * as crypto from 'crypto';
import {
  EncryptedBackup,
  LegacyBackupFormat,
  MigrationResult,
  WalletBackupData,
  KDFType,
  BACKUP_VERSION,
} from '../types/backup-types.js';
import { BackupValidator } from '../validation/backup-validator.js';
import { EncryptedJsonFormat } from '../formats/encrypted-json.format.js';
import { generateChecksum } from '../validation/checksum.utils.js';

const LEGACY_ITERATIONS = 100000;
const LEGACY_KEY_LENGTH = 32;
const ALGO = 'aes-256-gcm';

export class MigrationService {
  private validator: BackupValidator;
  private encryptedJsonFormat: EncryptedJsonFormat;

  constructor() {
    this.validator = new BackupValidator();
    this.encryptedJsonFormat = new EncryptedJsonFormat();
  }

  detectFormat(data: string | object): 'legacy-string' | 'legacy-object' | 'new' | 'unknown' {
    if (typeof data === 'string') {
      if (this.validator.isLegacyString(data)) {
        return 'legacy-string';
      }
      try {
        const parsed = JSON.parse(data);
        return this.detectFormat(parsed);
      } catch {
        return 'unknown';
      }
    }

    if (typeof data === 'object' && data !== null) {
      const obj = data as Record<string, unknown>;
      if (obj.version && obj.encryptionAlgorithm && obj.kdf) {
        return 'new';
      }
      if (this.validator.isLegacyFormat(obj)) {
        return 'legacy-object';
      }
    }

    return 'unknown';
  }

  async migrateLegacyBackup(
    legacyData: string | LegacyBackupFormat,
    password: string,
    targetKdf: KDFType = 'Argon2'
  ): Promise<MigrationResult> {
    try {
      let legacyFormat: LegacyBackupFormat;
      let fromFormat: string;

      if (typeof legacyData === 'string') {
        const parsed = this.validator.parseLegacyString(legacyData);
        if (!parsed) {
          return {
            success: false,
            error: 'Invalid legacy backup string format',
            fromFormat: 'unknown',
            toFormat: 'encrypted-json',
          };
        }
        legacyFormat = parsed;
        fromFormat = 'legacy-string';
      } else {
        legacyFormat = legacyData;
        fromFormat = 'legacy-object';
      }

      const decryptedData = this.decryptLegacy(legacyFormat, password);

      let walletData: WalletBackupData;
      try {
        const parsed = JSON.parse(decryptedData);
        walletData = this.extractWalletData(parsed);
      } catch {
        walletData = {
          id: crypto.randomUUID(),
          publicKey: '',
          encryptedPrivateKey: decryptedData,
          network: 'testnet',
          createdAt: new Date().toISOString(),
        };
      }

      const newBackup = await this.encryptedJsonFormat.encode(
        walletData,
        password,
        { kdf: targetKdf }
      );

      return {
        success: true,
        backup: newBackup,
        fromFormat,
        toFormat: 'encrypted-json',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Migration failed',
        fromFormat: typeof legacyData === 'string' ? 'legacy-string' : 'legacy-object',
        toFormat: 'encrypted-json',
      };
    }
  }

  private decryptLegacy(legacy: LegacyBackupFormat, password: string): string {
    const salt = Buffer.from(legacy.salt, 'base64');
    const iv = Buffer.from(legacy.iv, 'base64');
    const authTag = Buffer.from(legacy.authTag, 'base64');
    const ciphertext = Buffer.from(legacy.ciphertext, 'base64');

    const key = crypto.pbkdf2Sync(
      password,
      salt,
      LEGACY_ITERATIONS,
      LEGACY_KEY_LENGTH,
      'sha256'
    );

    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }

  private extractWalletData(parsed: Record<string, unknown>): WalletBackupData {
    return {
      id: (parsed.id as string) || crypto.randomUUID(),
      publicKey: (parsed.publicKey as string) || '',
      encryptedPrivateKey: (parsed.encryptedPrivateKey as string) || '',
      network: (parsed.network as string) || 'testnet',
      metadata: parsed.metadata as Record<string, unknown>,
      createdAt: (parsed.createdAt as string) || new Date().toISOString(),
    };
  }

  async upgradeBackupVersion(
    backup: EncryptedBackup,
    password: string,
    targetKdf?: KDFType
  ): Promise<MigrationResult> {
    if (backup.version === BACKUP_VERSION && !targetKdf) {
      return {
        success: true,
        backup,
        fromFormat: `encrypted-json-v${backup.version}`,
        toFormat: `encrypted-json-v${BACKUP_VERSION}`,
      };
    }

    try {
      const walletData = await this.encryptedJsonFormat.decode(backup, password);

      const newBackup = await this.encryptedJsonFormat.encode(
        walletData,
        password,
        { kdf: targetKdf || backup.kdf }
      );

      return {
        success: true,
        backup: newBackup,
        fromFormat: `encrypted-json-v${backup.version}`,
        toFormat: `encrypted-json-v${BACKUP_VERSION}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Upgrade failed',
        fromFormat: `encrypted-json-v${backup.version}`,
        toFormat: `encrypted-json-v${BACKUP_VERSION}`,
      };
    }
  }

  canMigrate(data: string | object): boolean {
    const format = this.detectFormat(data);
    return format !== 'unknown';
  }
}
