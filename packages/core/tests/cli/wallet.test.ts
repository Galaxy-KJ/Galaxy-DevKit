/**
 * Tests for wallet CLI commands and encrypted wallet store.
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { Horizon, Keypair } from '@stellar/stellar-sdk';
import {
  WalletStore,
  __resetKeytarCacheForTests,
  __setKeytarForTests,
} from '../../src/cli/wallet-store.js';
import { createWalletCommands, parseAsset } from '../../src/cli/commands/wallet.js';

jest.mock('inquirer', () => ({
  prompt: jest.fn(),
}));

import inquirer from 'inquirer';
const mockPrompt = inquirer.prompt as jest.MockedFunction<
  typeof inquirer.prompt
>;

describe('WalletStore', () => {
  let store: WalletStore;
  let testDir: string;
  const encryptionKey = 'test-encryption-key-32chars-min!!!!';

  beforeEach(async () => {
    testDir = path.join(
      os.tmpdir(),
      `galaxy-wallet-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    store = new WalletStore({
      walletsDir: path.join(testDir, 'wallets'),
      encryptionKey,
    });
    await store.ensureDir();
  });

  afterEach(async () => {
    await fs.remove(testDir);
  });

  it('encrypts secrets at rest (no plaintext secret in file)', async () => {
    const pair = Keypair.random();
    await store.saveWallet('enc-test', pair.secret(), {
      publicKey: pair.publicKey(),
      network: 'testnet',
      createdAt: new Date().toISOString(),
    });

    const raw = await fs.readJson(store.getWalletPath('enc-test'));
    expect(raw.publicKey).toBe(pair.publicKey());
    expect(raw.encryptedSecret).toBeDefined();
    expect(raw.secretKey).toBeUndefined();
    expect(JSON.stringify(raw)).not.toContain(pair.secret().slice(1, 20));
  });

  it('round-trips encrypt and decrypt', () => {
    const secret = Keypair.random().secret();
    const encrypted = WalletStore.encrypt(secret, encryptionKey);
    const decrypted = WalletStore.decrypt(encrypted, encryptionKey);
    expect(decrypted).toBe(secret);
  });

  it('saveWallet and getSecretKey return the same secret', async () => {
    const pair = Keypair.random();
    await store.saveWallet('roundtrip', pair.secret(), {
      publicKey: pair.publicKey(),
      network: 'testnet',
      createdAt: new Date().toISOString(),
    });
    const loaded = await store.getSecretKey('roundtrip');
    expect(loaded).toBe(pair.secret());
  });

  it('listWallets omits secrets', async () => {
    const p1 = Keypair.random();
    const p2 = Keypair.random();
    await store.saveWallet('w1', p1.secret(), {
      publicKey: p1.publicKey(),
      network: 'testnet',
      createdAt: new Date().toISOString(),
    });
    await store.saveWallet('w2', p2.secret(), {
      publicKey: p2.publicKey(),
      network: 'mainnet',
      createdAt: new Date().toISOString(),
    });

    const list = await store.listWallets();
    expect(list).toHaveLength(2);
    expect(list.find((w) => w.name === 'w1')?.publicKey).toBe(p1.publicKey());
    expect(list.find((w) => w.name === 'w2')?.network).toBe('mainnet');
  });

  it('walletExists and deleteWallet work', async () => {
    const pair = Keypair.random();
    await store.saveWallet('del', pair.secret(), {
      publicKey: pair.publicKey(),
      network: 'testnet',
      createdAt: new Date().toISOString(),
    });
    expect(await store.walletExists('del')).toBe(true);
    await store.deleteWallet('del');
    expect(await store.walletExists('del')).toBe(false);
  });

  it('resolveFromWallet finds wallet by name and public key', async () => {
    const pair = Keypair.random();
    await store.saveWallet('named', pair.secret(), {
      publicKey: pair.publicKey(),
      network: 'testnet',
      createdAt: new Date().toISOString(),
    });

    const byName = await store.resolveFromWallet('named');
    expect(byName?.publicKey).toBe(pair.publicKey());
    expect(byName?.secretKey).toBe(pair.secret());

    const byPk = await store.resolveFromWallet(pair.publicKey());
    expect(byPk?.secretKey).toBe(pair.secret());
  });

  it('getEncryptionKey uses override when provided', async () => {
    const key = await store.getEncryptionKey();
    expect(key).toBe(encryptionKey);
  });

  it('getEncryptionKey reads GALAXY_WALLET_ENCRYPTION_KEY env', async () => {
    const envStore = new WalletStore({
      walletsDir: path.join(testDir, 'env-wallets'),
    });
    process.env.GALAXY_WALLET_ENCRYPTION_KEY = 'env-key-value';
    const key = await envStore.getEncryptionKey();
    expect(key).toBe('env-key-value');
    delete process.env.GALAXY_WALLET_ENCRYPTION_KEY;
  });

  it('loadWalletRecord returns null for missing wallet', async () => {
    expect(await store.loadWalletRecord('missing')).toBeNull();
  });

  it('getSecretKey returns null when wallet missing', async () => {
    expect(await store.getSecretKey('missing')).toBeNull();
  });

  it('resolveFromWallet returns null for unknown public key', async () => {
    expect(await store.resolveFromWallet(Keypair.random().publicKey())).toBeNull();
  });

  it('deleteWallet returns false when wallet missing', async () => {
    expect(await store.deleteWallet('nope')).toBe(false);
  });

  it('listWallets skips invalid json files', async () => {
    await fs.writeFile(path.join(store.getWalletsDir(), 'bad.json'), 'not-json');
    const list = await store.listWallets();
    expect(list).toEqual([]);
  });

  it('fails decrypt with wrong password', () => {
    const encrypted = WalletStore.encrypt('secret', encryptionKey);
    expect(() => WalletStore.decrypt(encrypted, 'wrong-password')).toThrow();
  });

  it('persists file-based encryption key when keytar unavailable', async () => {
    __resetKeytarCacheForTests();
    __setKeytarForTests(null);

    const keyDir = path.join(testDir, 'file-key-home', '.galaxy');
    const keyPath = path.join(keyDir, '.wallet-key');
    const fileStore = new WalletStore({
      walletsDir: path.join(testDir, 'file-key-wallets'),
    });
    delete process.env.GALAXY_WALLET_ENCRYPTION_KEY;
    await fs.remove(keyPath).catch(() => undefined);

    const homedirSpy = jest
      .spyOn(os, 'homedir')
      .mockReturnValue(path.join(testDir, 'file-key-home'));

    const key1 = await fileStore.getEncryptionKey();
    const key2 = await fileStore.getEncryptionKey();
    expect(key1).toBe(key2);
    expect(await fs.pathExists(keyPath)).toBe(true);

    homedirSpy.mockRestore();
    __resetKeytarCacheForTests();
  });

  it('stores encryption key in keytar when available', async () => {
    __resetKeytarCacheForTests();
    const setPassword = jest.fn(async () => undefined);
    const getPassword = jest.fn(async () => null as string | null);
    __setKeytarForTests({ getPassword, setPassword });

    const ktStore = new WalletStore({
      walletsDir: path.join(testDir, 'kt-wallets'),
    });
    delete process.env.GALAXY_WALLET_ENCRYPTION_KEY;
    await ktStore.getEncryptionKey();
    expect(setPassword).toHaveBeenCalled();
    __resetKeytarCacheForTests();
  });

  it('reuses existing keytar encryption key', async () => {
    __resetKeytarCacheForTests();
    const getPassword = jest.fn(async () => 'existing-key-from-keychain');
    const setPassword = jest.fn(async () => undefined);
    __setKeytarForTests({ getPassword, setPassword });

    const ktStore = new WalletStore({
      walletsDir: path.join(testDir, 'kt-reuse-wallets'),
    });
    delete process.env.GALAXY_WALLET_ENCRYPTION_KEY;
    const key = await ktStore.getEncryptionKey();
    expect(key).toBe('existing-key-from-keychain');
    expect(setPassword).not.toHaveBeenCalled();
    __resetKeytarCacheForTests();
  });
});

describe('parseAsset', () => {
  it('parses native XLM', () => {
    expect(parseAsset('XLM').getAssetType()).toBe('native');
  });

  it('parses custom asset', () => {
    const issuer = Keypair.random().publicKey();
    const asset = parseAsset(`USDC:${issuer}`);
    expect(asset.getCode()).toBe('USDC');
  });

  it('throws on invalid asset', () => {
    expect(() => parseAsset('INVALID')).toThrow(/Asset must be/);
  });
});

describe('wallet CLI commands', () => {
  let store: WalletStore;
  let testDir: string;
  let stdout: string[];
  let stderr: string[];
  let exitCode: number | null;

  beforeEach(async () => {
    testDir = path.join(
      os.tmpdir(),
      `galaxy-wallet-cli-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    store = new WalletStore({
      walletsDir: path.join(testDir, 'wallets'),
      encryptionKey: 'cli-test-key-fixed-value!!!!!!',
    });
    stdout = [];
    stderr = [];
    exitCode = null;
    jest.restoreAllMocks();
    mockPrompt.mockReset();
    await store.ensureDir();
  });

  afterEach(async () => {
    await fs.remove(testDir);
  });

  function makeCommand() {
    const cmd = createWalletCommands({
      store,
      output: (msg) => stdout.push(msg),
      error: (msg) => stderr.push(msg),
      exit: (code) => {
        exitCode = code;
        throw new Error(`exit:${code}`);
      },
    });
    cmd.exitOverride();
    return cmd;
  }

  async function run(args: string[]): Promise<void> {
    const cmd = makeCommand();
    try {
      await cmd.parseAsync(args, { from: 'user' });
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('exit:')) {
        return;
      }
      const err = e as { code?: string; exitCode?: number };
      if (err.exitCode !== undefined) {
        exitCode = err.exitCode;
        return;
      }
      throw e;
    }
  }

  it('create --name saves encrypted wallet', async () => {
    await run(['create', '--name', 'my-wallet', '--json']);
    expect(exitCode).toBeNull();
    const parsed = JSON.parse(stdout.join('\n'));
    expect(parsed.success).toBe(true);
    expect(parsed.name).toBe('my-wallet');
    expect(await store.walletExists('my-wallet')).toBe(true);
    const secret = await store.getSecretKey('my-wallet');
    expect(secret).toMatch(/^S/);
  });

  it('import --secret stores wallet', async () => {
    const pair = Keypair.random();
    await run([
      'import',
      '--secret',
      pair.secret(),
      '--name',
      'imported',
      '--json',
    ]);
    const parsed = JSON.parse(stdout.join('\n'));
    expect(parsed.publicKey).toBe(pair.publicKey());
    expect(await store.getSecretKey('imported')).toBe(pair.secret());
  });

  it('import rejects invalid secret', async () => {
    await run(['import', '--secret', 'not-a-secret', '--name', 'bad', '--json']);
    expect(exitCode).toBe(1);
    expect(stdout.join('')).toContain('Invalid secret key');
  });

  it('list outputs wallets as JSON', async () => {
    const pair = Keypair.random();
    await store.saveWallet('listed', pair.secret(), {
      publicKey: pair.publicKey(),
      network: 'testnet',
      createdAt: new Date().toISOString(),
    });
    await run(['list', '--json']);
    const parsed = JSON.parse(stdout.join('\n'));
    expect(parsed.wallets).toHaveLength(1);
    expect(parsed.wallets[0].name).toBe('listed');
  });

  it('list reports empty when no wallets', async () => {
    await run(['list']);
    expect(stdout.join('')).toContain('No wallets found');
  });

  it('create fails when wallet exists', async () => {
    const pair = Keypair.random();
    await store.saveWallet('dup', pair.secret(), {
      publicKey: pair.publicKey(),
      network: 'testnet',
      createdAt: new Date().toISOString(),
    });
    await run(['create', '--name', 'dup', '--json']);
    expect(exitCode).toBe(1);
  });

  it('balance fetches account from Horizon (mocked)', async () => {
    const address = Keypair.random().publicKey();
    const mockAccount = {
      balances: [
        { asset_type: 'native', balance: '100.0000000' },
        {
          asset_type: 'credit_alphanum4',
          asset_code: 'USDC',
          asset_issuer: 'GBBD47IF6LWK7P7MDEVSC6777KQEFHZFHH6LPAUKNUIYBNHZXLF5SWD2',
          balance: '50.0000000',
        },
      ],
    };

    jest
      .spyOn(Horizon.Server.prototype, 'loadAccount')
      .mockResolvedValue(mockAccount as never);

    await run(['balance', address, '--json']);
    const parsed = JSON.parse(stdout.join('\n'));
    expect(parsed.balances).toEqual(
      expect.arrayContaining([
        { asset: 'XLM', balance: '100.0000000' },
        {
          asset:
            'USDC:GBBD47IF6LWK7P7MDEVSC6777KQEFHZFHH6LPAUKNUIYBNHZXLF5SWD2',
          balance: '50.0000000',
        },
      ])
    );
    jest.restoreAllMocks();
  });

  it('balance reports not found for missing account', async () => {
    const address = Keypair.random().publicKey();
    jest
      .spyOn(Horizon.Server.prototype, 'loadAccount')
      .mockRejectedValue(new Error('Not Found'));

    await run(['balance', address, '--json']);
    expect(exitCode).toBe(1);
    expect(stdout.join('')).toContain('not found');
  });

  it('send submits payment (mocked Horizon)', async () => {
    const source = Keypair.random();
    const dest = Keypair.random().publicKey();
    await store.saveWallet('sender', source.secret(), {
      publicKey: source.publicKey(),
      network: 'testnet',
      createdAt: new Date().toISOString(),
    });

    const accountRecord = {
      _links: {},
      id: source.publicKey(),
      paging_token: 'pt',
      account_id: source.publicKey(),
      sequence: '1',
      subentry_count: 0,
      last_modified_ledger: 1,
      last_modified_time: '2020-01-01T00:00:00Z',
      thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 },
      flags: {
        auth_required: false,
        auth_revocable: false,
        auth_immutable: false,
        auth_clawback_enabled: false,
      },
      balances: [{ asset_type: 'native', balance: '1000' }],
      signers: [{ key: source.publicKey(), weight: 1, type: 'ed25519_public_key' }],
      data: async () => ({ value: '' }),
      data_attr: {},
      num_sponsoring: 0,
      num_sponsored: 0,
      effects: jest.fn(),
      offers: jest.fn(),
      operations: jest.fn(),
      payments: jest.fn(),
      trades: jest.fn(),
    };

    jest
      .spyOn(Horizon.Server.prototype, 'loadAccount')
      .mockResolvedValue(new Horizon.AccountResponse(accountRecord as never));

    jest
      .spyOn(Horizon.Server.prototype, 'submitTransaction')
      .mockResolvedValue({ hash: 'abc123hash' } as never);

    await run(['send', 'sender', dest, '10', 'XLM', '--json']);
    const parsed = JSON.parse(stdout.join('\n'));
    expect(parsed.success).toBe(true);
    expect(parsed.hash).toBe('abc123hash');
  });

  it('send rejects unknown source wallet', async () => {
    await run([
      'send',
      'missing',
      Keypair.random().publicKey(),
      '1',
      'XLM',
      '--json',
    ]);
    expect(exitCode).toBe(1);
  });

  it('create prompts for name when omitted', async () => {
    mockPrompt.mockResolvedValue({ name: 'prompted' });
    await run(['create']);
    expect(await store.walletExists('prompted')).toBe(true);
  });

  it('import prompts for name when omitted', async () => {
    const pair = Keypair.random();
    mockPrompt.mockResolvedValue({ name: 'prompted-import' });
    await run(['import', '--secret', pair.secret()]);
    expect(await store.getSecretKey('prompted-import')).toBe(pair.secret());
  });

  it('balance rejects invalid address', async () => {
    await run(['balance', 'not-an-address', '--json']);
    expect(exitCode).toBe(1);
    expect(stdout.join('')).toContain('Invalid Stellar address');
  });

  it('send rejects invalid destination', async () => {
    const source = Keypair.random();
    await store.saveWallet('s', source.secret(), {
      publicKey: source.publicKey(),
      network: 'testnet',
      createdAt: new Date().toISOString(),
    });
    await run(['send', 's', 'bad-dest', '1', 'XLM', '--json']);
    expect(exitCode).toBe(1);
  });

  it('send rejects invalid amount', async () => {
    const source = Keypair.random();
    await store.saveWallet('s2', source.secret(), {
      publicKey: source.publicKey(),
      network: 'testnet',
      createdAt: new Date().toISOString(),
    });
    await run(['send', 's2', Keypair.random().publicKey(), 'not-a-number', 'XLM', '--json']);
    expect(exitCode).toBe(1);
  });

  it('send rejects invalid asset format', async () => {
    const source = Keypair.random();
    await store.saveWallet('s3', source.secret(), {
      publicKey: source.publicKey(),
      network: 'testnet',
      createdAt: new Date().toISOString(),
    });
    await run(['send', 's3', Keypair.random().publicKey(), '1', 'INVALID', '--json']);
    expect(exitCode).toBe(1);
    expect(stdout.join('')).toContain('Asset must be');
  });

  it('create outputs human-readable success', async () => {
    await run(['create', '--name', 'human-out']);
    expect(stdout.join('')).toContain('created successfully');
  });

  it('import with mainnet stores mainnet network', async () => {
    const pair = Keypair.random();
    await run(['import', '--secret', pair.secret(), '--name', 'main', '--mainnet', '--json']);
    const record = await store.loadWalletRecord('main');
    expect(record?.network).toBe('mainnet');
  });

  it('balance uses mainnet when flag set', async () => {
    const address = Keypair.random().publicKey();
    const loadSpy = jest
      .spyOn(Horizon.Server.prototype, 'loadAccount')
      .mockResolvedValue(
        new Horizon.AccountResponse({
          _links: {},
          id: address,
          paging_token: 'pt',
          account_id: address,
          sequence: '1',
          subentry_count: 0,
          last_modified_ledger: 1,
          last_modified_time: '2020-01-01T00:00:00Z',
          thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 },
          flags: {
            auth_required: false,
            auth_revocable: false,
            auth_immutable: false,
            auth_clawback_enabled: false,
          },
          balances: [{ asset_type: 'native', balance: '1' }],
          signers: [],
          data: async () => ({ value: '' }),
          data_attr: {},
          num_sponsoring: 0,
          num_sponsored: 0,
          effects: jest.fn(),
          offers: jest.fn(),
          operations: jest.fn(),
          payments: jest.fn(),
          trades: jest.fn(),
        } as never)
      );
    await run(['balance', address, '--mainnet', '--json']);
    const parsed = JSON.parse(stdout.join('\n'));
    expect(parsed.network).toBe('mainnet');
    loadSpy.mockRestore();
  });

  it('create requires name in json mode', async () => {
    await run(['create', '--json']);
    expect(exitCode).toBe(1);
  });

  it('import requires name in json mode', async () => {
    await run(['import', '--secret', Keypair.random().secret(), '--json']);
    expect(exitCode).toBe(1);
  });

  it('import outputs human-readable success', async () => {
    const pair = Keypair.random();
    await run(['import', '--secret', pair.secret(), '--name', 'human-import']);
    expect(stdout.join('')).toContain('imported successfully');
  });

  it('balance outputs human-readable balances', async () => {
    const address = Keypair.random().publicKey();
    jest.spyOn(Horizon.Server.prototype, 'loadAccount').mockResolvedValue({
      balances: [{ asset_type: 'native', balance: '5.0000000' }],
    } as never);
    await run(['balance', address]);
    expect(stdout.join('')).toContain('XLM');
  });

  it('send outputs human-readable success', async () => {
    const source = Keypair.random();
    const dest = Keypair.random().publicKey();
    await store.saveWallet('human-send', source.secret(), {
      publicKey: source.publicKey(),
      network: 'testnet',
      createdAt: new Date().toISOString(),
    });
    jest.spyOn(Horizon.Server.prototype, 'loadAccount').mockResolvedValue(
      new Horizon.AccountResponse({
        _links: {},
        id: source.publicKey(),
        paging_token: 'pt',
        account_id: source.publicKey(),
        sequence: '1',
        subentry_count: 0,
        last_modified_ledger: 1,
        last_modified_time: '2020-01-01T00:00:00Z',
        thresholds: { low_threshold: 0, med_threshold: 0, high_threshold: 0 },
        flags: {
          auth_required: false,
          auth_revocable: false,
          auth_immutable: false,
          auth_clawback_enabled: false,
        },
        balances: [],
        signers: [],
        data: async () => ({ value: '' }),
        data_attr: {},
        num_sponsoring: 0,
        num_sponsored: 0,
        effects: jest.fn(),
        offers: jest.fn(),
        operations: jest.fn(),
        payments: jest.fn(),
        trades: jest.fn(),
      } as never)
    );
    jest
      .spyOn(Horizon.Server.prototype, 'submitTransaction')
      .mockResolvedValue({ hash: 'h1' } as never);
    await run(['send', 'human-send', dest, '1', 'XLM']);
    expect(stdout.join('')).toContain('Payment submitted');
  });

  it('import rejects invalid secret without json', async () => {
    await run(['import', '--secret', 'bad', '--name', 'x']);
    expect(exitCode).toBe(1);
    expect(stderr.join('')).toContain('Invalid secret key');
  });

  it('import fails when wallet exists without json', async () => {
    const pair = Keypair.random();
    await store.saveWallet('exists', pair.secret(), {
      publicKey: pair.publicKey(),
      network: 'testnet',
      createdAt: new Date().toISOString(),
    });
    await run(['import', '--secret', Keypair.random().secret(), '--name', 'exists']);
    expect(exitCode).toBe(1);
    expect(stderr.join('')).toContain('already exists');
  });

  it('create handles save errors', async () => {
    jest.spyOn(store, 'saveWallet').mockRejectedValueOnce(new Error('disk full'));
    await run(['create', '--name', 'fail-save']);
    expect(exitCode).toBe(1);
    expect(stderr.join('')).toContain('disk full');
  });

  it('import handles save errors', async () => {
    jest.spyOn(store, 'saveWallet').mockRejectedValueOnce(new Error('write failed'));
    await run(['import', '--secret', Keypair.random().secret(), '--name', 'fail-import']);
    expect(exitCode).toBe(1);
    expect(stderr.join('')).toContain('write failed');
  });

  it('list handles store errors', async () => {
    jest.spyOn(store, 'listWallets').mockRejectedValueOnce(new Error('read failed'));
    await run(['list']);
    expect(exitCode).toBe(1);
    expect(stderr.join('')).toContain('read failed');
  });

  it('list handles store errors with json', async () => {
    jest.spyOn(store, 'listWallets').mockRejectedValueOnce(new Error('read failed'));
    await run(['list', '--json']);
    expect(exitCode).toBe(1);
    expect(stdout.join('')).toContain('read failed');
  });

  it('balance reports errors without json', async () => {
    await run(['balance', 'bad-address']);
    expect(exitCode).toBe(1);
    expect(stderr.join('')).toContain('Invalid Stellar address');
  });

  it('send reports errors without json', async () => {
    await run(['send', 'missing', Keypair.random().publicKey(), '1', 'XLM']);
    expect(exitCode).toBe(1);
    expect(stderr.join('')).toContain('Could not resolve');
  });

  it('import duplicate wallet reports json error', async () => {
    const pair = Keypair.random();
    await store.saveWallet('dup-json', pair.secret(), {
      publicKey: pair.publicKey(),
      network: 'testnet',
      createdAt: new Date().toISOString(),
    });
    await run(['import', '--secret', Keypair.random().secret(), '--name', 'dup-json', '--json']);
    expect(exitCode).toBe(1);
    expect(stdout.join('')).toContain('already exists');
  });

  it('list prints multiple wallets in table format', async () => {
    const p1 = Keypair.random();
    const p2 = Keypair.random();
    await store.saveWallet('multi-a', p1.secret(), {
      publicKey: p1.publicKey(),
      network: 'testnet',
      createdAt: new Date().toISOString(),
    });
    await store.saveWallet('multi-b', p2.secret(), {
      publicKey: p2.publicKey(),
      network: 'mainnet',
      createdAt: new Date().toISOString(),
    });
    await run(['list']);
    expect(stdout.join('')).toContain('multi-a');
    expect(stdout.join('')).toContain('multi-b');
  });

  it('wallet command exposes help for subcommands', () => {
    const cmd = makeCommand();
    const help = cmd.helpInformation();
    expect(help).toBeDefined();
    const createCmd = cmd.commands.find((c) => c.name() === 'create');
    expect(createCmd?.description()).toContain('keypair');
    const importCmd = cmd.commands.find((c) => c.name() === 'import');
    expect(importCmd?.options.map((o) => o.long)).toContain('--secret');
    expect(cmd.commands.map((c) => c.name())).toEqual(
      expect.arrayContaining(['create', 'import', 'list', 'balance', 'send'])
    );
  });
});
