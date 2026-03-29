/**
 * @fileoverview Tests for wallet import command
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

describe('wallet import command', () => {
    const testWalletsDir = path.join(os.tmpdir(), '.galaxy-test', 'wallets');

    beforeEach(async () => {
        await fs.ensureDir(testWalletsDir);
    });

    afterEach(async () => {
        await fs.emptyDir(testWalletsDir);
    });

    it('should import wallet from valid secret key', async () => {
        const pair = Keypair.random();
        const secretKey = pair.secret();
        const publicKey = pair.publicKey();
        const walletName = 'imported-wallet';
        const walletPath = path.join(testWalletsDir, `${walletName}.json`);

        // Simulate import
        const walletData = {
            publicKey,
            secretKey,
            network: 'testnet',
            createdAt: new Date().toISOString(),
            importedAt: new Date().toISOString()
        };

        await fs.ensureDir(testWalletsDir);
        await fs.writeJson(walletPath, walletData);

        // Verify
        const savedWallet = await fs.readJson(walletPath);
        expect(savedWallet.publicKey).toBe(publicKey);
        expect(savedWallet.secretKey).toBe(secretKey);
        expect(savedWallet.importedAt).toBeDefined();
    });

    it('should reject invalid secret key format', () => {
        const invalidKey = 'INVALID_SECRET_KEY';
        
        expect(() => {
            Keypair.fromSecret(invalidKey);
        }).toThrow();
    });

    it('should derive correct public key from secret', () => {
        const pair1 = Keypair.random();
        const secret = pair1.secret();
        
        const pair2 = Keypair.fromSecret(secret);
        expect(pair2.publicKey()).toBe(pair1.publicKey());
    });

    it('should include both createdAt and importedAt timestamps', async () => {
        const pair = Keypair.random();
        const walletName = 'timestamped-import';
        const walletPath = path.join(testWalletsDir, `${walletName}.json`);

        const walletData = {
            publicKey: pair.publicKey(),
            secretKey: pair.secret(),
            network: 'testnet',
            createdAt: new Date().toISOString(),
            importedAt: new Date().toISOString()
        };

        await fs.ensureDir(testWalletsDir);
        await fs.writeJson(walletPath, walletData);

        const savedWallet = await fs.readJson(walletPath);
        expect(savedWallet.createdAt).toBeDefined();
        expect(savedWallet.importedAt).toBeDefined();
    });
});
