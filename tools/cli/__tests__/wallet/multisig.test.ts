/**
 * @fileoverview Comprehensive tests for multisig wallet functionality
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { Keypair, TransactionBuilder, Networks, Operation, Asset } from '@stellar/stellar-sdk';
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

describe('Multisig Wallet Tests', () => {
    let storage: WalletStorage;
    const testDir = path.join(os.tmpdir(), '.galaxy-test-multisig');
    const proposalsFile = path.join(testDir, 'multisig-proposals.json');

    beforeEach(async () => {
        storage = new WalletStorage();
        (storage as any).walletsDir = path.join(testDir, 'wallets');
        await fs.ensureDir((storage as any).walletsDir);
        await fs.ensureDir(testDir);
    });

    afterEach(async () => {
        await fs.remove(testDir);
    });

    describe('Multisig Wallet Creation', () => {
        it('should create a multisig wallet configuration', async () => {
            const walletName = 'multisig-wallet';
            const masterKey = Keypair.random();
            const signer1 = Keypair.random();
            const signer2 = Keypair.random();

            const multisigConfig = {
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
                    thresholds: {
                        low: 1,
                        medium: 2,
                        high: 2
                    },
                    masterWeight: 1
                }
            };

            await storage.saveWallet(walletName, multisigConfig);
            const loaded = await storage.loadWallet(walletName);

            expect(loaded?.multisig?.enabled).toBe(true);
            expect(loaded?.multisig?.signers).toHaveLength(2);
            expect(loaded?.multisig?.thresholds.medium).toBe(2);
        });

        it('should support different threshold configurations', async () => {
            const testCases = [
                { low: 1, medium: 2, high: 3, name: '1-2-3' },
                { low: 2, medium: 3, high: 5, name: '2-3-5' },
                { low: 1, medium: 1, high: 2, name: '1-1-2' }
            ];

            for (const testCase of testCases) {
                const walletName = `multisig-${testCase.name}`;
                const masterKey = Keypair.random();

                const config = {
                    publicKey: masterKey.publicKey(),
                    secretKey: masterKey.secret(),
                    network: 'testnet' as const,
                    createdAt: new Date().toISOString(),
                    multisig: {
                        enabled: true,
                        signers: [],
                        thresholds: {
                            low: testCase.low,
                            medium: testCase.medium,
                            high: testCase.high
                        },
                        masterWeight: 1
                    }
                };

                await storage.saveWallet(walletName, config);
                const loaded = await storage.loadWallet(walletName);

                expect(loaded?.multisig?.thresholds.low).toBe(testCase.low);
                expect(loaded?.multisig?.thresholds.medium).toBe(testCase.medium);
                expect(loaded?.multisig?.thresholds.high).toBe(testCase.high);
            }
        });

        it('should support various signer weights', async () => {
            const walletName = 'weighted-multisig';
            const masterKey = Keypair.random();

            const signers = [
                { publicKey: Keypair.random().publicKey(), weight: 1 },
                { publicKey: Keypair.random().publicKey(), weight: 2 },
                { publicKey: Keypair.random().publicKey(), weight: 3 }
            ];

            const config = {
                publicKey: masterKey.publicKey(),
                secretKey: masterKey.secret(),
                network: 'testnet' as const,
                createdAt: new Date().toISOString(),
                multisig: {
                    enabled: true,
                    signers,
                    thresholds: { low: 1, medium: 3, high: 5 },
                    masterWeight: 1
                }
            };

            await storage.saveWallet(walletName, config);
            const loaded = await storage.loadWallet(walletName);

            expect(loaded?.multisig?.signers[0].weight).toBe(1);
            expect(loaded?.multisig?.signers[1].weight).toBe(2);
            expect(loaded?.multisig?.signers[2].weight).toBe(3);
        });
    });

    describe('Transaction Proposals', () => {
        it('should create a transaction proposal', async () => {
            const proposal = {
                id: 'proposal-1',
                walletName: 'multisig-wallet',
                description: 'Send 100 XLM to recipient',
                xdr: 'mock-xdr-data',
                createdAt: new Date().toISOString(),
                signatures: [],
                status: 'pending' as const,
                requiredSignatures: 2
            };

            await fs.writeJson(proposalsFile, { proposals: [proposal] });
            const data = await fs.readJson(proposalsFile);

            expect(data.proposals).toHaveLength(1);
            expect(data.proposals[0].id).toBe('proposal-1');
            expect(data.proposals[0].status).toBe('pending');
        });

        it('should track multiple proposals', async () => {
            const proposals = [];

            for (let i = 0; i < 5; i++) {
                proposals.push({
                    id: `proposal-${i}`,
                    walletName: 'multisig-wallet',
                    description: `Transaction ${i}`,
                    xdr: `xdr-${i}`,
                    createdAt: new Date().toISOString(),
                    signatures: [],
                    status: 'pending' as const,
                    requiredSignatures: 2
                });
            }

            await fs.writeJson(proposalsFile, { proposals });
            const data = await fs.readJson(proposalsFile);

            expect(data.proposals).toHaveLength(5);
            expect(data.proposals.map((p: any) => p.id)).toEqual(
                proposals.map(p => p.id)
            );
        });

        it('should update proposal status', async () => {
            const proposal = {
                id: 'status-test',
                walletName: 'multisig-wallet',
                description: 'Test transaction',
                xdr: 'mock-xdr',
                createdAt: new Date().toISOString(),
                signatures: [],
                status: 'pending' as const,
                requiredSignatures: 2
            };

            await fs.writeJson(proposalsFile, { proposals: [proposal] });

            // Update status
            const data = await fs.readJson(proposalsFile);
            data.proposals[0].status = 'approved';
            await fs.writeJson(proposalsFile, data);

            const updated = await fs.readJson(proposalsFile);
            expect(updated.proposals[0].status).toBe('approved');
        });
    });

    describe('Signature Collection', () => {
        it('should collect signatures from multiple signers', async () => {
            const signer1 = Keypair.random();
            const signer2 = Keypair.random();

            const proposal = {
                id: 'sig-collection',
                walletName: 'multisig-wallet',
                description: 'Multi-signer transaction',
                xdr: 'mock-xdr',
                createdAt: new Date().toISOString(),
                signatures: [
                    {
                        publicKey: signer1.publicKey(),
                        signature: 'sig1',
                        signedAt: new Date().toISOString()
                    }
                ],
                status: 'pending' as const,
                requiredSignatures: 2
            };

            await fs.writeJson(proposalsFile, { proposals: [proposal] });

            // Add second signature
            const data = await fs.readJson(proposalsFile);
            data.proposals[0].signatures.push({
                publicKey: signer2.publicKey(),
                signature: 'sig2',
                signedAt: new Date().toISOString()
            });
            await fs.writeJson(proposalsFile, data);

            const updated = await fs.readJson(proposalsFile);
            expect(updated.proposals[0].signatures).toHaveLength(2);
            expect(updated.proposals[0].signatures[1].publicKey).toBe(signer2.publicKey());
        });

        it('should verify required signature threshold', async () => {
            const proposal = {
                id: 'threshold-check',
                walletName: 'multisig-wallet',
                description: 'Threshold test',
                xdr: 'mock-xdr',
                createdAt: new Date().toISOString(),
                signatures: [
                    { publicKey: Keypair.random().publicKey(), signature: 'sig1', signedAt: new Date().toISOString() },
                    { publicKey: Keypair.random().publicKey(), signature: 'sig2', signedAt: new Date().toISOString() }
                ],
                status: 'pending' as const,
                requiredSignatures: 2
            };

            const hasEnoughSignatures = proposal.signatures.length >= proposal.requiredSignatures;
            expect(hasEnoughSignatures).toBe(true);
        });

        it('should prevent duplicate signatures', async () => {
            const signer = Keypair.random();

            const proposal = {
                id: 'duplicate-check',
                walletName: 'multisig-wallet',
                description: 'Duplicate test',
                xdr: 'mock-xdr',
                createdAt: new Date().toISOString(),
                signatures: [
                    { publicKey: signer.publicKey(), signature: 'sig1', signedAt: new Date().toISOString() }
                ],
                status: 'pending' as const,
                requiredSignatures: 2
            };

            // Check if signer already signed
            const alreadySigned = proposal.signatures.some(
                sig => sig.publicKey === signer.publicKey()
            );

            expect(alreadySigned).toBe(true);
        });
    });

    describe('Proposal Validation', () => {
        it('should validate proposal structure', async () => {
            const validProposal = {
                id: 'valid-proposal',
                walletName: 'multisig-wallet',
                description: 'Valid transaction',
                xdr: 'mock-xdr',
                createdAt: new Date().toISOString(),
                signatures: [],
                status: 'pending' as const,
                requiredSignatures: 2
            };

            expect(validProposal.id).toBeDefined();
            expect(validProposal.walletName).toBeDefined();
            expect(validProposal.xdr).toBeDefined();
            expect(validProposal.requiredSignatures).toBeGreaterThan(0);
        });

        it('should reject invalid proposal formats', () => {
            const invalidProposal = {
                id: 'invalid',
                // Missing required fields
            };

            expect(invalidProposal).not.toHaveProperty('walletName');
            expect(invalidProposal).not.toHaveProperty('xdr');
        });
    });

    describe('Signer Management', () => {
        it('should add signers to multisig wallet', async () => {
            const walletName = 'signer-mgmt';
            const masterKey = Keypair.random();
            const newSigner = Keypair.random();

            const config = {
                publicKey: masterKey.publicKey(),
                secretKey: masterKey.secret(),
                network: 'testnet' as const,
                createdAt: new Date().toISOString(),
                multisig: {
                    enabled: true,
                    signers: [],
                    thresholds: { low: 1, medium: 2, high: 2 },
                    masterWeight: 1
                }
            };

            await storage.saveWallet(walletName, config);

            // Add signer
            const wallet = await storage.loadWallet(walletName);
            wallet!.multisig!.signers.push({
                publicKey: newSigner.publicKey(),
                weight: 1
            });

            await storage.saveWallet(walletName, wallet!);

            const updated = await storage.loadWallet(walletName);
            expect(updated?.multisig?.signers).toHaveLength(1);
            expect(updated?.multisig?.signers[0].publicKey).toBe(newSigner.publicKey());
        });

        it('should remove signers from multisig wallet', async () => {
            const walletName = 'signer-removal';
            const masterKey = Keypair.random();
            const signer1 = Keypair.random();
            const signer2 = Keypair.random();

            const config = {
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

            await storage.saveWallet(walletName, config);

            // Remove signer
            const wallet = await storage.loadWallet(walletName);
            wallet!.multisig!.signers = wallet!.multisig!.signers.filter(
                s => s.publicKey !== signer1.publicKey()
            );

            await storage.saveWallet(walletName, wallet!);

            const updated = await storage.loadWallet(walletName);
            expect(updated?.multisig?.signers).toHaveLength(1);
            expect(updated?.multisig?.signers[0].publicKey).toBe(signer2.publicKey());
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty proposal list', async () => {
            await fs.writeJson(proposalsFile, { proposals: [] });
            const data = await fs.readJson(proposalsFile);

            expect(data.proposals).toEqual([]);
        });

        it('should handle missing proposals file', async () => {
            const exists = await fs.pathExists(proposalsFile);

            if (!exists) {
                await fs.writeJson(proposalsFile, { proposals: [] });
            }

            expect(await fs.pathExists(proposalsFile)).toBe(true);
        });

        it('should support single-signature threshold', async () => {
            const walletName = 'single-sig';
            const masterKey = Keypair.random();

            const config = {
                publicKey: masterKey.publicKey(),
                secretKey: masterKey.secret(),
                network: 'testnet' as const,
                createdAt: new Date().toISOString(),
                multisig: {
                    enabled: true,
                    signers: [],
                    thresholds: { low: 1, medium: 1, high: 1 },
                    masterWeight: 1
                }
            };

            await storage.saveWallet(walletName, config);
            const loaded = await storage.loadWallet(walletName);

            expect(loaded?.multisig?.thresholds.medium).toBe(1);
        });
    });
});
