/**
 * @fileoverview Backup Validator
 * @description Validates backup integrity and format
 * @author Galaxy DevKit Team
 * @version 1.0.0
 */

import {
  EncryptedBackup,
  BackupValidationResult,
  LegacyBackupFormat,
  BackupFormat,
  BACKUP_VERSION,
} from '../types/backup-types.js';
import { verifyChecksum, generateChecksum } from './checksum.utils.js';

export class BackupValidator {
  validateEncryptedBackup(backup: unknown): BackupValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!backup || typeof backup !== 'object') {
      return {
        valid: false,
        errors: ['Backup data is not a valid object'],
        warnings: [],
        format: 'unknown',
      };
    }

    const backupObj = backup as Record<string, unknown>;

    if (this.isLegacyFormat(backupObj)) {
      return this.validateLegacyBackup(backupObj);
    }

    if (!backupObj.version) {
      errors.push('Missing version field');
    } else if (typeof backupObj.version !== 'string') {
      errors.push('Version must be a string');
    }

    if (!backupObj.encryptionAlgorithm) {
      errors.push('Missing encryptionAlgorithm field');
    } else if (backupObj.encryptionAlgorithm !== 'AES-256-GCM') {
      errors.push('Unsupported encryption algorithm');
    }

    if (!backupObj.kdf) {
      errors.push('Missing kdf field');
    } else if (!['PBKDF2', 'Argon2'].includes(backupObj.kdf as string)) {
      errors.push('Unsupported KDF type');
    }

    if (!backupObj.kdfParams || typeof backupObj.kdfParams !== 'object') {
      errors.push('Missing or invalid kdfParams');
    } else {
      const kdfErrors = this.validateKDFParams(
        backupObj.kdf as string,
        backupObj.kdfParams as Record<string, unknown>
      );
      errors.push(...kdfErrors);
    }

    if (!backupObj.iv || typeof backupObj.iv !== 'string') {
      errors.push('Missing or invalid iv field');
    }

    if (!backupObj.authTag || typeof backupObj.authTag !== 'string') {
      errors.push('Missing or invalid authTag field');
    }

    if (!backupObj.ciphertext || typeof backupObj.ciphertext !== 'string') {
      errors.push('Missing or invalid ciphertext field');
    }

    if (!backupObj.metadata || typeof backupObj.metadata !== 'object') {
      errors.push('Missing or invalid metadata');
    } else {
      const metadataErrors = this.validateMetadata(
        backupObj.metadata as Record<string, unknown>
      );
      errors.push(...metadataErrors);
    }

    if (backupObj.version && backupObj.version !== BACKUP_VERSION) {
      warnings.push(`Backup version ${backupObj.version} differs from current ${BACKUP_VERSION}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      format: 'encrypted-json',
      version: backupObj.version as string,
    };
  }

  validateChecksum(backup: EncryptedBackup): boolean {
    if (!backup.metadata?.checksum) {
      return false;
    }

    const dataToHash = JSON.stringify({
      ciphertext: backup.ciphertext,
      iv: backup.iv,
      authTag: backup.authTag,
    });

    return verifyChecksum(dataToHash, backup.metadata.checksum);
  }

  computeChecksum(backup: Partial<EncryptedBackup>): string {
    const dataToHash = JSON.stringify({
      ciphertext: backup.ciphertext,
      iv: backup.iv,
      authTag: backup.authTag,
    });
    return generateChecksum(dataToHash);
  }

  isLegacyFormat(data: unknown): boolean {
    if (!data) {
      return false;
    }

    if (typeof data === 'string') {
      return this.isLegacyString(data);
    }

    if (typeof data !== 'object') {
      return false;
    }

    const obj = data as Record<string, unknown>;
    return (
      obj.salt !== undefined &&
      obj.iv !== undefined &&
      obj.authTag !== undefined &&
      obj.ciphertext !== undefined &&
      obj.version === undefined
    );
  }

  isLegacyString(data: string): boolean {
    const parts = data.split(':');
    return parts.length === 4;
  }

  parseLegacyString(data: string): LegacyBackupFormat | null {
    const parts = data.split(':');
    if (parts.length !== 4) {
      return null;
    }

    return {
      salt: parts[0],
      iv: parts[1],
      authTag: parts[2],
      ciphertext: parts[3],
    };
  }

  private validateLegacyBackup(
    backup: Record<string, unknown>
  ): BackupValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    warnings.push('Legacy backup format detected. Consider migrating to new format.');

    if (!backup.salt || typeof backup.salt !== 'string') {
      errors.push('Missing or invalid salt in legacy backup');
    }

    if (!backup.iv || typeof backup.iv !== 'string') {
      errors.push('Missing or invalid iv in legacy backup');
    }

    if (!backup.authTag || typeof backup.authTag !== 'string') {
      errors.push('Missing or invalid authTag in legacy backup');
    }

    if (!backup.ciphertext || typeof backup.ciphertext !== 'string') {
      errors.push('Missing or invalid ciphertext in legacy backup');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      format: 'legacy',
    };
  }

  private validateKDFParams(
    kdf: string,
    params: Record<string, unknown>
  ): string[] {
    const errors: string[] = [];

    if (!params.salt || typeof params.salt !== 'string') {
      errors.push('Missing or invalid salt in kdfParams');
    }

    if (kdf === 'PBKDF2') {
      if (typeof params.iterations !== 'number' || params.iterations < 10000) {
        errors.push('PBKDF2 iterations must be at least 10000');
      }
      if (typeof params.keyLength !== 'number' || params.keyLength < 16) {
        errors.push('PBKDF2 keyLength must be at least 16');
      }
      if (typeof params.digest !== 'string') {
        errors.push('PBKDF2 digest must be a string');
      }
    } else if (kdf === 'Argon2') {
      if (typeof params.memoryCost !== 'number' || params.memoryCost < 1024) {
        errors.push('Argon2 memoryCost must be at least 1024');
      }
      if (typeof params.timeCost !== 'number' || params.timeCost < 1) {
        errors.push('Argon2 timeCost must be at least 1');
      }
      if (typeof params.parallelism !== 'number' || params.parallelism < 1) {
        errors.push('Argon2 parallelism must be at least 1');
      }
      if (typeof params.hashLength !== 'number' || params.hashLength < 16) {
        errors.push('Argon2 hashLength must be at least 16');
      }
      if (!['argon2id', 'argon2i', 'argon2d'].includes(params.type as string)) {
        errors.push('Argon2 type must be argon2id, argon2i, or argon2d');
      }
    }

    return errors;
  }

  private validateMetadata(metadata: Record<string, unknown>): string[] {
    const errors: string[] = [];

    if (!metadata.created || typeof metadata.created !== 'string') {
      errors.push('Missing or invalid created timestamp in metadata');
    }

    if (typeof metadata.accounts !== 'number' || metadata.accounts < 0) {
      errors.push('Invalid accounts count in metadata');
    }

    if (!metadata.checksum || typeof metadata.checksum !== 'string') {
      errors.push('Missing or invalid checksum in metadata');
    }

    return errors;
  }
}
