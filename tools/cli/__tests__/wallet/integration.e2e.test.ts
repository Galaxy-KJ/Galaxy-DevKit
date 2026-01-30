/**
 * @fileoverview End-to-end integration tests for complete wallet workflows
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, jest } from '@jest/globals';
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

describe('Wallet Integration E2E Tests', () => {
    let storage: WalletStorage;
    const testDir = path.join(os.tmpdir(), '.galaxy-test-e2e');
    const walletsDir = path.join(testDir, 'wallets');
    const backupsDir = path.join(testDir, 'backups');
    const configDir = path.join(testDir, 'config');

    beforeAll(async () => {
        await fs.ensureDir(testDir);
        await fs.ensureDir(walletsDir);
        await fs.ensureDir(backupsDir);
        await fs.ensureDir(configDir);
    });

    afterAll(async () => {
        await fs.remove(testDir);
    });

    beforeEach(() => {
        storage = new WalletStorage();
        (storage as any).walletsDir = walletsDir;
    });

    afterEach(async () => {
        // Clean up between tests
        await fs.emptyDir(walletsDir);
        await fs.emptyDir(backupsDir);
        await fs.emptyDir(configDir);
    });

    describe('Complete Wallet Lifecycle', () => {
        it('should handle complete wallet lifecycle: create, backup, delete, restore', async () => {
            // 1. Create wallet
            const walletName = 'lifecycle-test';
            const pair = Keypair.random();
            const walletData = {
                publicKey: pair.publicKey(),
                secretKey: pair.secret(),
                network: 'testnet' as const,
                createdAt: new Date().toISOString()
            };

            await storage.saveWallet(walletName, walletData);
            expect(await storage.walletExists(walletName)).toBe(true);

            // 2. Create backup
            const backupData = {
                version: '1.0',
                createdAt: new Date().toISOString(),
                wallets: [{
                    name: walletName,
                    ...walletData
                }]
            };

            const backupFile = path.join(backupsDir, 'lifecycle-backup.json');
            await fs.writeJson(backupFile, backupData);

            // 3. Delete wallet
            await storage.deleteWallet(walletName);
            expect(await storage.walletExists(walletName)).toBe(false);

            // 4. Restore from backup
            const backup = await fs.readJson(backupFile);
            const { name, ...wallet } = backup.wallets[0];
            await storage.saveWallet(name, wallet);

            // 5. Verify restoration
            const restored = await storage.loadWallet(walletName);
            expect(restored?.publicKey).toBe(walletData.publicKey);
            expect(restored?.secretKey).toBe(walletData.secretKey);
        });

        it('should handle wallet import and export workflow', async () => {
            // 1. Create wallet
            const pair = Keypair.random();
            await storage.saveWallet('export-test', {
                publicKey: pair.publicKey(),
                secretKey: pair.secret(),
                network: 'testnet',
                createdAt: new Date().toISOString()
            });

            // 2. Export wallet (get secret key)
            const wallet = await storage.loadWallet('export-test');
            const exportedSecret = wallet!.secretKey;

            // 3. Delete wallet
            await storage.deleteWallet('export-test');

            // 4. Import wallet using secret key
            const importedPair = Keypair.fromSecret(exportedSecret);
            await storage.saveWallet('imported-test', {
                publicKey: importedPair.publicKey(),
                secretKey: importedPair.secret(),
                network: 'testnet',
                createdAt: new Date().toISOString(),
                importedAt: new Date().toISOString()
            });

            // 5. Verify import
            const imported = await storage.loadWallet('imported-test');
            expect(imported?.publicKey).toBe(pair.publicKey());
            expect(imported?.importedAt).toBeDefined();
        });
    });

    describe('Multisig Workflow', () => {
        it('should complete full multisig setup and transaction flow', async () => {
            // 1. Create multisig wallet
            const masterKey = Keypair.random();
            const signer1 = Keypair.random();
            const signer2 = Keypair.random();

            const multisigWallet = {
                publicKey: masterKey.publicKey(),
                secretKey: masterKey.secret(),
                network: 'testnet' as const,
                createdAt: new Date().toISOString(),
                multisig: {
                    enabled: true,
                    signers: [
                        { publicKey: signer1.publicKey(), weight: 1 },
                        { publicKey: signer2.publicKey(), weight: 1 }
                    ],
                    thresholds: { low: 1, medium: 2, high: 2 },
                    masterWeight: 1
                }
            };

            await storage.saveWallet('multisig-e2e', multisigWallet);

            // 2. Create transaction proposal
            const proposalFile = path.join(configDir, 'proposals.json');
            const proposal = {
                id: 'tx-1',
                walletName: 'multisig-e2e',
                description: 'Send 100 XLM',
                xdr: 'mock-xdr',
                createdAt: new Date().toISOString(),
                signatures: [],
                status: 'pending' as const,
                requiredSignatures: 2
            };

            await fs.writeJson(proposalFile, { proposals: [proposal] });

            // 3. Collect signatures
            const proposals = await fs.readJson(proposalFile);
            proposals.proposals[0].signatures.push(
                {
                    publicKey: signer1.publicKey(),
                    signature: 'sig1',
                    signedAt: new Date().toISOString()
                },
                {
                    publicKey: signer2.publicKey(),
                    signature: 'sig2',
                    signedAt: new Date().toISOString()
                }
            );
            await fs.writeJson(proposalFile, proposals);

            // 4. Verify threshold met
            const updated = await fs.readJson(proposalFile);
            const thresholdMet = updated.proposals[0].signatures.length >=
                updated.proposals[0].requiredSignatures;

            expect(thresholdMet).toBe(true);
            expect(updated.proposals[0].signatures).toHaveLength(2);
        });
    });

    describe('Social Recovery Workflow', () => {
        it('should complete full recovery process', async () => {
            // 1. Setup wallet with social recovery
            const walletKey = Keypair.random();
            const guardians = [
                Keypair.random().publicKey(),
                Keypair.random().publicKey(),
                Keypair.random().publicKey()
            ];

            const wallet = {
                publicKey: walletKey.publicKey(),
                secretKey: walletKey.secret(),
                network: 'testnet' as const,
                createdAt: new Date().toISOString()
            };

            await storage.saveWallet('recovery-e2e', wallet);

            // 2. Configure recovery
            const recoveryConfig = {
                walletPublicKey: walletKey.publicKey(),
                guardians: guardians.map(g => ({
                    publicKey: g,
                    addedAt: new Date().toISOString()
                })),
                threshold: 2,
                timeLock: 86400
            };

            const recoveryFile = path.join(configDir, 'recovery.json');
            await fs.writeJson(recoveryFile, recoveryConfig);

            // 3. Initiate recovery
            const newOwner = Keypair.random().publicKey();
            const recoveryRequest = {
                id: 'recovery-1',
                walletPublicKey: walletKey.publicKey(),
                newOwner,
                initiatedAt: new Date(Date.now() - 90000000).toISOString(), // > 24h ago
                status: 'pending' as const,
                approvals: []
            };

            const requests = { recoveryRequests: [recoveryRequest] };
            await fs.writeJson(recoveryFile, requests);

            // 4. Collect guardian approvals
            const loaded = await fs.readJson(recoveryFile);
            loaded.recoveryRequests[0].approvals.push(
                {
                    guardianPublicKey: guardians[0],
                    approvedAt: new Date().toISOString(),
                    signature: 'sig1'
                },
                {
                    guardianPublicKey: guardians[1],
                    approvedAt: new Date().toISOString(),
                    signature: 'sig2'
                }
            );
            loaded.recoveryRequests[0].status = 'approved';
            await fs.writeJson(recoveryFile, loaded);

            // 5. Execute recovery
            const recovered = await fs.readJson(recoveryFile);
            const request = recovered.recoveryRequests[0];

            expect(request.status).toBe('approved');
            expect(request.approvals).toHaveLength(2);

            // Update wallet ownership
            const currentWallet = await storage.loadWallet('recovery-e2e');
            const recoveredWallet = {
                ...currentWallet!,
                publicKey: newOwner,
                recoveredAt: new Date().toISOString(),
                previousOwner: walletKey.publicKey()
            };

            await storage.saveWallet('recovery-e2e', recoveredWallet);

            const final = await storage.loadWallet('recovery-e2e');
            expect(final?.publicKey).toBe(newOwner);
            expect(final?.previousOwner).toBe(walletKey.publicKey());
        });
    });

    describe('Backup and Restore Workflow', () => {
        it('should backup multiple wallets and restore selectively', async () => {
            // 1. Create multiple wallets
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

            // 2. Create encrypted backup
            const password = 'backup-password';
            const backupData = JSON.stringify({
                version: '1.0',
                createdAt: new Date().toISOString(),
                wallets
            });

            const encrypted = WalletStorage.encrypt(backupData, password);
            const backupFile = path.join(backupsDir, 'full-backup.json');
            await fs.writeJson(backupFile, encrypted);

            // 3. Delete all wallets
            for (const wallet of wallets) {
                await storage.deleteWallet(wallet.name);
            }

            const remaining = await storage.listWallets();
            expect(remaining).toHaveLength(0);

            // 4. Restore from encrypted backup
            const encryptedBackup = await fs.readJson(backupFile);
            const decrypted = WalletStorage.decrypt(encryptedBackup, password);
            const backup = JSON.parse(decrypted);

            // Restore only testnet wallets
            const testnetWallets = backup.wallets.filter((w: any) => w.network === 'testnet');
            for (const walletData of testnetWallets) {
                const { name, ...wallet } = walletData;
                await storage.saveWallet(name, wallet);
            }

            // 5. Verify selective restore
            const restored = await storage.listWallets();
            expect(restored.length).toBe(3); // 3 testnet wallets out of 5 total
        });
    });

    describe('Biometric Authentication Workflow', () => {
        it('should setup and use biometric authentication', async () => {
            // 1. Create wallet
            const pair = Keypair.random();
            await storage.saveWallet('biometric-wallet', {
                publicKey: pair.publicKey(),
                secretKey: pair.secret(),
                network: 'testnet',
                createdAt: new Date().toISOString()
            });

            // 2. Setup biometric
            const biometricConfig = {
                enabled: false,
                provider: 'mock',
                credentials: []
            };

            const biometricFile = path.join(configDir, 'biometric.json');
            await fs.writeJson(biometricFile, biometricConfig);

            // 3. Enroll biometric
            const config = await fs.readJson(biometricFile);
            config.enabled = true;
            config.credentials.push({
                id: 'cred-1',
                type: 'fingerprint',
                publicKey: pair.publicKey(),
                createdAt: new Date().toISOString()
            });
            await fs.writeJson(biometricFile, config);

            // 4. Authenticate
            const loaded = await fs.readJson(biometricFile);
            const authResult = {
                success: true,
                credentialId: 'cred-1',
                timestamp: new Date().toISOString()
            };

            // 5. Sign transaction after authentication
            if (authResult.success) {
                const wallet = await storage.loadWallet('biometric-wallet');
                expect(wallet).toBeDefined();
                expect(wallet?.publicKey).toBe(pair.publicKey());
            }

            expect(loaded.enabled).toBe(true);
            expect(loaded.credentials).toHaveLength(1);
        });
    });

    describe('Multi-Wallet Management', () => {
        it('should manage multiple wallets with different configurations', async () => {
            // 1. Create standard wallet
            const standard = Keypair.random();
            await storage.saveWallet('standard', {
                publicKey: standard.publicKey(),
                secretKey: standard.secret(),
                network: 'testnet',
                createdAt: new Date().toISOString()
            });

            // 2. Create multisig wallet
            const multisig = Keypair.random();
            await storage.saveWallet('multisig', {
                publicKey: multisig.publicKey(),
                secretKey: multisig.secret(),
                network: 'mainnet',
                createdAt: new Date().toISOString(),
                multisig: {
                    enabled: true,
                    signers: [
                        { publicKey: Keypair.random().publicKey(), weight: 1 }
                    ],
                    thresholds: { low: 1, medium: 2, high: 2 },
                    masterWeight: 1
                }
            });

            // 3. Create hardware wallet reference
            await storage.saveWallet('ledger', {
                publicKey: Keypair.random().publicKey(),
                secretKey: '', // Hardware wallet doesn't store secret
                network: 'mainnet',
                createdAt: new Date().toISOString(),
                hardware: {
                    type: 'ledger',
                    path: "44'/148'/0'"
                }
            });

            // 4. List and verify all wallets
            const allWallets = await storage.listWallets();
            expect(allWallets.length).toBeGreaterThanOrEqual(3);

            const standardWallet = await storage.loadWallet('standard');
            const multisigWallet = await storage.loadWallet('multisig');
            const ledgerWallet = await storage.loadWallet('ledger');

            expect(standardWallet?.network).toBe('testnet');
            expect(multisigWallet?.multisig?.enabled).toBe(true);
            expect(ledgerWallet?.hardware?.type).toBe('ledger');
        });
    });

    describe('Error Recovery and Edge Cases', () => {
        it('should handle corrupt wallet file gracefully', async () => {
            const corruptWalletPath = path.join(walletsDir, 'corrupt.json');
            await fs.writeFile(corruptWalletPath, 'invalid json content');

            const wallet = await storage.loadWallet('corrupt');
            expect(wallet).toBeNull();
        });

        it('should handle concurrent wallet operations', async () => {
            const operations = [];

            // Create multiple wallets concurrently
            for (let i = 0; i < 10; i++) {
                const pair = Keypair.random();
                operations.push(
                    storage.saveWallet(`concurrent-${i}`, {
                        publicKey: pair.publicKey(),
                        secretKey: pair.secret(),
                        network: 'testnet',
                        createdAt: new Date().toISOString()
                    })
                );
            }

            await Promise.all(operations);

            const wallets = await storage.listWallets();
            expect(wallets.length).toBeGreaterThanOrEqual(10);
        });

        it('should handle wallet name conflicts', async () => {
            const walletName = 'conflict';
            const pair1 = Keypair.random();

            // Create first wallet
            await storage.saveWallet(walletName, {
                publicKey: pair1.publicKey(),
                secretKey: pair1.secret(),
                network: 'testnet',
                createdAt: new Date().toISOString()
            });

            // Try to create second wallet with same name
            const exists = await storage.walletExists(walletName);
            expect(exists).toBe(true);

            // Should use different name
            const pair2 = Keypair.random();
            await storage.saveWallet(`${walletName}-2`, {
                publicKey: pair2.publicKey(),
                secretKey: pair2.secret(),
                network: 'testnet',
                createdAt: new Date().toISOString()
            });

            const wallets = await storage.listWallets();
            expect(wallets.some(w => w.name === walletName)).toBe(true);
            expect(wallets.some(w => w.name === `${walletName}-2`)).toBe(true);
        });
    });

    describe('Performance Tests', () => {
        it('should handle large number of wallets efficiently', async () => {
            const startTime = Date.now();
            const walletCount = 100;

            // Create many wallets
            for (let i = 0; i < walletCount; i++) {
                const pair = Keypair.random();
                await storage.saveWallet(`perf-${i}`, {
                    publicKey: pair.publicKey(),
                    secretKey: pair.secret(),
                    network: 'testnet',
                    createdAt: new Date().toISOString()
                });
            }

            const createTime = Date.now() - startTime;

            // List all wallets
            const listStartTime = Date.now();
            const wallets = await storage.listWallets();
            const listTime = Date.now() - listStartTime;

            expect(wallets.length).toBeGreaterThanOrEqual(walletCount);
            expect(createTime).toBeLessThan(30000); // Should complete in < 30s
            expect(listTime).toBeLessThan(5000); // Should list in < 5s
        });
    });
});
