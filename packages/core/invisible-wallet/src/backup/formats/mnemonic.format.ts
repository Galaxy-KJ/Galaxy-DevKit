/**
 * @fileoverview Mnemonic Backup Format
 * @description BIP39 mnemonic phrase backup format
 * @author Galaxy DevKit Team
 * @version 1.0.0
 */

import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import { Keypair } from '@stellar/stellar-sdk';
import { BaseBackupFormat, FormatOptions } from './base-format';
import {
  BackupFormat,
  MnemonicBackup,
  WalletBackupData,
} from '../types/backup-types';
import { EncryptedJsonFormat } from './encrypted-json.format';

const DEFAULT_DERIVATION_PATH = "m/44'/148'";

export interface MnemonicOptions extends FormatOptions {
  strength?: 128 | 160 | 192 | 224 | 256;
  accountIndex?: number;
  derivationPath?: string;
}

export class MnemonicFormat extends BaseBackupFormat<MnemonicBackup> {
  readonly format: BackupFormat = 'mnemonic';

  private encryptedJsonFormat: EncryptedJsonFormat;

  constructor() {
    super();
    this.encryptedJsonFormat = new EncryptedJsonFormat();
  }

  async encode(
    data: WalletBackupData,
    password: string,
    options?: MnemonicOptions
  ): Promise<MnemonicBackup> {
    const strength = options?.strength ?? 256;
    const accountIndex = options?.accountIndex ?? 0;
    const derivationPath = options?.derivationPath ?? DEFAULT_DERIVATION_PATH;

    const mnemonic = bip39.generateMnemonic(strength);

    const metadata = this.createMetadata(data);

    return {
      version: this.getVersion(),
      mnemonic: this.encryptMnemonic(mnemonic, password),
      derivationPath: `${derivationPath}/${accountIndex}'`,
      accountIndex,
      metadata,
    };
  }

  async decode(
    backup: MnemonicBackup,
    password: string,
    _options?: MnemonicOptions
  ): Promise<WalletBackupData> {
    const mnemonic = this.decryptMnemonic(backup.mnemonic, password);

    if (!bip39.validateMnemonic(mnemonic)) {
      throw new Error('Invalid mnemonic phrase');
    }

    const keypair = await this.deriveKeypair(mnemonic, backup.accountIndex);

    return {
      id: backup.metadata.walletId ?? '',
      publicKey: keypair.publicKey(),
      encryptedPrivateKey: keypair.secret(),
      network: backup.metadata.network ?? 'testnet',
      createdAt: backup.metadata.created,
    };
  }

  validate(backup: MnemonicBackup): boolean {
    return (
      backup.version !== undefined &&
      backup.mnemonic !== undefined &&
      backup.derivationPath !== undefined &&
      typeof backup.accountIndex === 'number' &&
      backup.metadata !== undefined
    );
  }

  async deriveKeypair(
    mnemonic: string,
    accountIndex: number = 0,
    derivationPath?: string
  ): Promise<Keypair> {
    const path = derivationPath ?? `${DEFAULT_DERIVATION_PATH}/${accountIndex}'`;
    const seed = await bip39.mnemonicToSeed(mnemonic);
    const { key } = derivePath(path, seed.toString('hex'));
    return Keypair.fromRawEd25519Seed(Buffer.from(key));
  }

  generateMnemonic(strength: 128 | 160 | 192 | 224 | 256 = 256): string {
    return bip39.generateMnemonic(strength);
  }

  validateMnemonic(mnemonic: string): boolean {
    return bip39.validateMnemonic(mnemonic);
  }

  private encryptMnemonic(mnemonic: string, password: string): string {
    const crypto = require('crypto');
    const salt = crypto.randomBytes(16);
    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    const iv = crypto.randomBytes(12);

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(mnemonic, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    return [
      salt.toString('base64'),
      iv.toString('base64'),
      authTag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  private decryptMnemonic(encryptedMnemonic: string, password: string): string {
    const crypto = require('crypto');
    const [saltB64, ivB64, authTagB64, encryptedB64] = encryptedMnemonic.split(':');

    if (!saltB64 || !ivB64 || !authTagB64 || !encryptedB64) {
      throw new Error('Invalid encrypted mnemonic format');
    }

    const salt = Buffer.from(saltB64, 'base64');
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const encrypted = Buffer.from(encryptedB64, 'base64');

    const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }
}
