/**
 * Tests for wallet PromptFlow definitions.
 *
 * Verifies:
 *   - registry contains every expected flow
 *   - validators reject invalid input and accept good input
 *   - conditional `when` only triggers password prompts when --encrypt is on
 *   - buildArgs emits commands matching the actual Commander signature
 *   - destructive flows (send) are flagged so the runner shows confirm gate
 */

import {
  WALLET_PROMPTS,
  createWalletFlow,
  importWalletFlow,
  listWalletsFlow,
  walletInfoFlow,
  balanceWalletFlow,
  fundWalletFlow,
  sendPaymentFlow,
} from '../../../src/commands/interactive/prompts/wallet-prompts';

function findStep(flow: typeof createWalletFlow, name: string) {
  const step = flow.steps.find((s) => s.name === name);
  if (!step) throw new Error(`Step ${name} not found in ${flow.id}`);
  return step;
}

describe('WALLET_PROMPTS registry', () => {
  it('exposes all expected flows', () => {
    expect(WALLET_PROMPTS['wallet:create']).toBe(createWalletFlow);
    expect(WALLET_PROMPTS['wallet:import']).toBe(importWalletFlow);
    expect(WALLET_PROMPTS['wallet:list']).toBe(listWalletsFlow);
    expect(WALLET_PROMPTS['wallet:info']).toBe(walletInfoFlow);
    expect(WALLET_PROMPTS['wallet:balance']).toBe(balanceWalletFlow);
    expect(WALLET_PROMPTS['wallet:fund']).toBe(fundWalletFlow);
    expect(WALLET_PROMPTS['wallet:send']).toBe(sendPaymentFlow);
  });

  it('every flow has a unique id, title, description and buildArgs', () => {
    const ids = new Set<string>();
    for (const flow of Object.values(WALLET_PROMPTS)) {
      expect(flow.id).toBeTruthy();
      expect(ids.has(flow.id)).toBe(false);
      ids.add(flow.id);
      expect(flow.title).toBeTruthy();
      expect(flow.description).toBeTruthy();
      expect(typeof flow.buildArgs).toBe('function');
    }
  });
});

describe('createWalletFlow', () => {
  it('rejects invalid wallet names', () => {
    const step = findStep(createWalletFlow, 'name');
    expect(step.validate?.('')).toBe('Wallet name is required');
    expect(step.validate?.('bad name!')).toBe('Only letters, numbers, dashes and underscores');
    expect(step.validate?.('good-name_1')).toBe(true);
  });

  it('rejects passwords shorter than 8 chars', () => {
    const step = findStep(createWalletFlow, 'password');
    expect(step.validate?.('short')).toBe('Password must be at least 8 characters');
    expect(step.validate?.('longenough')).toBe(true);
  });

  it('only prompts for password when encrypt is true', () => {
    const step = findStep(createWalletFlow, 'password');
    expect(step.when?.({ encrypt: true })).toBe(true);
    expect(step.when?.({ encrypt: false })).toBe(false);
  });

  it('buildArgs emits --encrypt + --password when encrypting on testnet', () => {
    const args = createWalletFlow.buildArgs({
      name: 'dev',
      network: 'testnet',
      encrypt: true,
      password: 'supersecret',
    });
    expect(args).toEqual([
      'wallet', 'create', '--name', 'dev', '--testnet', '--encrypt', '--password', 'supersecret',
    ]);
  });

  it('buildArgs emits --mainnet and omits --encrypt when disabled', () => {
    const args = createWalletFlow.buildArgs({
      name: 'prod',
      network: 'mainnet',
      encrypt: false,
    });
    expect(args).toEqual(['wallet', 'create', '--name', 'prod', '--mainnet']);
  });
});

describe('importWalletFlow', () => {
  it('passes the secret key as the first positional argument', () => {
    const args = importWalletFlow.buildArgs({
      name: 'imported',
      secretKey: 'SABCDEF',
      network: 'testnet',
      encrypt: false,
    });
    expect(args[0]).toBe('wallet');
    expect(args[1]).toBe('import');
    expect(args[2]).toBe('SABCDEF');
    expect(args).toContain('--name');
    expect(args).toContain('imported');
  });

  it('summary hides the secret key', () => {
    const summary = importWalletFlow.summarize!({
      name: 'imported',
      secretKey: 'SABCDEF',
      network: 'testnet',
      encrypt: true,
    });
    const secretLine = summary.find((l) => l.label === 'Secret');
    expect(secretLine?.value).not.toContain('SABCDEF');
    expect(secretLine?.value).toMatch(/hidden/);
  });
});

describe('listWalletsFlow', () => {
  it('has no steps and emits `wallet list`', () => {
    expect(listWalletsFlow.steps).toEqual([]);
    expect(listWalletsFlow.buildArgs({})).toEqual(['wallet', 'list']);
  });
});

describe('walletInfoFlow', () => {
  it('emits the target as a positional argument', () => {
    expect(walletInfoFlow.buildArgs({ target: 'alice' })).toEqual(['wallet', 'info', 'alice']);
  });
});

describe('balanceWalletFlow', () => {
  it('uses --name when mode is "name"', () => {
    const args = balanceWalletFlow.buildArgs({
      mode: 'name',
      wallet: 'alice',
      network: 'testnet',
    });
    expect(args).toEqual(['wallet', 'balance', '--name', 'alice', '--network', 'testnet']);
  });

  it('uses positional address when mode is "address"', () => {
    const addr = 'G' + 'A'.repeat(55);
    const args = balanceWalletFlow.buildArgs({
      mode: 'address',
      address: addr,
      network: 'mainnet',
    });
    expect(args).toEqual(['wallet', 'balance', addr, '--network', 'mainnet']);
  });

  it('wallet step only fires for "name" mode', () => {
    const walletStep = findStep(balanceWalletFlow, 'wallet');
    expect(walletStep.when?.({ mode: 'name' })).toBe(true);
    expect(walletStep.when?.({ mode: 'address' })).toBe(false);
  });

  it('address step only fires for "address" mode', () => {
    const addressStep = findStep(balanceWalletFlow, 'address');
    expect(addressStep.when?.({ mode: 'address' })).toBe(true);
    expect(addressStep.when?.({ mode: 'name' })).toBe(false);
  });

  it('rejects malformed public keys', () => {
    const addressStep = findStep(balanceWalletFlow, 'address');
    expect(addressStep.validate?.('not-a-key')).toMatch(/Invalid Stellar public key/);
    expect(addressStep.validate?.('G' + 'A'.repeat(55))).toBe(true);
  });
});

describe('fundWalletFlow', () => {
  it('rejects non-positive amounts', () => {
    const amount = findStep(fundWalletFlow, 'amount');
    expect(amount.validate?.('0')).toBe('Amount must be a positive decimal');
    expect(amount.validate?.('-5')).toBe('Amount must be a positive decimal');
    expect(amount.validate?.('abc')).toBe('Amount must be a positive decimal');
    expect(amount.validate?.('10.5')).toBe(true);
  });

  it('builds the fund command with --name and --amount', () => {
    expect(fundWalletFlow.buildArgs({ name: 'dev', amount: '1000' })).toEqual([
      'wallet', 'fund', '--name', 'dev', '--amount', '1000',
    ]);
  });
});

describe('sendPaymentFlow', () => {
  it('is marked destructive (runner will require confirmation)', () => {
    expect(sendPaymentFlow.destructive).toBe(true);
  });

  it('emits positional args in the exact order the send command expects', () => {
    const addr = 'G' + 'A'.repeat(55);
    const args = sendPaymentFlow.buildArgs({
      from: 'alice',
      to: addr,
      amount: '5',
      asset: 'XLM',
      memo: '',
      network: '',
    });
    expect(args).toEqual(['wallet', 'send', 'alice', addr, '5', 'XLM']);
  });

  it('appends --memo and --network when provided', () => {
    const addr = 'G' + 'A'.repeat(55);
    const args = sendPaymentFlow.buildArgs({
      from: 'alice',
      to: addr,
      amount: '5',
      asset: 'XLM',
      memo: 'gift',
      network: 'mainnet',
    });
    expect(args).toEqual([
      'wallet', 'send', 'alice', addr, '5', 'XLM', '--memo', 'gift', '--network', 'mainnet',
    ]);
  });

  it('validates the destination public key', () => {
    const to = findStep(sendPaymentFlow, 'to');
    expect(to.validate?.('not-a-key')).toMatch(/Invalid Stellar public key/);
    expect(to.validate?.('G' + 'A'.repeat(55))).toBe(true);
  });

  it('validates asset format ("XLM" or "CODE:ISSUER")', () => {
    const asset = findStep(sendPaymentFlow, 'asset');
    expect(asset.validate?.('XLM')).toBe(true);
    expect(asset.validate?.(`USDC:G${'A'.repeat(55)}`)).toBe(true);
    expect(asset.validate?.('USDC')).toBe("Use 'XLM' or 'CODE:ISSUER'");
    expect(asset.validate?.('bad asset')).toBe("Use 'XLM' or 'CODE:ISSUER'");
  });

  it('rejects memos longer than 28 UTF-8 bytes', () => {
    const memo = findStep(sendPaymentFlow, 'memo');
    expect(memo.validate?.('a'.repeat(29))).toBe('Memo must be 28 bytes or fewer (UTF-8)');
    expect(memo.validate?.('hello')).toBe(true);
  });
});
