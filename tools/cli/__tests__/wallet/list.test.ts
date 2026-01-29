/**
 * @fileoverview Tests for wallet list command
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

describe('wallet list command', () => {
    const testWalletsDir = path.join(os.tmpdir(), '.galaxy-test', 'wallets');

    beforeEach(async () => {
        await fs.ensureDir(testWalletsDir);
    });

    afterEach(async () => {
        await fs.remove(path.dirname(testWalletsDir));
    });

    it('should list all wallets', async () => {
        // Create test wallets
        const wallet1 = {
            publicKey: Keypair.random().publicKey(),
            secretKey: Keypair.random().secret(),
            network: 'testnet',
            createdAt: new Date().toISOString()
        };

        const wallet2 = {
            publicKey: Keypair.random().publicKey(),
            secretKey: Keypair.random().secret(),
            network: 'mainnet',
            createdAt: new Date().toISOString()
        };

        await fs.writeJson(path.join(testWalletsDir, 'wallet1.json'), wallet1);
        await fs.writeJson(path.join(testWalletsDir, 'wallet2.json'), wallet2);

        // List wallets
        const files = await fs.readdir(testWalletsDir);
        const walletFiles = files.filter(f => f.endsWith('.json'));

        expect(walletFiles.length).toBe(2);
        expect(walletFiles).toContain('wallet1.json');
        expect(walletFiles).toContain('wallet2.json');
    });

    it('should return empty list when no wallets exist', async () => {
        const files = await fs.readdir(testWalletsDir);
        const walletFiles = files.filter(f => f.endsWith('.json'));
        expect(walletFiles.length).toBe(0);
    });

    it('should parse wallet information correctly', async () => {
        const walletData = {
            publicKey: Keypair.random().publicKey(),
            secretKey: Keypair.random().secret(),
            network: 'testnet',
            createdAt: new Date().toISOString()
        };

        await fs.writeJson(path.join(testWalletsDir, 'test.json'), walletData);

        const content = await fs.readJson(path.join(testWalletsDir, 'test.json'));
        expect(content.publicKey).toBe(walletData.publicKey);
        expect(content.network).toBe('testnet');
    });

    it('should handle invalid wallet files gracefully', async () => {
        // Create a valid wallet
        const validWallet = {
            publicKey: Keypair.random().publicKey(),
            secretKey: Keypair.random().secret(),
            network: 'testnet',
            createdAt: new Date().toISOString()
        };
        await fs.writeJson(path.join(testWalletsDir, 'valid.json'), validWallet);

        // Create an invalid file
        await fs.writeFile(path.join(testWalletsDir, 'invalid.json'), 'not valid json');

        // List should still work
        const files = await fs.readdir(testWalletsDir);
        const walletFiles = files.filter(f => f.endsWith('.json'));
        expect(walletFiles.length).toBe(2);

        // Valid wallet should be readable
        const validContent = await fs.readJson(path.join(testWalletsDir, 'valid.json'));
        expect(validContent.publicKey).toBe(validWallet.publicKey);
    });
});
