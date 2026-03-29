/**
 * @fileoverview Base Backup Format
 * @description Abstract base class for backup formats
 * @author Galaxy DevKit Team
 * @version 1.0.0
 */

import {
  BackupFormat,
  WalletBackupData,
  BackupMetadata,
  BACKUP_VERSION,
} from '../types/backup-types.js';
import { generateChecksum } from '../validation/checksum.utils.js';

export interface FormatOptions {
  [key: string]: unknown;
}

export abstract class BaseBackupFormat<T = unknown> {
  abstract readonly format: BackupFormat;

  abstract encode(
    data: WalletBackupData,
    password: string,
    options?: FormatOptions
  ): Promise<T>;

  abstract decode(
    encoded: T,
    password: string,
    options?: FormatOptions
  ): Promise<WalletBackupData>;

  abstract validate(encoded: T): boolean;

  protected createMetadata(
    data: WalletBackupData,
    additionalData?: Record<string, unknown>
  ): BackupMetadata {
    const checksumData = JSON.stringify({
      ...additionalData,
      publicKey: data.publicKey,
    });

    return {
      created: new Date().toISOString(),
      accounts: 1,
      checksum: generateChecksum(checksumData),
      walletId: data.id,
      network: data.network,
    };
  }

  protected getVersion(): string {
    return BACKUP_VERSION;
  }
}
