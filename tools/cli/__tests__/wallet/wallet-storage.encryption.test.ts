/**
 * @fileoverview Tests for the encrypted-at-rest helpers on WalletStorage
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { WalletStorage } from '../../src/utils/wallet-storage';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { Keypair } from '@stellar/stellar-sdk';

describe('WalletStorage encrypted-at-rest', () => {
    let storage: WalletStorage;
    const testDir = path.join(os.tmpdir(), '.galaxy-test-encryption');

    beforeEach(async () => {
        storage = new WalletStorage();
        (storage as any).walletsDir = path.join(testDir, 'wallets');
        await fs.ensureDir((storage as any).walletsDir);
    });

    afterEach(async () => {
        await fs.remove(testDir);
    });

    function freshWallet() {
        const pair = Keypair.random();
        return {
            pair,
            data: {
                publicKey: pair.publicKey(),
                secretKey: pair.secret(),
                network: 'testnet' as const,
                createdAt: new Date().toISOString()
            }
        };
    }

    it('saveWalletEncrypted writes an encrypted payload with no plaintext secret', async () => {
        const { data } = freshWallet();
        await storage.saveWalletEncrypted('enc-1', data, 'correcthorsebatterystaple');

        const raw = await fs.readJson(storage.getWalletPath('enc-1'));
        expect(raw.encrypted).toBe(true);
        expect(raw.publicKey).toBe(data.publicKey);
        expect(raw.encryptedSecret).toMatchObject({
            salt: expect.any(String),
            iv: expect.any(String),
            authTag: expect.any(String),
            content: expect.any(String)
        });
        expect(raw.secretKey).toBeUndefined();
        expect(JSON.stringify(raw)).not.toContain(data.secretKey);
    });

    it('isWalletEncrypted reports the correct flag', async () => {
        const { data } = freshWallet();
        await storage.saveWallet('plain', data);
        await storage.saveWalletEncrypted('enc', data, 'pw-pw-pw-pw');

        expect(await storage.isWalletEncrypted('plain')).toBe(false);
        expect(await storage.isWalletEncrypted('enc')).toBe(true);
    });

    it('loadWalletDecrypted round-trips the secret with the correct password', async () => {
        const { data } = freshWallet();
        await storage.saveWalletEncrypted('round-trip', data, 'pw-pw-pw-pw');

        const loaded = await storage.loadWalletDecrypted('round-trip', 'pw-pw-pw-pw');
        expect(loaded).not.toBeNull();
        expect(loaded!.publicKey).toBe(data.publicKey);
        expect(loaded!.secretKey).toBe(data.secretKey);
        expect(loaded!.network).toBe('testnet');
    });

    it('loadWalletDecrypted throws on wrong password', async () => {
        const { data } = freshWallet();
        await storage.saveWalletEncrypted('w', data, 'right-password');

        await expect(storage.loadWalletDecrypted('w', 'wrong-password')).rejects.toThrow();
    });

    it('loadWalletDecrypted throws when password is missing for encrypted wallet', async () => {
        const { data } = freshWallet();
        await storage.saveWalletEncrypted('w', data, 'pw-pw-pw-pw');

        await expect(storage.loadWalletDecrypted('w')).rejects.toThrow(/password is required/i);
    });

    it('loadWalletDecrypted returns plaintext wallets unchanged when no password is given', async () => {
        const { data } = freshWallet();
        await storage.saveWallet('plain', data);

        const loaded = await storage.loadWalletDecrypted('plain');
        expect(loaded?.secretKey).toBe(data.secretKey);
    });

    it('listWallets surfaces the encrypted flag per wallet', async () => {
        const { data: a } = freshWallet();
        const { data: b } = freshWallet();
        await storage.saveWallet('plain', a);
        await storage.saveWalletEncrypted('enc', b, 'pw-pw-pw-pw');

        const list = await storage.listWallets();
        expect(list.find(w => w.name === 'plain')!.encrypted).toBe(false);
        expect(list.find(w => w.name === 'enc')!.encrypted).toBe(true);
    });
});
