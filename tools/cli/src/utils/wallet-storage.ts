/**
 * @fileoverview Wallet Storage Utility
 * @description Manages local wallet storage and secure credential handling
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import {
    encryptPrivateKey,
    withDecryptedKey
} from '@galaxy-kj/core-invisible-wallet/encryption';

const WALLETS_DIR = 'wallets';
const GALAXY_DIR = '.galaxy';

export interface EncryptedPayload {
    salt: string;
    iv: string;
    authTag: string;
    content: string;
}

export interface WalletData {
    publicKey: string;
    secretKey: string;
    network: 'testnet' | 'mainnet';
    createdAt: string;
    importedAt?: string;
    name?: string;
}

export interface EncryptedWalletData {
    publicKey: string;
    encryptedSecret: string | EncryptedPayload;
    network: 'testnet' | 'mainnet';
    createdAt: string;
    importedAt?: string;
    encrypted: true;
    encryptionProvider?: 'invisible-wallet';
}

export interface WalletInfo {
    name: string;
    publicKey: string;
    network: string;
    encrypted?: boolean;
}

export class WalletStorage {
    private walletsDir: string;

    constructor() {
        const homeDir = os.homedir();
        this.walletsDir = path.join(homeDir, GALAXY_DIR, WALLETS_DIR);
    }

    /**
     * Ensures the wallets directory exists
     */
    async ensureDir(): Promise<void> {
        await fs.ensureDir(this.walletsDir, 0o700);
        await fs.chmod(this.walletsDir, 0o700);
    }

    /**
     * Get the path to the wallets directory
     */
    getWalletsDir(): string {
        return this.walletsDir;
    }

    /**
     * Get wallet file path
     */
    getWalletPath(name: string): string {
        this.validateName(name);
        return path.join(this.walletsDir, `${name}.json`);
    }

    private validateName(name: string): void {
        if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(name)) {
            throw new Error(
                'Wallet name must be 1-64 characters and contain only letters, numbers, ".", "_" or "-".'
            );
        }
    }

    private async writeWalletFile(walletPath: string, data: object): Promise<void> {
        await fs.writeJson(walletPath, data, { spaces: 2, mode: 0o600 });
        await fs.chmod(walletPath, 0o600);
    }

    /**
     * Check if wallet exists
     */
    async walletExists(name: string): Promise<boolean> {
        const walletPath = this.getWalletPath(name);
        return await fs.pathExists(walletPath);
    }

    /**
     * Save wallet data
     */
    async saveWallet(name: string, data: WalletData): Promise<void> {
        await this.ensureDir();
        const walletPath = this.getWalletPath(name);
        await this.writeWalletFile(walletPath, data);
    }

    /**
     * Save wallet with the invisible-wallet module (AES-256-GCM + Argon2id).
     */
    async saveWalletEncrypted(name: string, data: WalletData, password: string): Promise<void> {
        if (password.length < 8) {
            throw new Error('Wallet password must be at least 8 characters');
        }
        await this.ensureDir();
        const walletPath = this.getWalletPath(name);
        const encryptedSecret = await encryptPrivateKey(data.secretKey, password);
        const payload: EncryptedWalletData = {
            publicKey: data.publicKey,
            encryptedSecret,
            network: data.network,
            createdAt: data.createdAt,
            ...(data.importedAt ? { importedAt: data.importedAt } : {}),
            encrypted: true,
            encryptionProvider: 'invisible-wallet'
        };
        await this.writeWalletFile(walletPath, payload);
    }

    /**
     * Load wallet data (raw on-disk shape, may be encrypted).
     */
    async loadWallet(name: string): Promise<WalletData | EncryptedWalletData | null> {
        const walletPath = this.getWalletPath(name);
        if (!await fs.pathExists(walletPath)) {
            return null;
        }
        return await fs.readJson(walletPath);
    }

    /**
     * Returns true if the on-disk wallet stores its secret encrypted.
     */
    async isWalletEncrypted(name: string): Promise<boolean> {
        const raw = await this.loadWallet(name);
        return !!raw && (raw as EncryptedWalletData).encrypted === true;
    }

    /**
     * Load a wallet and return it with secretKey decrypted. Throws if password is wrong.
     * For unencrypted wallets, password is ignored.
     */
    async loadWalletDecrypted(name: string, password?: string): Promise<WalletData | null> {
        const raw = await this.loadWallet(name);
        if (!raw) return null;
        if ((raw as EncryptedWalletData).encrypted) {
            const enc = raw as EncryptedWalletData;
            if (!password) {
                throw new Error(`Wallet '${name}' is encrypted; a password is required`);
            }
            const secretKey = typeof enc.encryptedSecret === 'string'
                ? await withDecryptedKey(
                    enc.encryptedSecret,
                    password,
                    keyBuffer => keyBuffer.toString('utf8')
                )
                : WalletStorage.decrypt(enc.encryptedSecret, password);
            return {
                publicKey: enc.publicKey,
                secretKey,
                network: enc.network,
                createdAt: enc.createdAt,
                ...(enc.importedAt ? { importedAt: enc.importedAt } : {})
            };
        }
        return raw as WalletData;
    }

    /**
     * Delete wallet
     */
    async deleteWallet(name: string): Promise<boolean> {
        const walletPath = this.getWalletPath(name);
        if (!await fs.pathExists(walletPath)) {
            return false;
        }
        await fs.remove(walletPath);
        return true;
    }

    /**
     * List all wallets
     */
    async listWallets(): Promise<WalletInfo[]> {
        await this.ensureDir();
        
        if (!await fs.pathExists(this.walletsDir)) {
            return [];
        }

        const files = await fs.readdir(this.walletsDir);
        const walletFiles = files.filter(f => f.endsWith('.json'));

        const wallets: WalletInfo[] = [];
        for (const file of walletFiles) {
            try {
                const content = await fs.readJson(path.join(this.walletsDir, file));
                wallets.push({
                    name: path.basename(file, '.json'),
                    publicKey: content.publicKey,
                    network: content.network || 'unknown',
                    encrypted: content.encrypted === true
                });
            } catch (e) {
                // Ignore invalid files
            }
        }

        return wallets;
    }

    /**
     * Get all wallet data (with secrets)
     */
    async getAllWallets(): Promise<(WalletData & { name: string })[]> {
        await this.ensureDir();
        
        if (!await fs.pathExists(this.walletsDir)) {
            return [];
        }

        const files = await fs.readdir(this.walletsDir);
        const wallets: (WalletData & { name: string })[] = [];

        for (const file of files) {
            if (file.endsWith('.json')) {
                try {
                    const content = await fs.readJson(path.join(this.walletsDir, file));
                    wallets.push({
                        ...content,
                        name: path.basename(file, '.json')
                    });
                } catch (e) {
                    // Ignore invalid files
                }
            }
        }

        return wallets;
    }

    /**
     * Encrypt data with password
     */
    static encrypt(text: string, password: string): any {
        const algorithm = 'aes-256-gcm';
        const salt = crypto.randomBytes(16);
        const key = crypto.scryptSync(password, salt as any, 32);
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv(algorithm, key as any, iv as any);

        let encrypted = cipher.update(text, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();

        return {
            salt: salt.toString('hex'),
            iv: iv.toString('hex'),
            authTag: authTag.toString('hex'),
            content: encrypted
        };
    }

    /**
     * Decrypt data with password
     */
    static decrypt(encryptedData: any, password: string): string {
        const algorithm = 'aes-256-gcm';
        const salt = Buffer.from(encryptedData.salt, 'hex');
        const iv = Buffer.from(encryptedData.iv, 'hex');
        const authTag = Buffer.from(encryptedData.authTag, 'hex');
        const key = crypto.scryptSync(password, salt as any, 32);

        const decipher = crypto.createDecipheriv(algorithm, key as any, iv as any);
        decipher.setAuthTag(authTag as any);

        let decrypted = decipher.update(encryptedData.content, 'hex', 'utf8');
        decrypted += decipher.final('utf8');

        return decrypted;
    }
}

export const walletStorage = new WalletStorage();
