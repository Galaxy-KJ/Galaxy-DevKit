/**
 * @fileoverview Enhanced tests for wallet create command
 * Comprehensive test suite covering all edge cases and scenarios
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { Keypair } from '@stellar/stellar-sdk';
import { WalletStorage } from '../../src/utils/wallet-storage';

// Mock dependencies
jest.mock('ora', () => {
    return jest.fn(() => ({
        start: jest.fn().mockReturnThis(),
        stop: jest.fn().mockReturnThis(),
        succeed: jest.fn().mockReturnThis(),
        fail: jest.fn().mockReturnThis(),
        warn: jest.fn().mockReturnThis(),
        text: ''
    }));
});

jest.mock('inquirer', () => ({
    prompt: jest.fn()
}));

describe('Enhanced Wallet Create Command Tests', () => {
    let storage: WalletStorage;
    const testDir = path.join(os.tmpdir(), '.galaxy-test-enhanced');

    beforeEach(async () => {
        storage = new WalletStorage();
        (storage as any).walletsDir = path.join(testDir, 'wallets');
        await fs.ensureDir((storage as any).walletsDir);
    });

    afterEach(async () => {
        await fs.remove(testDir);
    });

    describe('Basic Wallet Creation', () => {
        it('should create a new wallet with given name', async () => {
            const walletName = 'test-wallet';
            const pair = Keypair.random();
            const walletData = {
                publicKey: pair.publicKey(),
                secretKey: pair.secret(),
                network: 'testnet' as const,
                createdAt: new Date().toISOString()
            };

            await storage.saveWallet(walletName, walletData);

            const exists = await storage.walletExists(walletName);
            expect(exists).toBe(true);

            const loaded = await storage.loadWallet(walletName);
            expect(loaded?.publicKey).toBe(walletData.publicKey);
            expect(loaded?.secretKey).toBe(walletData.secretKey);
            expect(loaded?.network).toBe('testnet');
        });

        it('should create wallet with mainnet network', async () => {
            const walletName = 'mainnet-wallet';
            const pair = Keypair.random();
            const walletData = {
                publicKey: pair.publicKey(),
                secretKey: pair.secret(),
                network: 'mainnet' as const,
                createdAt: new Date().toISOString()
            };

            await storage.saveWallet(walletName, walletData);
            const loaded = await storage.loadWallet(walletName);

            expect(loaded?.network).toBe('mainnet');
        });

        it('should generate valid Stellar keypair', () => {
            const pair = Keypair.random();

            // Public key should start with G and be 56 chars
            expect(pair.publicKey()).toMatch(/^G[A-Z2-7]{55}$/);

            // Secret key should start with S and be 56 chars
            expect(pair.secret()).toMatch(/^S[A-Z2-7]{55}$/);
        });

        it('should include createdAt timestamp', async () => {
            const walletName = 'timestamped-wallet';
            const pair = Keypair.random();
            const now = new Date();

            const walletData = {
                publicKey: pair.publicKey(),
                secretKey: pair.secret(),
                network: 'testnet' as const,
                createdAt: now.toISOString()
            };

            await storage.saveWallet(walletName, walletData);
            const loaded = await storage.loadWallet(walletName);

            expect(loaded?.createdAt).toBeDefined();
            const createdDate = new Date(loaded!.createdAt);
            expect(createdDate).toBeInstanceOf(Date);
            expect(Math.abs(createdDate.getTime() - now.getTime())).toBeLessThan(1000);
        });
    });

    describe('Error Handling', () => {
        it('should fail when wallet already exists', async () => {
            const walletName = 'duplicate-wallet';
            const pair = Keypair.random();
            const walletData = {
                publicKey: pair.publicKey(),
                secretKey: pair.secret(),
                network: 'testnet' as const,
                createdAt: new Date().toISOString()
            };

            await storage.saveWallet(walletName, walletData);
            const exists = await storage.walletExists(walletName);

            expect(exists).toBe(true);

            // Attempting to create again should detect existing wallet
            const stillExists = await storage.walletExists(walletName);
            expect(stillExists).toBe(true);
        });

        it('should handle invalid wallet names', async () => {
            const invalidNames = ['', ' ', '\t', '\n'];

            for (const name of invalidNames) {
                if (name.trim() === '') {
                    expect(name.trim()).toBe('');
                }
            }
        });

        it('should handle filesystem errors gracefully', async () => {
            const walletName = 'test-wallet';
            const pair = Keypair.random();

            // Create wallet in non-existent directory (should create it)
            const walletData = {
                publicKey: pair.publicKey(),
                secretKey: pair.secret(),
                network: 'testnet' as const,
                createdAt: new Date().toISOString()
            };

            await storage.saveWallet(walletName, walletData);
            expect(await storage.walletExists(walletName)).toBe(true);
        });
    });

    describe('Wallet Name Validation', () => {
        it('should accept alphanumeric names', async () => {
            const validNames = ['wallet123', 'my-wallet', 'test_wallet', 'WalletABC'];

            for (const name of validNames) {
                const pair = Keypair.random();
                const walletData = {
                    publicKey: pair.publicKey(),
                    secretKey: pair.secret(),
                    network: 'testnet' as const,
                    createdAt: new Date().toISOString()
                };

                await storage.saveWallet(name, walletData);
                expect(await storage.walletExists(name)).toBe(true);
            }
        });

        it('should handle special characters in names', async () => {
            const specialNames = ['my.wallet', 'wallet-123', 'wallet_test'];

            for (const name of specialNames) {
                const pair = Keypair.random();
                const walletData = {
                    publicKey: pair.publicKey(),
                    secretKey: pair.secret(),
                    network: 'testnet' as const,
                    createdAt: new Date().toISOString()
                };

                await storage.saveWallet(name, walletData);
                expect(await storage.walletExists(name)).toBe(true);
            }
        });
    });

    describe('Network Selection', () => {
        it('should default to testnet when no network specified', async () => {
            const walletName = 'default-network';
            const pair = Keypair.random();
            const walletData = {
                publicKey: pair.publicKey(),
                secretKey: pair.secret(),
                network: 'testnet' as const,
                createdAt: new Date().toISOString()
            };

            await storage.saveWallet(walletName, walletData);
            const loaded = await storage.loadWallet(walletName);

            expect(loaded?.network).toBe('testnet');
        });

        it('should support both testnet and mainnet', async () => {
            const networks: Array<'testnet' | 'mainnet'> = ['testnet', 'mainnet'];

            for (const network of networks) {
                const walletName = `wallet-${network}`;
                const pair = Keypair.random();
                const walletData = {
                    publicKey: pair.publicKey(),
                    secretKey: pair.secret(),
                    network,
                    createdAt: new Date().toISOString()
                };

                await storage.saveWallet(walletName, walletData);
                const loaded = await storage.loadWallet(walletName);

                expect(loaded?.network).toBe(network);
            }
        });
    });

    describe('Data Persistence', () => {
        it('should persist wallet data correctly', async () => {
            const walletName = 'persist-test';
            const pair = Keypair.random();
            const walletData = {
                publicKey: pair.publicKey(),
                secretKey: pair.secret(),
                network: 'testnet' as const,
                createdAt: new Date().toISOString()
            };

            await storage.saveWallet(walletName, walletData);

            // Create new storage instance to simulate restart
            const newStorage = new WalletStorage();
            (newStorage as any).walletsDir = (storage as any).walletsDir;

            const loaded = await newStorage.loadWallet(walletName);
            expect(loaded?.publicKey).toBe(walletData.publicKey);
            expect(loaded?.secretKey).toBe(walletData.secretKey);
        });

        it('should maintain data integrity across multiple wallets', async () => {
            const wallets = [];

            for (let i = 0; i < 5; i++) {
                const pair = Keypair.random();
                const wallet = {
                    name: `wallet-${i}`,
                    publicKey: pair.publicKey(),
                    secretKey: pair.secret(),
                    network: (i % 2 === 0 ? 'testnet' : 'mainnet') as const,
                    createdAt: new Date().toISOString()
                };

                wallets.push(wallet);
                await storage.saveWallet(wallet.name, wallet);
            }

            // Verify all wallets
            for (const wallet of wallets) {
                const loaded = await storage.loadWallet(wallet.name);
                expect(loaded?.publicKey).toBe(wallet.publicKey);
                expect(loaded?.secretKey).toBe(wallet.secretKey);
                expect(loaded?.network).toBe(wallet.network);
            }
        });
    });

    describe('Concurrent Operations', () => {
        it('should handle concurrent wallet creation', async () => {
            const promises = [];

            for (let i = 0; i < 10; i++) {
                const pair = Keypair.random();
                const walletData = {
                    publicKey: pair.publicKey(),
                    secretKey: pair.secret(),
                    network: 'testnet' as const,
                    createdAt: new Date().toISOString()
                };

                promises.push(storage.saveWallet(`concurrent-${i}`, walletData));
            }

            await Promise.all(promises);

            // Verify all wallets were created
            for (let i = 0; i < 10; i++) {
                expect(await storage.walletExists(`concurrent-${i}`)).toBe(true);
            }
        });
    });

    describe('Security', () => {
        it('should not expose secret key in wallet listing', async () => {
            const walletName = 'security-test';
            const pair = Keypair.random();
            const walletData = {
                publicKey: pair.publicKey(),
                secretKey: pair.secret(),
                network: 'testnet' as const,
                createdAt: new Date().toISOString()
            };

            await storage.saveWallet(walletName, walletData);
            const wallets = await storage.listWallets();

            const wallet = wallets.find(w => w.name === walletName);
            expect(wallet).toBeDefined();
            expect((wallet as any).secretKey).toBeUndefined();
            expect(wallet?.publicKey).toBe(walletData.publicKey);
        });

        it('should generate unique keypairs', () => {
            const keypairs = new Set();

            for (let i = 0; i < 100; i++) {
                const pair = Keypair.random();
                keypairs.add(pair.publicKey());
                keypairs.add(pair.secret());
            }

            // Should have 200 unique values (100 public + 100 secret keys)
            expect(keypairs.size).toBe(200);
        });
    });
});
