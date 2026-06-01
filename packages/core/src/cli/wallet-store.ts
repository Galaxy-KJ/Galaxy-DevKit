/**
 * Encrypted local wallet store for Galaxy CLI.
 * Secrets are encrypted at rest; the encryption key is stored in the OS keychain via keytar.
 */

import crypto from 'crypto';
import fs from 'fs-extra';
import os from 'os';
import path from 'path';

const GALAXY_DIR = '.galaxy';
const WALLETS_DIR = 'wallets';
const KEYTAR_SERVICE = 'galaxy-devkit';
const KEYTAR_ACCOUNT = 'wallet-encryption-key';
const ALGORITHM = 'aes-256-gcm';

export interface EncryptedPayload {
  salt: string;
  iv: string;
  authTag: string;
  content: string;
}

export interface StoredWalletRecord {
  publicKey: string;
  network: 'testnet' | 'mainnet';
  createdAt: string;
  importedAt?: string;
  encryptedSecret: EncryptedPayload;
}

export interface WalletListEntry {
  name: string;
  publicKey: string;
  network: string;
}

export interface WalletStoreOptions {
  /** Override wallets directory (for tests). */
  walletsDir?: string;
  /** Override encryption key (skips keytar; for tests/CI). */
  encryptionKey?: string;
}

type KeytarModule = {
  getPassword: (service: string, account: string) => Promise<string | null>;
  setPassword: (service: string, account: string, password: string) => Promise<void>;
};

let keytarModule: KeytarModule | null | undefined;

/** @internal Reset keytar cache (tests only). */
export function __resetKeytarCacheForTests(): void {
  keytarModule = undefined;
}

/** @internal Inject mock keytar (tests only). */
export function __setKeytarForTests(module: KeytarModule | null): void {
  keytarModule = module;
}

async function loadKeytar(): Promise<KeytarModule | null> {
  if (keytarModule !== undefined) {
    return keytarModule;
  }
  try {
    const mod = await import('keytar');
    keytarModule = mod.default ?? mod;
    return keytarModule;
  } catch {
    keytarModule = null;
    return null;
  }
}

export class WalletStore {
  private walletsDir: string;
  private encryptionKeyOverride?: string;

  constructor(options: WalletStoreOptions = {}) {
    const homeDir = os.homedir();
    this.walletsDir =
      options.walletsDir ?? path.join(homeDir, GALAXY_DIR, WALLETS_DIR);
    this.encryptionKeyOverride = options.encryptionKey;
  }

  getWalletsDir(): string {
    return this.walletsDir;
  }

  getWalletPath(name: string): string {
    return path.join(this.walletsDir, `${name}.json`);
  }

  async ensureDir(): Promise<void> {
    await fs.ensureDir(this.walletsDir);
  }

  async walletExists(name: string): Promise<boolean> {
    return fs.pathExists(this.getWalletPath(name));
  }

  /**
   * Resolves or creates the master encryption key (keytar, env, or generated).
   */
  async getEncryptionKey(): Promise<string> {
    if (this.encryptionKeyOverride) {
      return this.encryptionKeyOverride;
    }

    const envKey = process.env.GALAXY_WALLET_ENCRYPTION_KEY;
    if (envKey) {
      return envKey;
    }

    const keytar = await loadKeytar();
    if (keytar) {
      const existing = await keytar.getPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT);
      if (existing) {
        return existing;
      }
      const generated = crypto.randomBytes(32).toString('hex');
      await keytar.setPassword(KEYTAR_SERVICE, KEYTAR_ACCOUNT, generated);
      return generated;
    }

    // Headless / CI fallback: deterministic path-local key file with restricted permissions
    const keyPath = path.join(os.homedir(), GALAXY_DIR, '.wallet-key');
    if (await fs.pathExists(keyPath)) {
      return (await fs.readFile(keyPath, 'utf8')).trim();
    }
    await fs.ensureDir(path.dirname(keyPath));
    const generated = crypto.randomBytes(32).toString('hex');
    await fs.writeFile(keyPath, generated, { mode: 0o600 });
    return generated;
  }

  static encrypt(plaintext: string, password: string): EncryptedPayload {
    const salt = crypto.randomBytes(16);
    const key = crypto.scryptSync(password, salt, 32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    return {
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
      content: encrypted,
    };
  }

  static decrypt(encryptedData: EncryptedPayload, password: string): string {
    const salt = Buffer.from(encryptedData.salt, 'hex');
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const authTag = Buffer.from(encryptedData.authTag, 'hex');
    const key = crypto.scryptSync(password, salt, 32);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedData.content, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  async saveWallet(
    name: string,
    secretKey: string,
    metadata: {
      publicKey: string;
      network: 'testnet' | 'mainnet';
      createdAt: string;
      importedAt?: string;
    }
  ): Promise<void> {
    await this.ensureDir();
    const encryptionKey = await this.getEncryptionKey();
    const record: StoredWalletRecord = {
      publicKey: metadata.publicKey,
      network: metadata.network,
      createdAt: metadata.createdAt,
      importedAt: metadata.importedAt,
      encryptedSecret: WalletStore.encrypt(secretKey, encryptionKey),
    };
    const walletPath = this.getWalletPath(name);
    await fs.writeJson(walletPath, record, { spaces: 2, mode: 0o600 });
  }

  async loadWalletRecord(name: string): Promise<StoredWalletRecord | null> {
    const walletPath = this.getWalletPath(name);
    if (!(await fs.pathExists(walletPath))) {
      return null;
    }
    return (await fs.readJson(walletPath)) as StoredWalletRecord;
  }

  async getSecretKey(name: string): Promise<string | null> {
    const record = await this.loadWalletRecord(name);
    if (!record?.encryptedSecret) {
      return null;
    }
    const encryptionKey = await this.getEncryptionKey();
    return WalletStore.decrypt(record.encryptedSecret, encryptionKey);
  }

  async deleteWallet(name: string): Promise<boolean> {
    const walletPath = this.getWalletPath(name);
    if (!(await fs.pathExists(walletPath))) {
      return false;
    }
    await fs.remove(walletPath);
    return true;
  }

  async listWallets(): Promise<WalletListEntry[]> {
    await this.ensureDir();
    if (!(await fs.pathExists(this.walletsDir))) {
      return [];
    }

    const files = await fs.readdir(this.walletsDir);
    const wallets: WalletListEntry[] = [];

    for (const file of files) {
      if (!file.endsWith('.json')) {
        continue;
      }
      try {
        const content = (await fs.readJson(
          path.join(this.walletsDir, file)
        )) as StoredWalletRecord;
        wallets.push({
          name: path.basename(file, '.json'),
          publicKey: content.publicKey,
          network: content.network ?? 'unknown',
        });
      } catch {
        // skip invalid files
      }
    }

    return wallets;
  }

  /**
   * Resolve `from` as a stored wallet name or a public key (G…).
   */
  async resolveFromWallet(
    from: string
  ): Promise<{ publicKey: string; secretKey: string; network: 'testnet' | 'mainnet' } | null> {
    if (from.startsWith('G') && from.length === 56) {
      const record = await this.loadWalletRecordByPublicKey(from);
      if (!record) {
        return null;
      }
      const secretKey = await this.getSecretKey(record.name);
      if (!secretKey) {
        return null;
      }
      return {
        publicKey: record.record.publicKey,
        secretKey,
        network: record.record.network,
      };
    }

    const record = await this.loadWalletRecord(from);
    if (!record) {
      return null;
    }
    const secretKey = await this.getSecretKey(from);
    if (!secretKey) {
      return null;
    }
    return {
      publicKey: record.publicKey,
      secretKey,
      network: record.network,
    };
  }

  private async loadWalletRecordByPublicKey(
    publicKey: string
  ): Promise<{ name: string; record: StoredWalletRecord } | null> {
    const wallets = await this.listWallets();
    for (const w of wallets) {
      const record = await this.loadWalletRecord(w.name);
      if (record?.publicKey === publicKey) {
        return { name: w.name, record };
      }
    }
    return null;
  }
}

export const defaultWalletStore = new WalletStore();
