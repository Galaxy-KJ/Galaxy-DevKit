/**
 * @fileoverview Tests for `galaxy wallet balance` command
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { Keypair } from '@stellar/stellar-sdk';

const loadAccountMock = jest.fn();

jest.mock('@stellar/stellar-sdk', () => {
    const actual = jest.requireActual('@stellar/stellar-sdk') as any;
    return {
        ...actual,
        Horizon: {
            ...actual.Horizon,
            Server: jest.fn().mockImplementation(() => ({
                loadAccount: loadAccountMock
            }))
        }
    };
});

jest.mock('inquirer', () => ({ prompt: jest.fn() }));

import { balanceCommand } from '../../src/commands/wallet/balance';
import { walletStorage } from '../../src/utils/wallet-storage';

describe('wallet balance command', () => {
    const testDir = path.join(os.tmpdir(), '.galaxy-test-balance');
    const originalExit = process.exit;
    let logSpy: jest.SpiedFunction<typeof console.log>;
    let errSpy: jest.SpiedFunction<typeof console.error>;

    beforeEach(async () => {
        (walletStorage as any).walletsDir = path.join(testDir, 'wallets');
        await fs.ensureDir((walletStorage as any).walletsDir);
        loadAccountMock.mockReset();
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

    function findCmd(name: string) {
        const cmd = (balanceCommand as any);
        if (cmd.name() === name) return cmd;
        throw new Error(`Command not found: ${name}`);
    }

    it('rejects an invalid Stellar public key', async () => {
        const cmd = findCmd('balance');
        await cmd.parseAsync(['node', 'balance', 'not-a-key', '--json']);
        const printed = logSpy.mock.calls.map(c => c[0]).join('\n');
        expect(printed).toMatch(/Invalid Stellar public key/);
        expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('returns exists:false when account is missing on the network', async () => {
        loadAccountMock.mockRejectedValueOnce({ response: { status: 404 } });

        const pair = Keypair.random();
        const cmd = findCmd('balance');
        await cmd.parseAsync(['node', 'balance', pair.publicKey(), '--json', '--network', 'testnet']);

        const printed = logSpy.mock.calls.map(c => c[0]).join('\n');
        const payload = JSON.parse(printed);
        expect(payload.exists).toBe(false);
        expect(payload.balances).toEqual([]);
        expect(payload.network).toBe('testnet');
    });

    it('normalizes native and credit balances', async () => {
        loadAccountMock.mockResolvedValueOnce({
            balances: [
                { asset_type: 'native', balance: '100.5000000' },
                {
                    asset_type: 'credit_alphanum4',
                    asset_code: 'USDC',
                    asset_issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
                    balance: '42.0000000',
                    limit: '1000000.0000000'
                }
            ]
        });

        const pair = Keypair.random();
        const cmd = findCmd('balance');
        await cmd.parseAsync(['node', 'balance', pair.publicKey(), '--json']);

        const printed = logSpy.mock.calls.map(c => c[0]).join('\n');
        const payload = JSON.parse(printed);
        expect(payload.exists).toBe(true);
        expect(payload.balances).toEqual([
            { asset: 'XLM', balance: '100.5000000', type: 'native' },
            {
                asset: 'USDC',
                balance: '42.0000000',
                limit: '1000000.0000000',
                issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
                type: 'credit_alphanum4'
            }
        ]);
    });

    it('resolves --name to the stored wallet public key', async () => {
        const pair = Keypair.random();
        await walletStorage.saveWallet('alice', {
            publicKey: pair.publicKey(),
            secretKey: pair.secret(),
            network: 'mainnet',
            createdAt: new Date().toISOString()
        });

        loadAccountMock.mockResolvedValueOnce({
            balances: [{ asset_type: 'native', balance: '1.0000000' }]
        });

        // Pass --network explicitly: commander persists option state across parseAsync
        // calls on the same Command instance, so any prior test's --network would
        // leak into this one. We pin mainnet here to also exercise the override path.
        const cmd = findCmd('balance');
        await cmd.parseAsync(['node', 'balance', '--name', 'alice', '--network', 'mainnet', '--json']);

        expect(loadAccountMock).toHaveBeenCalledWith(pair.publicKey());
        const printed = logSpy.mock.calls.map(c => c[0]).join('\n');
        const payload = JSON.parse(printed);
        expect(payload.address).toBe(pair.publicKey());
        expect(payload.network).toBe('mainnet');
    });
});
