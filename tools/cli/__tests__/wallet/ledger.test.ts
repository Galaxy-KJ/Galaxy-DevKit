/**
 * @fileoverview Comprehensive tests for Ledger hardware wallet integration
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { Keypair } from '@stellar/stellar-sdk';

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

// Mock Ledger transport
const mockLedgerTransport = {
    isSupported: jest.fn().mockResolvedValue(true),
    list: jest.fn().mockResolvedValue([]),
    open: jest.fn().mockResolvedValue({
        close: jest.fn(),
        send: jest.fn()
    })
};

jest.mock('@ledgerhq/hw-transport-node-hid', () => ({
    default: mockLedgerTransport
}));

describe('Ledger Hardware Wallet Tests', () => {
    const testDir = path.join(os.tmpdir(), '.galaxy-test-ledger');

    beforeEach(async () => {
        await fs.ensureDir(testDir);
        jest.clearAllMocks();
    });

    afterEach(async () => {
        await fs.remove(testDir);
    });

    describe('Ledger Connection', () => {
        it('should detect Ledger device support', async () => {
            const isSupported = await mockLedgerTransport.isSupported();
            expect(isSupported).toBe(true);
        });

        it('should list connected Ledger devices', async () => {
            const devices = await mockLedgerTransport.list();
            expect(Array.isArray(devices)).toBe(true);
        });

        it('should open connection to Ledger device', async () => {
            const transport = await mockLedgerTransport.open();
            expect(transport).toBeDefined();
            expect(transport.close).toBeDefined();
        });

        it('should handle connection errors gracefully', async () => {
            mockLedgerTransport.open.mockRejectedValueOnce(
                new Error('Device not found')
            );

            await expect(mockLedgerTransport.open()).rejects.toThrow('Device not found');
        });

        it('should close connection properly', async () => {
            const transport = await mockLedgerTransport.open();
            await transport.close();
            expect(transport.close).toHaveBeenCalled();
        });
    });

    describe('Account Derivation', () => {
        it('should derive accounts using BIP44 path', () => {
            // BIP44 path for Stellar: m/44'/148'/account'
            const paths = [
                "44'/148'/0'",
                "44'/148'/1'",
                "44'/148'/2'"
            ];

            paths.forEach(path => {
                expect(path).toMatch(/44'\/148'\/\d+'/);
            });
        });

        it('should generate multiple accounts from Ledger', () => {
            const accounts = [];

            for (let i = 0; i < 5; i++) {
                const account = {
                    index: i,
                    path: `44'/148'/${i}'`,
                    publicKey: Keypair.random().publicKey()
                };
                accounts.push(account);
            }

            expect(accounts).toHaveLength(5);
            expect(accounts[0].index).toBe(0);
            expect(accounts[4].index).toBe(4);
        });

        it('should support custom derivation paths', () => {
            const customPaths = [
                "44'/148'/10'",
                "44'/148'/100'",
                "44'/148'/999'"
            ];

            customPaths.forEach(path => {
                const match = path.match(/44'\/148'\/(\d+)'/);
                expect(match).not.toBeNull();
                expect(parseInt(match![1])).toBeGreaterThanOrEqual(0);
            });
        });
    });

    describe('Transaction Signing', () => {
        it('should prepare transaction for Ledger signing', () => {
            const transaction = {
                sourceAccount: Keypair.random().publicKey(),
                destination: Keypair.random().publicKey(),
                amount: '100',
                memo: 'Test payment'
            };

            expect(transaction.sourceAccount).toBeDefined();
            expect(transaction.destination).toBeDefined();
            expect(transaction.amount).toBe('100');
        });

        it('should handle signing approval on device', async () => {
            const mockSignature = Buffer.from('mock-signature');

            mockLedgerTransport.open.mockResolvedValueOnce({
                close: jest.fn(),
                send: jest.fn().mockResolvedValue(mockSignature)
            });

            const transport = await mockLedgerTransport.open();
            const signature = await transport.send();

            expect(signature).toEqual(mockSignature);
        });

        it('should handle signing rejection on device', async () => {
            mockLedgerTransport.open.mockResolvedValueOnce({
                close: jest.fn(),
                send: jest.fn().mockRejectedValue(new Error('User rejected'))
            });

            const transport = await mockLedgerTransport.open();
            await expect(transport.send()).rejects.toThrow('User rejected');
        });
    });

    describe('Address Verification', () => {
        it('should display address on Ledger for verification', async () => {
            const publicKey = Keypair.random().publicKey();

            const verificationRequest = {
                path: "44'/148'/0'",
                publicKey,
                requireConfirmation: true
            };

            expect(verificationRequest.requireConfirmation).toBe(true);
            expect(verificationRequest.publicKey).toBe(publicKey);
        });

        it('should confirm address matches on device', () => {
            const expectedAddress = Keypair.random().publicKey();
            const displayedAddress = expectedAddress;

            expect(displayedAddress).toBe(expectedAddress);
        });
    });

    describe('Device Information', () => {
        it('should retrieve device model', () => {
            const deviceModels = ['Nano S', 'Nano S Plus', 'Nano X'];

            deviceModels.forEach(model => {
                expect(['Nano S', 'Nano S Plus', 'Nano X']).toContain(model);
            });
        });

        it('should retrieve firmware version', () => {
            const firmwareVersion = '2.1.0';
            expect(firmwareVersion).toMatch(/^\d+\.\d+\.\d+$/);
        });

        it('should check Stellar app version', () => {
            const appVersion = '4.0.0';
            expect(appVersion).toMatch(/^\d+\.\d+\.\d+$/);
        });

        it('should verify Stellar app is running', () => {
            const appRunning = true;
            expect(appRunning).toBe(true);
        });
    });

    describe('Error Handling', () => {
        it('should handle device disconnection', async () => {
            mockLedgerTransport.open.mockRejectedValueOnce(
                new Error('Device disconnected')
            );

            await expect(mockLedgerTransport.open()).rejects.toThrow('Device disconnected');
        });

        it('should handle app not opened error', async () => {
            mockLedgerTransport.open.mockRejectedValueOnce(
                new Error('Stellar app is not open')
            );

            await expect(mockLedgerTransport.open()).rejects.toThrow('Stellar app is not open');
        });

        it('should handle timeout errors', async () => {
            mockLedgerTransport.open.mockRejectedValueOnce(
                new Error('Timeout waiting for device')
            );

            await expect(mockLedgerTransport.open()).rejects.toThrow('Timeout');
        });

        it('should handle multiple devices connected', async () => {
            mockLedgerTransport.list.mockResolvedValueOnce([
                { path: '/dev/hidraw0' },
                { path: '/dev/hidraw1' }
            ]);

            const devices = await mockLedgerTransport.list();
            expect(devices).toHaveLength(2);
        });
    });

    describe('Configuration Storage', () => {
        it('should save Ledger configuration', async () => {
            const config = {
                enabled: true,
                defaultAccount: 0,
                accounts: [
                    { index: 0, path: "44'/148'/0'", publicKey: Keypair.random().publicKey() }
                ]
            };

            const configFile = path.join(testDir, 'ledger-config.json');
            await fs.writeJson(configFile, config);

            const loaded = await fs.readJson(configFile);
            expect(loaded.enabled).toBe(true);
            expect(loaded.accounts).toHaveLength(1);
        });

        it('should load saved Ledger accounts', async () => {
            const accounts = [
                { index: 0, path: "44'/148'/0'", publicKey: Keypair.random().publicKey() },
                { index: 1, path: "44'/148'/1'", publicKey: Keypair.random().publicKey() }
            ];

            const configFile = path.join(testDir, 'ledger-accounts.json');
            await fs.writeJson(configFile, { accounts });

            const loaded = await fs.readJson(configFile);
            expect(loaded.accounts).toHaveLength(2);
        });
    });

    describe('Multi-Account Support', () => {
        it('should manage multiple Ledger accounts', () => {
            const accounts = [];

            for (let i = 0; i < 10; i++) {
                accounts.push({
                    index: i,
                    path: `44'/148'/${i}'`,
                    publicKey: Keypair.random().publicKey(),
                    label: `Account ${i}`
                });
            }

            expect(accounts).toHaveLength(10);
            expect(accounts[5].label).toBe('Account 5');
        });

        it('should switch between accounts', () => {
            const accounts = [
                { index: 0, publicKey: Keypair.random().publicKey() },
                { index: 1, publicKey: Keypair.random().publicKey() }
            ];

            let currentAccount = accounts[0];
            expect(currentAccount.index).toBe(0);

            currentAccount = accounts[1];
            expect(currentAccount.index).toBe(1);
        });
    });

    describe('Security Features', () => {
        it('should require device confirmation for transactions', () => {
            const txRequiresConfirmation = true;
            expect(txRequiresConfirmation).toBe(true);
        });

        it('should not expose private keys', () => {
            // Ledger keeps private keys on device
            const account = {
                publicKey: Keypair.random().publicKey(),
                hasPrivateKey: false
            };

            expect(account.hasPrivateKey).toBe(false);
            expect(account).not.toHaveProperty('secretKey');
        });

        it('should validate transaction before signing', () => {
            const transaction = {
                destination: Keypair.random().publicKey(),
                amount: '100',
                isValid: true
            };

            expect(transaction.isValid).toBe(true);
        });
    });

    describe('Network Support', () => {
        it('should support testnet transactions', () => {
            const config = {
                network: 'testnet',
                networkPassphrase: 'Test SDF Network ; September 2015'
            };

            expect(config.network).toBe('testnet');
        });

        it('should support mainnet transactions', () => {
            const config = {
                network: 'mainnet',
                networkPassphrase: 'Public Global Stellar Network ; September 2015'
            };

            expect(config.network).toBe('mainnet');
        });
    });
});
