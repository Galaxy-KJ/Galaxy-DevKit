/**
 * @fileoverview Encrypted JSON Backup Format
 * @description Main backup format with AES-256-GCM encryption
 * @author Galaxy DevKit Team
 * @version 1.0.0
 */

import * as crypto from 'crypto';
import { BaseBackupFormat, FormatOptions } from './base-format.js';
import { PBKDF2Provider } from '../encryption/pbkdf2-provider.js';
import { Argon2Provider } from '../encryption/argon2-provider.js';
import { IKDFProvider } from '../encryption/kdf-provider.js';
import {
  BackupFormat,
  EncryptedBackup,
  WalletBackupData,
  KDFType,
  KDFParams,
  PBKDF2Params,
  Argon2Params,
} from '../types/backup-types.js';
import { generateChecksum } from '../validation/checksum.utils.js';

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;

export interface EncryptedJsonOptions extends FormatOptions {
  kdf?: KDFType;
  kdfParams?: Partial<KDFParams>;
  label?: string;
}

export class EncryptedJsonFormat extends BaseBackupFormat<EncryptedBackup> {
  readonly format: BackupFormat = 'encrypted-json';

  private pbkdf2Provider: PBKDF2Provider;
  private argon2Provider: Argon2Provider;

  constructor() {
    super();
    this.pbkdf2Provider = new PBKDF2Provider();
    this.argon2Provider = new Argon2Provider();
  }

  async encode(
    data: WalletBackupData,
    password: string,
    options?: EncryptedJsonOptions
  ): Promise<EncryptedBackup> {
    const kdfType: KDFType = options?.kdf ?? 'Argon2';
    const provider = this.getProvider(kdfType);
    const kdfParams = options?.kdfParams
      ? this.mergeKdfParams(provider, options.kdfParams)
      : provider.generateParams();

    const key = await provider.deriveKey(password, kdfParams);
    const iv = crypto.randomBytes(IV_LENGTH);

    const plaintext = JSON.stringify(data);
    const cipher = crypto.createCipheriv(ALGO, key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    const ciphertext = encrypted.toString('base64');
    const ivBase64 = iv.toString('base64');
    const authTagBase64 = authTag.toString('base64');

    const checksum = generateChecksum(
      JSON.stringify({ ciphertext, iv: ivBase64, authTag: authTagBase64 })
    );

    const metadata = {
      ...this.createMetadata(data, { ciphertext, iv: ivBase64, authTag: authTagBase64 }),
      checksum,
      label: options?.label,
    };

    return {
      version: this.getVersion(),
      encryptionAlgorithm: 'AES-256-GCM',
      kdf: kdfType,
      kdfParams,
      iv: ivBase64,
      authTag: authTagBase64,
      ciphertext,
      metadata,
    };
  }

  async decode(
    backup: EncryptedBackup,
    password: string,
    _options?: EncryptedJsonOptions
  ): Promise<WalletBackupData> {
    const provider = this.getProvider(backup.kdf);

    if (!provider.validateParams(backup.kdfParams)) {
      throw new Error('Invalid KDF parameters');
    }

    const key = await provider.deriveKey(password, backup.kdfParams);

    const iv = Buffer.from(backup.iv, 'base64');
    const authTag = Buffer.from(backup.authTag, 'base64');
    const ciphertext = Buffer.from(backup.ciphertext, 'base64');

    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);

    try {
      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      return JSON.parse(decrypted.toString('utf8'));
    } catch (error) {
      throw new Error('Decryption failed: Invalid password or corrupted data');
    }
  }

  validate(backup: EncryptedBackup): boolean {
    return (
      backup.version !== undefined &&
      backup.encryptionAlgorithm === 'AES-256-GCM' &&
      ['PBKDF2', 'Argon2'].includes(backup.kdf) &&
      backup.kdfParams !== undefined &&
      backup.iv !== undefined &&
      backup.authTag !== undefined &&
      backup.ciphertext !== undefined &&
      backup.metadata !== undefined
    );
  }

  private getProvider(kdf: KDFType): IKDFProvider {
    return kdf === 'PBKDF2' ? this.pbkdf2Provider : this.argon2Provider;
  }

  private mergeKdfParams(
    provider: IKDFProvider,
    partialParams: Partial<KDFParams>
  ): KDFParams {
    const defaults = provider.generateParams();
    if (provider.type === 'PBKDF2') {
      const pbkdfDefaults = defaults as PBKDF2Params;
      const pbkdfPartial = partialParams as Partial<PBKDF2Params>;
      return {
        salt: pbkdfPartial.salt ?? pbkdfDefaults.salt,
        iterations: pbkdfPartial.iterations ?? pbkdfDefaults.iterations,
        keyLength: pbkdfPartial.keyLength ?? pbkdfDefaults.keyLength,
        digest: pbkdfPartial.digest ?? pbkdfDefaults.digest,
      } as PBKDF2Params;
    } else {
      const argonDefaults = defaults as Argon2Params;
      const argonPartial = partialParams as Partial<Argon2Params>;
      return {
        salt: argonPartial.salt ?? argonDefaults.salt,
        memoryCost: argonPartial.memoryCost ?? argonDefaults.memoryCost,
        timeCost: argonPartial.timeCost ?? argonDefaults.timeCost,
        parallelism: argonPartial.parallelism ?? argonDefaults.parallelism,
        hashLength: argonPartial.hashLength ?? argonDefaults.hashLength,
        type: argonPartial.type ?? argonDefaults.type,
      } as Argon2Params;
    }
  }
}
