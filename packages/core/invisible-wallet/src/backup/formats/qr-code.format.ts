/**
 * @fileoverview QR Code Backup Format
 * @description QR code generation for mobile-friendly backups
 * @author Galaxy DevKit Team
 * @version 1.0.0
 */

import * as QRCode from 'qrcode';
import { BaseBackupFormat, FormatOptions } from './base-format.js';
import { EncryptedJsonFormat, EncryptedJsonOptions } from './encrypted-json.format.js';
import {
  BackupFormat,
  WalletBackupData,
  EncryptedBackup,
  QRCodeOptions,
} from '../types/backup-types.js';

export interface QRCodeBackup {
  qrDataUrl: string;
  encryptedBackup: EncryptedBackup;
}

export interface QRCodeFormatOptions extends FormatOptions, QRCodeOptions, EncryptedJsonOptions {}

export class QRCodeFormat extends BaseBackupFormat<QRCodeBackup> {
  readonly format: BackupFormat = 'qr-code';

  private encryptedJsonFormat: EncryptedJsonFormat;

  constructor() {
    super();
    this.encryptedJsonFormat = new EncryptedJsonFormat();
  }

  async encode(
    data: WalletBackupData,
    password: string,
    options?: QRCodeFormatOptions
  ): Promise<QRCodeBackup> {
    const encryptedBackup = await this.encryptedJsonFormat.encode(data, password, {
      kdf: options?.kdf,
      kdfParams: options?.kdfParams,
      label: options?.label,
    });

    const qrOptions: QRCode.QRCodeToDataURLOptions = {
      type: 'image/png',
      width: options?.size ?? 300,
      margin: options?.margin ?? 2,
      errorCorrectionLevel: options?.errorCorrectionLevel ?? 'M',
    };

    const qrDataUrl = await QRCode.toDataURL(
      JSON.stringify(encryptedBackup),
      qrOptions
    );

    return {
      qrDataUrl,
      encryptedBackup,
    };
  }

  async decode(
    backup: QRCodeBackup,
    password: string,
    _options?: QRCodeFormatOptions
  ): Promise<WalletBackupData> {
    return this.encryptedJsonFormat.decode(backup.encryptedBackup, password);
  }

  validate(backup: QRCodeBackup): boolean {
    return (
      backup.qrDataUrl !== undefined &&
      backup.qrDataUrl.startsWith('data:image/') &&
      backup.encryptedBackup !== undefined &&
      this.encryptedJsonFormat.validate(backup.encryptedBackup)
    );
  }

  async generateQRFromEncryptedBackup(
    encryptedBackup: EncryptedBackup,
    options?: QRCodeOptions
  ): Promise<string> {
    const qrOptions: QRCode.QRCodeToDataURLOptions = {
      type: 'image/png',
      width: options?.size ?? 300,
      margin: options?.margin ?? 2,
      errorCorrectionLevel: options?.errorCorrectionLevel ?? 'M',
    };

    return QRCode.toDataURL(JSON.stringify(encryptedBackup), qrOptions);
  }

  async generateQRString(
    encryptedBackup: EncryptedBackup,
    options?: QRCodeOptions
  ): Promise<string> {
    const qrOptions: QRCode.QRCodeRenderersOptions = {
      errorCorrectionLevel: options?.errorCorrectionLevel ?? 'M',
    };

    return QRCode.toString(JSON.stringify(encryptedBackup), {
      ...qrOptions,
      type: 'terminal',
    });
  }

  async generateQRSvg(
    encryptedBackup: EncryptedBackup,
    options?: QRCodeOptions
  ): Promise<string> {
    const qrOptions: QRCode.QRCodeToStringOptions = {
      type: 'svg',
      width: options?.size ?? 300,
      margin: options?.margin ?? 2,
      errorCorrectionLevel: options?.errorCorrectionLevel ?? 'M',
    };

    return QRCode.toString(JSON.stringify(encryptedBackup), qrOptions);
  }
}
