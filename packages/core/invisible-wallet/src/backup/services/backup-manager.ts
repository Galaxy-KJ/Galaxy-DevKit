/**
 * @fileoverview Backup Manager
 * @description Main orchestrator for wallet backup operations
 * @author Galaxy DevKit Team
 * @version 1.0.0
 */

import {
  BackupFormat,
  EncryptedBackup,
  WalletBackupData,
  BackupOptions,
  KDFType,
  ShamirBackup,
  ShamirShare,
  QRCodeOptions,
  PaperWalletOptions,
  MnemonicBackup,
} from '../types/backup-types.js';
import { EncryptedJsonFormat } from '../formats/encrypted-json.format.js';
import { QRCodeFormat, QRCodeBackup } from '../formats/qr-code.format.js';
import { PaperWalletFormat, PaperWalletBackup } from '../formats/paper-wallet.format.js';
import { MnemonicFormat } from '../formats/mnemonic.format.js';
import { ShamirManager, ShamirSplitOptions } from '../shamir/shamir-manager.js';
import { BackupValidator } from '../validation/backup-validator.js';
import { InvisibleWallet } from '../../types/wallet.types.js';

export interface CreateBackupOptions extends BackupOptions {
  kdfParams?: Record<string, unknown>;
  qrOptions?: QRCodeOptions;
  paperOptions?: PaperWalletOptions;
  mnemonicStrength?: 128 | 160 | 192 | 224 | 256;
  accountIndex?: number;
}

export interface ShamirBackupOptions extends ShamirSplitOptions {
  kdf?: KDFType;
}

export type BackupResult =
  | EncryptedBackup
  | QRCodeBackup
  | PaperWalletBackup
  | MnemonicBackup;

export class BackupManager {
  private encryptedJsonFormat: EncryptedJsonFormat;
  private qrCodeFormat: QRCodeFormat;
  private paperWalletFormat: PaperWalletFormat;
  private mnemonicFormat: MnemonicFormat;
  private shamirManager: ShamirManager;
  private validator: BackupValidator;

  constructor() {
    this.encryptedJsonFormat = new EncryptedJsonFormat();
    this.qrCodeFormat = new QRCodeFormat();
    this.paperWalletFormat = new PaperWalletFormat();
    this.mnemonicFormat = new MnemonicFormat();
    this.shamirManager = new ShamirManager();
    this.validator = new BackupValidator();
  }

  async createBackup(
    wallet: InvisibleWallet,
    password: string,
    options: CreateBackupOptions
  ): Promise<BackupResult> {
    const walletData = this.walletToBackupData(wallet);

    switch (options.format) {
      case 'encrypted-json':
        return this.createEncryptedJsonBackup(walletData, password, options);

      case 'qr-code':
        return this.createQRCodeBackup(walletData, password, options);

      case 'paper-wallet':
        return this.createPaperWalletBackup(walletData, password, options);

      case 'mnemonic':
        return this.createMnemonicBackup(walletData, password, options);

      default:
        throw new Error(`Unsupported backup format: ${options.format}`);
    }
  }

  async createEncryptedJsonBackup(
    data: WalletBackupData,
    password: string,
    options?: CreateBackupOptions
  ): Promise<EncryptedBackup> {
    return this.encryptedJsonFormat.encode(data, password, {
      kdf: options?.kdf,
      kdfParams: options?.kdfParams,
      label: options?.label,
    });
  }

  async createQRCodeBackup(
    data: WalletBackupData,
    password: string,
    options?: CreateBackupOptions
  ): Promise<QRCodeBackup> {
    return this.qrCodeFormat.encode(data, password, {
      kdf: options?.kdf,
      kdfParams: options?.kdfParams,
      label: options?.label,
      ...options?.qrOptions,
    });
  }

  async createPaperWalletBackup(
    data: WalletBackupData,
    password: string,
    options?: CreateBackupOptions
  ): Promise<PaperWalletBackup> {
    return this.paperWalletFormat.encode(data, password, {
      kdf: options?.kdf,
      kdfParams: options?.kdfParams,
      label: options?.label,
      ...options?.paperOptions,
    });
  }

  async createMnemonicBackup(
    data: WalletBackupData,
    password: string,
    options?: CreateBackupOptions
  ): Promise<MnemonicBackup> {
    return this.mnemonicFormat.encode(data, password, {
      strength: options?.mnemonicStrength,
      accountIndex: options?.accountIndex,
    });
  }

  async createShamirBackup(
    wallet: InvisibleWallet,
    password: string,
    options: ShamirBackupOptions
  ): Promise<ShamirBackup> {
    const walletData = this.walletToBackupData(wallet);

    const encryptedBackup = await this.encryptedJsonFormat.encode(
      walletData,
      password,
      { kdf: options.kdf }
    );

    return this.shamirManager.splitSecret(encryptedBackup, {
      threshold: options.threshold,
      totalShares: options.totalShares,
    });
  }

  async generateQRForBackup(
    backup: EncryptedBackup,
    options?: QRCodeOptions
  ): Promise<string> {
    return this.qrCodeFormat.generateQRFromEncryptedBackup(backup, options);
  }

  async generatePaperWalletHTML(
    wallet: InvisibleWallet,
    password: string,
    options?: CreateBackupOptions
  ): Promise<string> {
    const backup = await this.createPaperWalletBackup(
      this.walletToBackupData(wallet),
      password,
      options
    );
    return backup.html;
  }

  distributeShares(shamirBackup: ShamirBackup): {
    share: ShamirShare;
    instructions: string;
  }[] {
    return this.shamirManager.getSharesForDistribution(shamirBackup);
  }

  createShareCard(share: ShamirShare): string {
    return this.shamirManager.createShareCard(share);
  }

  exportBackupAsString(backup: EncryptedBackup): string {
    return JSON.stringify(backup);
  }

  exportBackupAsBase64(backup: EncryptedBackup): string {
    return Buffer.from(JSON.stringify(backup)).toString('base64');
  }

  private walletToBackupData(wallet: InvisibleWallet): WalletBackupData {
    return {
      id: wallet.id,
      publicKey: wallet.publicKey,
      encryptedPrivateKey: wallet.encryptedPrivateKey,
      network: wallet.network.network,
      metadata: wallet.metadata,
      createdAt: wallet.createdAt.toISOString(),
    };
  }

  validateBackup(backup: unknown): boolean {
    const result = this.validator.validateEncryptedBackup(backup);
    return result.valid;
  }

  getBackupInfo(backup: EncryptedBackup): {
    version: string;
    encryption: string;
    kdf: string;
    created: string;
    accounts: number;
    checksum: string;
  } {
    return {
      version: backup.version,
      encryption: backup.encryptionAlgorithm,
      kdf: backup.kdf,
      created: backup.metadata.created,
      accounts: backup.metadata.accounts,
      checksum: backup.metadata.checksum,
    };
  }
}
