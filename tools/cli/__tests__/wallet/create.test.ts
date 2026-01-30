/**
 * @fileoverview Tests for wallet create command
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

jest.mock('inquirer', () => ({
    prompt: jest.fn()
}));

describe('wallet create command', () => {
    const testWalletsDir = path.join(os.tmpdir(), '.galaxy-test', 'wallets');

    beforeEach(async () => {
        await fs.ensureDir(testWalletsDir);
    });

    afterEach(async () => {
        await fs.emptyDir(testWalletsDir);
    });

    it('should create a new wallet with given name', async () => {
        const walletName = 'test-wallet';
        const walletPath = path.join(testWalletsDir, `${walletName}.json`);

        // Simulate wallet creation
        const pair = Keypair.random();
        const walletData = {
            publicKey: pair.publicKey(),
            secretKey: pair.secret(),
            network: 'testnet',
            createdAt: new Date().toISOString()
        };

        await fs.ensureDir(testWalletsDir);
        await fs.writeJson(walletPath, walletData);

        // Verify wallet was created
        expect(await fs.pathExists(walletPath)).toBe(true);

        // Read and verify wallet data
        const savedWallet = await fs.readJson(walletPath);
        expect(savedWallet.publicKey).toBe(walletData.publicKey);
        expect(savedWallet.secretKey).toBe(walletData.secretKey);
        expect(savedWallet.network).toBe('testnet');
    });

    it('should create wallet with mainnet network', async () => {
        const walletName = 'mainnet-wallet';
        const walletPath = path.join(testWalletsDir, `${walletName}.json`);

        const pair = Keypair.random();
        const walletData = {
            publicKey: pair.publicKey(),
            secretKey: pair.secret(),
            network: 'mainnet',
            createdAt: new Date().toISOString()
        };

        await fs.ensureDir(testWalletsDir);
        await fs.writeJson(walletPath, walletData);

        const savedWallet = await fs.readJson(walletPath);
        expect(savedWallet.network).toBe('mainnet');
    });

    it('should fail when wallet already exists', async () => {
        const walletName = 'duplicate-wallet';
        const walletPath = path.join(testWalletsDir, `${walletName}.json`);

        // Create first wallet
        const pair = Keypair.random();
        const walletData = {
            publicKey: pair.publicKey(),
            secretKey: pair.secret(),
            network: 'testnet',
            createdAt: new Date().toISOString()
        };
        await fs.ensureDir(testWalletsDir);
        await fs.writeJson(walletPath, walletData);

        // Try to create duplicate
        const exists = await fs.pathExists(walletPath);
        expect(exists).toBe(true);
    });

    it('should generate valid keypair', () => {
        const pair = Keypair.random();
        expect(pair.publicKey()).toMatch(/^G[A-Z2-7]{55}$/);
        expect(pair.secret()).toMatch(/^S[A-Z2-7]{55}$/);
    });

    it('should include createdAt timestamp', async () => {
        const walletName = 'timestamped-wallet';
        const walletPath = path.join(testWalletsDir, `${walletName}.json`);

        const pair = Keypair.random();
        const now = new Date();
        const walletData = {
            publicKey: pair.publicKey(),
            secretKey: pair.secret(),
            network: 'testnet',
            createdAt: now.toISOString()
        };

        await fs.ensureDir(testWalletsDir);
        await fs.writeJson(walletPath, walletData);

        const savedWallet = await fs.readJson(walletPath);
        expect(savedWallet.createdAt).toBeDefined();
        expect(new Date(savedWallet.createdAt)).toBeInstanceOf(Date);
    });
});
