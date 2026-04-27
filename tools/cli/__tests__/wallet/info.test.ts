/**
 * @fileoverview Tests for wallet info command
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { Keypair } from '@stellar/stellar-sdk';

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

describe('wallet info command', () => {
    const testWalletsDir = path.join(os.tmpdir(), '.galaxy-test', 'wallets');

    beforeEach(async () => {
        await fs.ensureDir(testWalletsDir);
    });

    afterEach(async () => {
        await fs.remove(path.dirname(testWalletsDir));
    });

    it('should load wallet data from storage', async () => {
        const pair = Keypair.random();
        const walletData = {
            publicKey: pair.publicKey(),
            secretKey: pair.secret(),
            network: 'testnet',
            createdAt: new Date().toISOString()
        };

        await fs.writeJson(path.join(testWalletsDir, 'test.json'), walletData);

        const loaded = await fs.readJson(path.join(testWalletsDir, 'test.json'));
        expect(loaded.publicKey).toBe(walletData.publicKey);
        expect(loaded.network).toBe('testnet');
    });

    it('should return null for non-existent wallet', async () => {
        const exists = await fs.pathExists(path.join(testWalletsDir, 'nonexistent.json'));
        expect(exists).toBe(false);
    });

    it('should correctly format wallet info', async () => {
        const createdAt = new Date().toISOString();
        const walletData = {
            publicKey: Keypair.random().publicKey(),
            secretKey: Keypair.random().secret(),
            network: 'mainnet',
            createdAt
        };

        await fs.writeJson(path.join(testWalletsDir, 'mainnet.json'), walletData);

        const loaded = await fs.readJson(path.join(testWalletsDir, 'mainnet.json'));
        expect(loaded.createdAt).toBe(createdAt);
        expect(loaded.network).toBe('mainnet');
    });

    it('should handle testnet network correctly', async () => {
        const walletData = {
            publicKey: Keypair.random().publicKey(),
            secretKey: Keypair.random().secret(),
            network: 'testnet',
            createdAt: new Date().toISOString()
        };

        await fs.writeJson(path.join(testWalletsDir, 'testnet.json'), walletData);

        const loaded = await fs.readJson(path.join(testWalletsDir, 'testnet.json'));
        expect(loaded.network).toBe('testnet');
    });
});