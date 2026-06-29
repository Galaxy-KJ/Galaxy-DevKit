/**
 * @fileoverview Tests for `galaxy wallet send` command
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { Keypair } from '@stellar/stellar-sdk';

const loadAccountMock = jest.fn();
const submitTransactionMock = jest.fn();

jest.mock('@stellar/stellar-sdk', () => {
    const actual = jest.requireActual('@stellar/stellar-sdk') as any;
    return {
        ...actual,
        Horizon: {
            ...actual.Horizon,
            Server: jest.fn().mockImplementation(() => ({
                loadAccount: loadAccountMock,
                submitTransaction: submitTransactionMock
            }))
        }
    };
});

jest.mock('inquirer', () => ({ prompt: jest.fn() }));

import { sendCommand } from '../../src/commands/wallet/send';
import { walletStorage } from '../../src/utils/wallet-storage';

const ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

describe('wallet send command', () => {
    const testDir = path.join(os.tmpdir(), '.galaxy-test-send');
    const originalExit = process.exit;
    let logSpy: jest.SpiedFunction<typeof console.log>;
    let errSpy: jest.SpiedFunction<typeof console.error>;

    beforeEach(async () => {
        (walletStorage as any).walletsDir = path.join(testDir, 'wallets');
        await fs.ensureDir((walletStorage as any).walletsDir);
        loadAccountMock.mockReset();
        submitTransactionMock.mockReset();
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

    async function storeWallet(name: string, network: 'testnet' | 'mainnet' = 'testnet') {
        const pair = Keypair.random();
        await walletStorage.saveWallet(name, {
            publicKey: pair.publicKey(),
            secretKey: pair.secret(),
            network,
            createdAt: new Date().toISOString()
        });
        return pair;
    }

    it('rejects an invalid destination address', async () => {
        await storeWallet('alice');
        await sendCommand.parseAsync(['node', 'send', 'alice', 'not-a-key', '1', 'XLM', '--json']);
        expect(lastJson().error).toMatch(/Invalid destination/);
        expect(process.exit).toHaveBeenCalledWith(1);
    });

    it('rejects a non-positive amount', async () => {
        await storeWallet('alice');
        const bob = Keypair.random();
        await sendCommand.parseAsync(['node', 'send', 'alice', bob.publicKey(), '0', 'XLM', '--json']);
        expect(lastJson().error).toMatch(/Invalid amount/);
    });

    it('rejects a malformed asset spec', async () => {
        await storeWallet('alice');
        const bob = Keypair.random();
        await sendCommand.parseAsync(['node', 'send', 'alice', bob.publicKey(), '1', 'USDC', '--json']);
        expect(lastJson().error).toMatch(/Invalid asset/);
    });

    it('fails fast when source wallet does not exist', async () => {
        const bob = Keypair.random();
        await sendCommand.parseAsync(['node', 'send', 'ghost', bob.publicKey(), '1', 'XLM', '--json']);
        expect(lastJson().error).toMatch(/Source wallet 'ghost' not found/);
    });

    it('submits a native XLM payment and reports the hash', async () => {
        const alice = await storeWallet('alice');
        const bob = Keypair.random();

        loadAccountMock.mockResolvedValueOnce({
            accountId: () => alice.publicKey(),
            sequenceNumber: () => '1',
            incrementSequenceNumber: () => {},
            balances: [{ asset_type: 'native', balance: '1000' }]
        });
        submitTransactionMock.mockResolvedValueOnce({ hash: 'deadbeef', ledger: 42 });

        await sendCommand.parseAsync(['node', 'send', 'alice', bob.publicKey(), '5', 'XLM', '--json']);

        expect(submitTransactionMock).toHaveBeenCalledTimes(1);
        const payload = lastJson();
        expect(payload.success).toBe(true);
        expect(payload.hash).toBe('deadbeef');
        expect(payload.asset).toBe('XLM');
        expect(payload.to).toBe(bob.publicKey());
    });

    it('blocks issuer-asset send when destination has no trustline', async () => {
        const alice = await storeWallet('alice');
        const bob = Keypair.random();

        // source account
        loadAccountMock.mockResolvedValueOnce({
            accountId: () => alice.publicKey(),
            sequenceNumber: () => '1',
            incrementSequenceNumber: () => {},
            balances: [{ asset_type: 'native', balance: '1000' }]
        });
        // destination account (no trustline for USDC)
        loadAccountMock.mockResolvedValueOnce({
            balances: [{ asset_type: 'native', balance: '5' }]
        });

        await sendCommand.parseAsync([
            'node', 'send', 'alice', bob.publicKey(), '10', `USDC:${ISSUER}`, '--json'
        ]);

        expect(submitTransactionMock).not.toHaveBeenCalled();
        expect(lastJson().error).toMatch(/does not have a trustline/);
    });

    it('submits an issuer-asset payment when trustline exists', async () => {
        const alice = await storeWallet('alice');
        const bob = Keypair.random();

        loadAccountMock.mockResolvedValueOnce({
            accountId: () => alice.publicKey(),
            sequenceNumber: () => '1',
            incrementSequenceNumber: () => {},
            balances: [{ asset_type: 'native', balance: '1000' }]
        });
        loadAccountMock.mockResolvedValueOnce({
            balances: [
                { asset_type: 'native', balance: '5' },
                { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: ISSUER, balance: '0', limit: '1000' }
            ]
        });
        submitTransactionMock.mockResolvedValueOnce({ hash: 'cafe', ledger: 99 });

        await sendCommand.parseAsync([
            'node', 'send', 'alice', bob.publicKey(), '10', `USDC:${ISSUER}`, '--json'
        ]);

        const payload = lastJson();
        expect(payload.success).toBe(true);
        expect(payload.asset).toBe(`USDC:${ISSUER}`);
    });

    it('requires --password for encrypted wallets in --json mode', async () => {
        const pair = Keypair.random();
        await walletStorage.saveWalletEncrypted('vault', {
            publicKey: pair.publicKey(),
            secretKey: pair.secret(),
            network: 'testnet',
            createdAt: new Date().toISOString()
        }, 'pw-pw-pw-pw');

        const bob = Keypair.random();
        await sendCommand.parseAsync(['node', 'send', 'vault', bob.publicKey(), '1', 'XLM', '--json']);

        expect(submitTransactionMock).not.toHaveBeenCalled();
        expect(lastJson().error).toMatch(/--password is required/);
    });

    it('surfaces Horizon result_codes when the submission fails', async () => {
        const alice = await storeWallet('alice');
        const bob = Keypair.random();

        loadAccountMock.mockResolvedValueOnce({
            accountId: () => alice.publicKey(),
            sequenceNumber: () => '1',
            incrementSequenceNumber: () => {},
            balances: [{ asset_type: 'native', balance: '1000' }]
        });
        submitTransactionMock.mockRejectedValueOnce({
            message: 'tx failed',
            response: { data: { extras: { result_codes: { transaction: 'tx_failed', operations: ['op_underfunded'] } } } }
        });

        await sendCommand.parseAsync(['node', 'send', 'alice', bob.publicKey(), '5', 'XLM', '--json']);

        expect(lastJson().error).toMatch(/op_underfunded/);
    });
});
