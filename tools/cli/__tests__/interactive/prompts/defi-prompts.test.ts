/**
 * Tests for DeFi PromptFlow definitions.
 *
 * Verifies:
 *   - registry contains every expected flow
 *   - validators behave as advertised (asset codes, amounts, slippage)
 *   - buildArgs matches the actual Commander subcommand signature
 *     (positional args first, then flags, and `-y` to avoid double-prompts)
 *   - destructive flows are flagged for the runner's confirmation gate
 */

import {
  DEFI_PROMPTS,
  blendSupplyFlow,
  blendBorrowFlow,
  swapFlow,
  listPoolsFlow,
} from '../../../src/commands/interactive/prompts/defi-prompts';

function findStep(flow: typeof swapFlow, name: string) {
  const step = flow.steps.find((s) => s.name === name);
  if (!step) throw new Error(`Step ${name} not found in ${flow.id}`);
  return step;
}

describe('DEFI_PROMPTS registry', () => {
  it('exposes all expected flows', () => {
    expect(DEFI_PROMPTS['defi:blend-supply']).toBe(blendSupplyFlow);
    expect(DEFI_PROMPTS['defi:blend-borrow']).toBe(blendBorrowFlow);
    expect(DEFI_PROMPTS['defi:swap']).toBe(swapFlow);
    expect(DEFI_PROMPTS['defi:pools']).toBe(listPoolsFlow);
  });

  it('all transaction-emitting flows are marked destructive', () => {
    expect(blendSupplyFlow.destructive).toBe(true);
    expect(blendBorrowFlow.destructive).toBe(true);
    expect(swapFlow.destructive).toBe(true);
    // pools list is read-only — must not be destructive
    expect(listPoolsFlow.destructive).toBeFalsy();
  });
});

describe('blendSupplyFlow', () => {
  it('rejects bad asset codes', () => {
    const asset = findStep(blendSupplyFlow, 'asset');
    expect(asset.validate?.('TOO LONG NAME WITH SPACES')).toMatch(/1-12 char/);
    expect(asset.validate?.('USDC')).toBe(true);
    expect(asset.validate?.('XLM')).toBe(true);
  });

  it('rejects non-positive amounts', () => {
    const amount = findStep(blendSupplyFlow, 'amount');
    expect(amount.validate?.('0')).toBe('Amount must be a positive decimal');
    expect(amount.validate?.('100.5')).toBe(true);
  });

  it('emits positional args + --network + -y', () => {
    const args = blendSupplyFlow.buildArgs({
      asset: 'USDC',
      amount: '100',
      wallet: '',
      network: 'testnet',
    });
    expect(args).toEqual([
      'defi', 'blend', 'supply', 'USDC', '100', '--network', 'testnet', '-y',
    ]);
  });

  it('passes --wallet through when set', () => {
    const args = blendSupplyFlow.buildArgs({
      asset: 'USDC',
      amount: '100',
      wallet: 'alice',
      network: 'mainnet',
    });
    expect(args).toEqual([
      'defi', 'blend', 'supply', 'USDC', '100',
      '--wallet', 'alice', '--network', 'mainnet', '-y',
    ]);
  });
});

describe('blendBorrowFlow', () => {
  it('emits borrow as subcommand', () => {
    const args = blendBorrowFlow.buildArgs({
      asset: 'XLM',
      amount: '50',
      wallet: '',
      network: 'testnet',
    });
    expect(args.slice(0, 5)).toEqual(['defi', 'blend', 'borrow', 'XLM', '50']);
  });
});

describe('swapFlow', () => {
  it('validates slippage range', () => {
    const slippage = findStep(swapFlow, 'slippage');
    expect(slippage.validate?.('-1')).toBe('Slippage must be a non-negative decimal');
    expect(slippage.validate?.('150')).toBe('Slippage must be between 0 and 100');
    expect(slippage.validate?.('0.5')).toBe(true);
    expect(slippage.validate?.('100')).toBe(true);
  });

  it('emits --slippage and --network with -y for executing swaps', () => {
    const args = swapFlow.buildArgs({
      fromAsset: 'XLM',
      toAsset: 'USDC',
      amount: '10',
      slippage: '1',
      wallet: '',
      network: 'testnet',
      quoteOnly: false,
    });
    expect(args).toEqual([
      'defi', 'swap', 'XLM', 'USDC', '10',
      '--slippage', '1', '--network', 'testnet', '-y',
    ]);
  });

  it('emits --quote-only and drops -y when quoteOnly is true', () => {
    const args = swapFlow.buildArgs({
      fromAsset: 'XLM',
      toAsset: 'USDC',
      amount: '10',
      slippage: '1',
      wallet: '',
      network: 'testnet',
      quoteOnly: true,
    });
    expect(args).toContain('--quote-only');
    expect(args).not.toContain('-y');
  });
});

describe('listPoolsFlow', () => {
  it('emits `defi pools list --network …`', () => {
    expect(listPoolsFlow.buildArgs({ network: 'testnet', json: false })).toEqual([
      'defi', 'pools', 'list', '--network', 'testnet',
    ]);
  });

  it('appends --json when requested', () => {
    expect(listPoolsFlow.buildArgs({ network: 'mainnet', json: true })).toEqual([
      'defi', 'pools', 'list', '--network', 'mainnet', '--json',
    ]);
  });
});
