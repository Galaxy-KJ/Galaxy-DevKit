/**
 * @fileoverview Tests for wallet storage utility
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { WalletStorage } from '../../src/utils/wallet-storage';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { Keypair } from '@stellar/stellar-sdk';

describe('WalletStorage', () => {
    let storage: WalletStorage;
    const testDir = path.join(os.tmpdir(), '.galaxy-test-storage');

    beforeEach(async () => {
        // Create a test storage instance pointing to temp directory
        storage = new WalletStorage();
        
        // Override the wallets directory for testing
        (storage as any).walletsDir = path.join(testDir, 'wallets');
        
        await fs.ensureDir((storage as any).walletsDir);
    });

    afterEach(async () => {
        await fs.remove(testDir);
    });

    describe('saveWallet', () => {
        it('should save wallet data correctly', async () => {
            const pair = Keypair.random();
            const walletData = {
                publicKey: pair.publicKey(),
                secretKey: pair.secret(),
                network: 'testnet' as const,
                createdAt: new Date().toISOString()
            };

            await storage.saveWallet('test-wallet', walletData);

            const exists = await storage.walletExists('test-wallet');
            expect(exists).toBe(true);
        });

        it('should create directory if it does not exist', async () => {
            await fs.remove((storage as any).walletsDir);
            
            const pair = Keypair.random();
            const walletData = {
                publicKey: pair.publicKey(),
                secretKey: pair.secret(),
                network: 'testnet' as const,
                createdAt: new Date().toISOString()
            };

            await storage.saveWallet('new-wallet', walletData);
            
            const exists = await fs.pathExists((storage as any).walletsDir);
            expect(exists).toBe(true);
        });
    });

    describe('loadWallet', () => {
        it('should load saved wallet data', async () => {
            const pair = Keypair.random();
            const walletData = {
                publicKey: pair.publicKey(),
                secretKey: pair.secret(),
                network: 'testnet' as const,
                createdAt: new Date().toISOString()
            };

            await storage.saveWallet('load-test', walletData);
            const loaded = await storage.loadWallet('load-test');

            expect(loaded).not.toBeNull();
            expect(loaded?.publicKey).toBe(walletData.publicKey);
            expect(loaded?.secretKey).toBe(walletData.secretKey);
            expect(loaded?.network).toBe('testnet');
        });

        it('should return null for non-existent wallet', async () => {
            const loaded = await storage.loadWallet('non-existent');
            expect(loaded).toBeNull();
        });
    });

    describe('listWallets', () => {
        it('should list all wallets without secrets', async () => {
            const pair1 = Keypair.random();
            const pair2 = Keypair.random();

            await storage.saveWallet('wallet1', {
                publicKey: pair1.publicKey(),
                secretKey: pair1.secret(),
                network: 'testnet',
                createdAt: new Date().toISOString()
            });

            await storage.saveWallet('wallet2', {
                publicKey: pair2.publicKey(),
                secretKey: pair2.secret(),
                network: 'mainnet',
                createdAt: new Date().toISOString()
            });

            const wallets = await storage.listWallets();
            
            expect(wallets).toHaveLength(2);
            expect(wallets.find(w => w.name === 'wallet1')).toBeDefined();
            expect(wallets.find(w => w.name === 'wallet2')).toBeDefined();
            
            // Should not include secret keys in list
            wallets.forEach(w => {
                expect((w as any).secretKey).toBeUndefined();
            });
        });

        it('should return empty array when no wallets exist', async () => {
            const wallets = await storage.listWallets();
            expect(wallets).toEqual([]);
        });
    });

    describe('deleteWallet', () => {
        it('should delete existing wallet', async () => {
            const pair = Keypair.random();
            await storage.saveWallet('to-delete', {
                publicKey: pair.publicKey(),
                secretKey: pair.secret(),
                network: 'testnet',
                createdAt: new Date().toISOString()
            });

            const deleted = await storage.deleteWallet('to-delete');
            expect(deleted).toBe(true);

            const exists = await storage.walletExists('to-delete');
            expect(exists).toBe(false);
        });

        it('should return false when deleting non-existent wallet', async () => {
            const deleted = await storage.deleteWallet('non-existent');
            expect(deleted).toBe(false);
        });
    });

    describe('encryption', () => {
        it('should encrypt and decrypt data correctly', () => {
            const testData = 'sensitive wallet data';
            const password = 'test-password';

            const encrypted = WalletStorage.encrypt(testData, password);
            expect(encrypted.content).toBeDefined();
            expect(encrypted.salt).toBeDefined();
            expect(encrypted.iv).toBeDefined();
            expect(encrypted.authTag).toBeDefined();

            const decrypted = WalletStorage.decrypt(encrypted, password);
            expect(decrypted).toBe(testData);
        });

        it('should fail to decrypt with wrong password', () => {
            const testData = 'sensitive data';
            const correctPassword = 'correct';
            const wrongPassword = 'wrong';

            const encrypted = WalletStorage.encrypt(testData, correctPassword);

            expect(() => {
                WalletStorage.decrypt(encrypted, wrongPassword);
            }).toThrow();
        });
    });
});
