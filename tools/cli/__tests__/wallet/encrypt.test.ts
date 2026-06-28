/**
 * @fileoverview Tests for `galaxy wallet encrypt` migration command
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { Keypair } from '@stellar/stellar-sdk';

jest.mock('inquirer', () => ({ prompt: jest.fn() }));

import { encryptWalletCommand } from '../../src/commands/wallet/encrypt';
import { walletStorage, WalletStorage } from '../../src/utils/wallet-storage';

describe('wallet encrypt command', () => {
    const testDir = path.join(os.tmpdir(), '.galaxy-test-encrypt-cmd');
    const originalExit = process.exit;
    let logSpy: jest.SpiedFunction<typeof console.log>;
    let errSpy: jest.SpiedFunction<typeof console.error>;

    beforeEach(async () => {
        (walletStorage as any).walletsDir = path.join(testDir, 'wallets');
        await fs.ensureDir((walletStorage as any).walletsDir);
        logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
        process.exit = jest.fn() as never;
    });

    afterEach(async () => {
        await fs.remove(testDir);
        logSpy.mockRestore();
        errSpy.mockRestore();
        process.exit = originalExit;
    });

    function lastJson() {
        const printed = logSpy.mock.calls.map(c => c[0]).join('\n');
        return JSON.parse(printed);
    }

    async function storePlain(name: string) {
        const pair = Keypair.random();
        await walletStorage.saveWallet(name, {
            publicKey: pair.publicKey(),
            secretKey: pair.secret(),
            network: 'testnet',
            createdAt: new Date().toISOString()
        });
        return pair;
    }

    it('encrypts a plaintext wallet and removes the plaintext secret from disk', async () => {
        const pair = await storePlain('plain');
        await encryptWalletCommand.parseAsync([
            'node', 'encrypt', 'plain', '--password', 'pw-pw-pw-pw', '--json'
        ]);

        const result = lastJson();
        expect(result.success).toBe(true);
        expect(result.encrypted).toBe(true);

        const onDisk = await fs.readJson(walletStorage.getWalletPath('plain'));
        expect(onDisk.encrypted).toBe(true);
        expect(onDisk.secretKey).toBeUndefined();
        expect(JSON.stringify(onDisk)).not.toContain(pair.secret());

        // And the secret can still be recovered with the password.
        const decrypted = await walletStorage.loadWalletDecrypted('plain', 'pw-pw-pw-pw');
        expect(decrypted?.secretKey).toBe(pair.secret());
    });

    it('fails when the wallet is already encrypted', async () => {
        const pair = Keypair.random();
        await walletStorage.saveWalletEncrypted('already', {
            publicKey: pair.publicKey(),
            secretKey: pair.secret(),
            network: 'testnet',
            createdAt: new Date().toISOString()
        }, 'pw-pw-pw-pw');

        await encryptWalletCommand.parseAsync([
            'node', 'encrypt', 'already', '--password', 'pw-pw-pw-pw', '--json'
        ]);

        expect(lastJson().error).toMatch(/already encrypted/);
        expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('fails when the wallet does not exist', async () => {
        await encryptWalletCommand.parseAsync([
            'node', 'encrypt', 'ghost', '--password', 'pw-pw-pw-pw', '--json'
        ]);
        expect(lastJson().error).toMatch(/not found/);
    });
});
