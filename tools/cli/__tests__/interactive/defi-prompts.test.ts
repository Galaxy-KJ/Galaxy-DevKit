/**
 * @fileoverview Tests for DeFi prompt flows
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

jest.mock('../../src/utils/wallet-storage', () => ({
  walletStorage: { walletExists: jest.fn().mockResolvedValue(true) },
}));

import {
  DEFI_FLOWS,
  blendSupplyFlow,
  blendWithdrawFlow,
  blendBorrowFlow,
  blendRepayFlow,
  blendPositionFlow,
  swapQuoteFlow,
  swapExecuteFlow,
  addLiquidityFlow,
  listPoolsFlow,
} from '../../src/commands/interactive/defi-prompts';

describe('DEFI_FLOWS registry', () => {
  it('exports all expected flow IDs', () => {
    expect(Object.keys(DEFI_FLOWS)).toEqual(
      expect.arrayContaining([
        'blend-supply', 'blend-withdraw', 'blend-borrow', 'blend-repay',
        'blend-position', 'swap-quote', 'swap-execute',
        'liquidity-add', 'liquidity-pools',
      ]),
    );
  });

  it('each flow has name, non-empty steps, and execute', () => {
    for (const flow of Object.values(DEFI_FLOWS)) {
      expect(typeof flow.name).toBe('string');
      expect(Array.isArray(flow.steps)).toBe(true);
      expect(flow.steps.length).toBeGreaterThan(0);
      expect(typeof flow.execute).toBe('function');
    }
  });
});

// ─── Blend flows ──────────────────────────────────────────────────────────────

describe('blendSupplyFlow', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation());
  afterEach(() => jest.restoreAllMocks());

  it('execute logs galaxy blend supply command', async () => {
    await blendSupplyFlow.execute({
      wallet: 'main', asset: 'USDC', amount: '100', network: 'testnet', confirm: true,
    });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('galaxy blend supply --wallet main --asset USDC --amount 100 --testnet'),
    );
  });

  it('execute uses customAsset when asset is OTHER', async () => {
    await blendSupplyFlow.execute({
      wallet: 'main', asset: 'OTHER', customAsset: 'yXLM', amount: '50',
      network: 'testnet', confirm: true,
    });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('--asset yXLM'));
  });

  it('execute logs Cancelled when confirm is false', async () => {
    await blendSupplyFlow.execute({ confirm: false });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Cancelled'));
  });

  it('customAsset step is conditional', () => {
    const step = blendSupplyFlow.steps.find((s) => s.id === 'customAsset');
    expect(step?.when?.({ asset: 'XLM' })).toBeFalsy();
    expect(step?.when?.({ asset: 'OTHER' })).toBe(true);
  });
});

describe('blendWithdrawFlow', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation());
  afterEach(() => jest.restoreAllMocks());

  it('execute logs galaxy blend withdraw command', async () => {
    await blendWithdrawFlow.execute({
      wallet: 'w1', asset: 'XLM', amount: '200', network: 'mainnet', confirm: true,
    });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('galaxy blend withdraw --wallet w1 --asset XLM --amount 200 --mainnet'),
    );
  });
});

describe('blendBorrowFlow', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation());
  afterEach(() => jest.restoreAllMocks());

  it('execute logs galaxy blend borrow command', async () => {
    await blendBorrowFlow.execute({
      wallet: 'w1', asset: 'USDC', amount: '500', network: 'testnet', confirm: true,
    });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('galaxy blend borrow --wallet w1 --asset USDC --amount 500'),
    );
  });

  it('confirm step defaults to false (destructive)', () => {
    const confirmStep = blendBorrowFlow.steps.find((s) => s.id === 'confirm');
    expect(confirmStep?.default).toBe(false);
  });
});

describe('blendRepayFlow', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation());
  afterEach(() => jest.restoreAllMocks());

  it('execute logs galaxy blend repay command', async () => {
    await blendRepayFlow.execute({
      wallet: 'w1', asset: 'USDC', amount: '100', network: 'testnet', confirm: true,
    });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('galaxy blend repay --wallet w1 --asset USDC --amount 100'),
    );
  });
});

describe('blendPositionFlow', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation());
  afterEach(() => jest.restoreAllMocks());

  it('execute logs galaxy blend position command', async () => {
    await blendPositionFlow.execute({ wallet: 'w1', network: 'testnet' });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('galaxy blend position --wallet w1 --testnet'),
    );
  });
});

// ─── Swap flows ───────────────────────────────────────────────────────────────

describe('swapQuoteFlow', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation());
  afterEach(() => jest.restoreAllMocks());

  it('execute logs galaxy protocol swap quote', async () => {
    await swapQuoteFlow.execute({
      sellAsset: 'XLM', buyAsset: 'USDC', amount: '100', network: 'testnet',
    });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('galaxy protocol swap quote XLM USDC 100'),
    );
  });

  it('uses custom assets when OTHER is selected', async () => {
    await swapQuoteFlow.execute({
      sellAsset: 'OTHER', customSellAsset: 'AQUA',
      buyAsset: 'OTHER', customBuyAsset: 'yXLM',
      amount: '50', network: 'testnet',
    });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('galaxy protocol swap quote AQUA yXLM 50'),
    );
  });
});

describe('swapExecuteFlow', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation());
  afterEach(() => jest.restoreAllMocks());

  it('execute logs swap execute command', async () => {
    await swapExecuteFlow.execute({
      wallet: 'w1', sellAsset: 'XLM', buyAsset: 'USDC',
      amount: '100', slippage: '0.5', network: 'testnet', confirm: true,
    });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('galaxy protocol swap execute XLM USDC 100 --slippage 0.5'),
    );
  });

  it('execute logs Cancelled when not confirmed', async () => {
    await swapExecuteFlow.execute({ confirm: false });
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Cancelled'));
  });

  it('confirm step defaults to false (has financial impact)', () => {
    const step = swapExecuteFlow.steps.find((s) => s.id === 'confirm');
    expect(step?.default).toBe(false);
  });
});

// ─── Liquidity flows ──────────────────────────────────────────────────────────

describe('addLiquidityFlow', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation());
  afterEach(() => jest.restoreAllMocks());

  it('execute logs protocol liquidity add command', async () => {
    await addLiquidityFlow.execute({
      wallet: 'w1', pool: 'XLM/USDC', amount: '100', network: 'testnet', confirm: true,
    });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('galaxy protocol liquidity add XLM USDC 100'),
    );
  });

  it('pool validation requires / separator', () => {
    const poolStep = addLiquidityFlow.steps.find((s) => s.id === 'pool');
    expect(poolStep?.validate?.('XLM/USDC')).toBe(true);
    expect(poolStep?.validate?.('XLMUSDC')).not.toBe(true);
    expect(poolStep?.validate?.('')).not.toBe(true);
  });
});

describe('listPoolsFlow', () => {
  beforeEach(() => jest.spyOn(console, 'log').mockImplementation());
  afterEach(() => jest.restoreAllMocks());

  it('execute logs protocol liquidity pools without filter', async () => {
    await listPoolsFlow.execute({ filter: '', network: 'testnet' });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('galaxy protocol liquidity pools'),
    );
  });

  it('execute includes --asset when filter is set', async () => {
    await listPoolsFlow.execute({ filter: 'XLM', network: 'testnet' });
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('--asset XLM'),
    );
  });
});
