/**
 * @fileoverview Tests for wallet prompt flows
 */

jest.mock('inquirer', () => ({
  prompt: jest.fn(),
  Separator: class Separator {},
}));

jest.mock('ora', () => () => ({
  start: jest.fn().mockReturnThis(),
  stop: jest.fn().mockReturnThis(),
  succeed: jest.fn().mockReturnThis(),
  fail: jest.fn().mockReturnThis(),
  text: '',
}));

jest.mock('chalk', () => {
  const id = (s: string) => s;
  const p: any = new Proxy(id, { get: () => p });
  return { default: p, __esModule: true };
});

// Stub walletStorage so async validators can resolve
jest.mock('../../src/utils/wallet-storage', () => ({
  walletStorage: {
    walletExists: jest.fn().mockResolvedValue(true),
    listWallets: jest.fn().mockResolvedValue([]),
  },
}));

import {
  WALLET_FLOWS,
  createWalletFlow,
  importWalletFlow,
  walletInfoFlow,
  fundWalletFlow,
  backupWalletFlow,
  sendPaymentFlow,
} from '../../src/commands/interactive/wallet-prompts';

describe('WALLET_FLOWS registry', () => {
  it('exports all expected flow IDs', () => {
    expect(Object.keys(WALLET_FLOWS)).toEqual(
      expect.arrayContaining([
        'wallet-create',
        'wallet-import',
        'wallet-info',
        'wallet-fund',
        'wallet-backup',
        'wallet-send',
      ]),
    );
  });

  it('each flow has a name, steps array, and execute function', () => {
    for (const [id, flow] of Object.entries(WALLET_FLOWS)) {
      expect(typeof flow.name).toBe('string');
      expect(Array.isArray(flow.steps)).toBe(true);
      expect(flow.steps.length).toBeGreaterThan(0);
      expect(typeof flow.execute).toBe('function');
    }
  });
});

// ─── createWalletFlow ─────────────────────────────────────────────────────────

describe('createWalletFlow', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation());
  afterEach(() => jest.restoreAllMocks());

  it('execute logs the galaxy wallet create command when confirmed', async () => {
    await createWalletFlow.execute({ name: 'dev', network: 'testnet', confirm: true });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('galaxy wallet create --name dev --testnet'),
    );
  });

  it('execute logs cancelled when confirm is false', async () => {
    await createWalletFlow.execute({ name: 'dev', network: 'testnet', confirm: false });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Cancelled'));
  });

  it('has a name validation step', () => {
    const nameStep = createWalletFlow.steps.find((s) => s.id === 'name');
    expect(nameStep).toBeDefined();
    expect(nameStep?.validate?.('valid-name')).toBe(true);
    expect(nameStep?.validate?.('')).not.toBe(true);
    expect(nameStep?.validate?.('bad name!')).not.toBe(true);
  });
});

// ─── importWalletFlow ─────────────────────────────────────────────────────────

describe('importWalletFlow', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation());
  afterEach(() => jest.restoreAllMocks());

  it('execute logs galaxy wallet import command', async () => {
    await importWalletFlow.execute({ name: 'imported', network: 'mainnet', confirm: true });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('galaxy wallet import --name imported --mainnet'),
    );
  });

  it('validates secret key starts with S and is 56 chars', () => {
    const secretStep = importWalletFlow.steps.find((s) => s.id === 'secretKey');
    expect(secretStep?.validate?.('S' + 'A'.repeat(55))).toBe(true);
    expect(secretStep?.validate?.('GABC')).not.toBe(true);
    expect(secretStep?.validate?.('')).not.toBe(true);
  });
});

// ─── fundWalletFlow ───────────────────────────────────────────────────────────

describe('fundWalletFlow', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation());
  afterEach(() => jest.restoreAllMocks());

  it('execute logs friendbot fund command', async () => {
    const address = 'G' + 'A'.repeat(55);
    await fundWalletFlow.execute({ address, confirm: true });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining(`galaxy wallet fund --address ${address}`),
    );
  });

  it('execute logs cancelled when confirm false', async () => {
    await fundWalletFlow.execute({ address: 'G' + 'A'.repeat(55), confirm: false });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Cancelled'));
  });

  it('validates public key format', () => {
    const addressStep = fundWalletFlow.steps.find((s) => s.id === 'address');
    expect(addressStep?.validate?.('G' + 'A'.repeat(55))).toBe(true);
    expect(addressStep?.validate?.('XBAD')).not.toBe(true);
    expect(addressStep?.validate?.('')).not.toBe(true);
  });
});

// ─── backupWalletFlow ─────────────────────────────────────────────────────────

describe('backupWalletFlow', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation());
  afterEach(() => jest.restoreAllMocks());

  it('execute logs backup command with default path', async () => {
    await backupWalletFlow.execute({ name: 'main', format: 'json', outputPath: '', confirm: true });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('galaxy wallet backup --name main --format json'),
    );
  });

  it('execute includes --output when outputPath is set', async () => {
    await backupWalletFlow.execute({ name: 'main', format: 'json', outputPath: '/tmp/backup.json', confirm: true });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('--output "/tmp/backup.json"'),
    );
  });
});

// ─── sendPaymentFlow ──────────────────────────────────────────────────────────

describe('sendPaymentFlow', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation());
  afterEach(() => jest.restoreAllMocks());

  it('execute logs payment command with standard asset', async () => {
    const dest = 'G' + 'B'.repeat(55);
    await sendPaymentFlow.execute({
      wallet: 'main', destination: dest, asset: 'XLM',
      amount: '10', memo: '', network: 'testnet', confirm: true,
    });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('--asset XLM --amount 10'),
    );
  });

  it('execute uses customAsset when asset is OTHER', async () => {
    const dest = 'G' + 'B'.repeat(55);
    await sendPaymentFlow.execute({
      wallet: 'main', destination: dest, asset: 'OTHER', customAsset: 'AQUA',
      amount: '5', memo: '', network: 'testnet', confirm: true,
    });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('--asset AQUA'),
    );
  });

  it('execute logs Cancelled when confirm is false', async () => {
    await sendPaymentFlow.execute({ confirm: false });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Cancelled'));
  });

  it('customAsset step is conditional on asset === OTHER', () => {
    const customStep = sendPaymentFlow.steps.find((s) => s.id === 'customAsset');
    expect(customStep?.when?.({ asset: 'XLM' })).toBeFalsy();
    expect(customStep?.when?.({ asset: 'OTHER' })).toBe(true);
  });
});
