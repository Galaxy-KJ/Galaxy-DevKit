/**
 * @fileoverview Wallet Storage Utility
 * @description Manages local wallet storage and secure credential handling
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const WALLETS_DIR = 'wallets';
const GALAXY_DIR = '.galaxy';

export interface WalletData {
    publicKey: string;
    secretKey: string;
    network: 'testnet' | 'mainnet';
    createdAt: string;
    importedAt?: string;
    name?: string;
}

export interface WalletInfo {
    name: string;
    publicKey: string;
    network: string;
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
        await fs.ensureDir(this.walletsDir);
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
        return path.join(this.walletsDir, `${name}.json`);
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
        await fs.writeJson(walletPath, data, { spaces: 2 });
    }

    /**
     * Load wallet data
     */
    async loadWallet(name: string): Promise<WalletData | null> {
        const walletPath = this.getWalletPath(name);
        if (!await fs.pathExists(walletPath)) {
            return null;
        }
        return await fs.readJson(walletPath);
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
                    network: content.network || 'unknown'
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
