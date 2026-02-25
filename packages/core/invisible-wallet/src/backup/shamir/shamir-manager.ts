/**
 * @fileoverview Shamir Secret Sharing Manager
 * @description Implements Shamir's Secret Sharing for wallet backup distribution
 * @author Galaxy DevKit Team
 * @version 1.0.0
 */

import { split, combine } from 'shamir-secret-sharing';
import {
  ShamirShare,
  ShamirBackup,
  EncryptedBackup,
  BackupMetadata,
  BACKUP_VERSION,
} from '../types/backup-types.js';
import { generateChecksum, generateShortChecksum } from '../validation/checksum.utils.js';

const MIN_THRESHOLD = 2;
const MAX_SHARES = 255;

export interface ShamirSplitOptions {
  threshold: number;
  totalShares: number;
}

export class ShamirManager {
  async splitSecret(
    backup: EncryptedBackup,
    options: ShamirSplitOptions
  ): Promise<ShamirBackup> {
    this.validateOptions(options);

    const secretData = JSON.stringify(backup);
    const secretBuffer = Buffer.from(secretData, 'utf8');
    const secretUint8Array = new Uint8Array(secretBuffer);

    const shares = await split(secretUint8Array, options.totalShares, options.threshold);

    const shamirShares: ShamirShare[] = shares.map((shareBuffer: Uint8Array, index: number) => ({
      index: index + 1,
      data: Buffer.from(shareBuffer).toString('base64'),
      threshold: options.threshold,
      total: options.totalShares,
      checksum: generateShortChecksum(Buffer.from(shareBuffer)),
    }));

    const metadata: BackupMetadata = {
      created: new Date().toISOString(),
      accounts: backup.metadata.accounts,
      checksum: generateChecksum(secretData),
      walletId: backup.metadata.walletId,
      network: backup.metadata.network,
    };

    return {
      version: BACKUP_VERSION,
      threshold: options.threshold,
      total: options.totalShares,
      shares: shamirShares,
      metadata,
    };
  }

  async combineShares(shares: ShamirShare[]): Promise<EncryptedBackup> {
    if (shares.length === 0) {
      throw new Error('No shares provided');
    }

    const threshold = shares[0].threshold;
    if (shares.length < threshold) {
      throw new Error(
        `Insufficient shares: need at least ${threshold}, got ${shares.length}`
      );
    }

    this.validateShares(shares);

    const shareBuffers: Uint8Array[] = shares.map(
      (share) => new Uint8Array(Buffer.from(share.data, 'base64'))
    );

    const combined = await combine(shareBuffers);
    const combinedBuffer = Buffer.from(combined);
    const jsonString = combinedBuffer.toString('utf8');

    try {
      return JSON.parse(jsonString) as EncryptedBackup;
    } catch (error) {
      throw new Error('Failed to reconstruct backup: Invalid share combination');
    }
  }

  validateShare(share: ShamirShare): boolean {
    if (
      typeof share.index !== 'number' ||
      share.index < 1 ||
      share.index > MAX_SHARES
    ) {
      return false;
    }

    if (typeof share.data !== 'string' || share.data.length === 0) {
      return false;
    }

    if (
      typeof share.threshold !== 'number' ||
      share.threshold < MIN_THRESHOLD
    ) {
      return false;
    }

    if (
      typeof share.total !== 'number' ||
      share.total < share.threshold
    ) {
      return false;
    }

    try {
      const shareBuffer = Buffer.from(share.data, 'base64');
      const actualChecksum = generateShortChecksum(shareBuffer);
      return actualChecksum === share.checksum;
    } catch {
      return false;
    }
  }

  private validateOptions(options: ShamirSplitOptions): void {
    if (options.threshold < MIN_THRESHOLD) {
      throw new Error(`Threshold must be at least ${MIN_THRESHOLD}`);
    }

    if (options.totalShares > MAX_SHARES) {
      throw new Error(`Total shares cannot exceed ${MAX_SHARES}`);
    }

    if (options.threshold > options.totalShares) {
      throw new Error('Threshold cannot exceed total shares');
    }
  }

  private validateShares(shares: ShamirShare[]): void {
    const threshold = shares[0].threshold;
    const total = shares[0].total;

    for (const share of shares) {
      if (share.threshold !== threshold || share.total !== total) {
        throw new Error('Shares have inconsistent threshold or total values');
      }

      if (!this.validateShare(share)) {
        throw new Error(`Invalid share at index ${share.index}`);
      }
    }

    const indices = new Set(shares.map((s) => s.index));
    if (indices.size !== shares.length) {
      throw new Error('Duplicate share indices detected');
    }
  }

  getSharesForDistribution(shamirBackup: ShamirBackup): {
    share: ShamirShare;
    instructions: string;
  }[] {
    return shamirBackup.shares.map((share) => ({
      share,
      instructions: this.generateShareInstructions(share, shamirBackup),
    }));
  }

  private generateShareInstructions(
    share: ShamirShare,
    backup: ShamirBackup
  ): string {
    return `
SHAMIR SECRET SHARE #${share.index}

This is share ${share.index} of ${share.total} for wallet backup.
Recovery requires ${share.threshold} of ${share.total} shares.

IMPORTANT:
- Keep this share secure and separate from other shares
- Do not store multiple shares together
- Share only with trusted parties
- Record the checksum: ${share.checksum}

Wallet ID: ${backup.metadata.walletId ?? 'Not specified'}
Network: ${backup.metadata.network ?? 'Not specified'}
Created: ${backup.metadata.created}

Share Data:
${share.data}
    `.trim();
  }

  createShareCard(share: ShamirShare): string {
    return JSON.stringify({
      version: BACKUP_VERSION,
      type: 'shamir-share',
      share,
    });
  }

  parseShareCard(cardData: string): ShamirShare {
    try {
      const parsed = JSON.parse(cardData);
      if (parsed.type !== 'shamir-share' || !parsed.share) {
        throw new Error('Invalid share card format');
      }
      return parsed.share as ShamirShare;
    } catch (error) {
      throw new Error('Failed to parse share card');
    }
  }
}
