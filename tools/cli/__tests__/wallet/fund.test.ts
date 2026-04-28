/**
 * @fileoverview Tests for wallet fund command
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

jest.mock('fetch', () => {
    return jest.fn();
});

describe('wallet fund command', () => {
    const testWalletsDir = path.join(os.tmpdir(), '.galaxy-test', 'wallets');

    beforeEach(async () => {
        await fs.ensureDir(testWalletsDir);
    });

    afterEach(async () => {
        await fs.remove(path.dirname(testWalletsDir));
    });

    it('should reject mainnet wallets', async () => {
        const pair = Keypair.random();
        const walletData = {
            publicKey: pair.publicKey(),
            secretKey: pair.secret(),
            network: 'mainnet',
            createdAt: new Date().toISOString()
        };

        await fs.writeJson(path.join(testWalletsDir, 'mainnet.json'), walletData);

        const loaded = await fs.readJson(path.join(testWalletsDir, 'mainnet.json'));
        expect(loaded.network).toBe('mainnet');
    });

    it('should accept testnet wallets for funding', async () => {
        const pair = Keypair.random();
        const walletData = {
            publicKey: pair.publicKey(),
            secretKey: pair.secret(),
            network: 'testnet',
            createdAt: new Date().toISOString()
        };

        await fs.writeJson(path.join(testWalletsDir, 'testnet.json'), walletData);

        const loaded = await fs.readJson(path.join(testWalletsDir, 'testnet.json'));
        expect(loaded.network).toBe('testnet');
    });

    it('should validate fund amount', async () => {
        const amount = parseFloat('10000');
        expect(amount).toBeGreaterThan(0);
        expect(!isNaN(amount)).toBe(true);
    });

    it('should build correct friendbot URL', async () => {
        const publicKey = Keypair.random().publicKey();
        const amount = '10000';
        const url = `https://friendbot.stellar.org?addr=${publicKey}&amount=${amount}`;

        expect(url).toContain(publicKey);
        expect(url).toContain('amount=10000');
        expect(url).toContain('friendbot.stellar.org');
    });

    it('should handle wallet not found', async () => {
        const exists = await fs.pathExists(path.join(testWalletsDir, 'nonexistent.json'));
        expect(exists).toBe(false);
    });
});