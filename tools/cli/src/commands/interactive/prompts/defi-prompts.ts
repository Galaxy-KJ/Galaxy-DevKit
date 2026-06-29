/**
 * @fileoverview Guided DeFi prompt flows.
 * @description PromptFlow definitions for DeFi operations on top of the
 *   existing `galaxy defi …` commands (Blend, Soroswap).
 *   Transaction-emitting flows are marked destructive so the runner shows
 *   an explicit confirmation gate before signing — and we forward `-y`
 *   downstream so the underlying command doesn't re-prompt the user.
 * @since 2026-06-28
 */

import type { PromptFlow, SummaryLine } from './index.js';

const ASSET_CODE = /^[A-Za-z0-9]{1,12}$/;
const POSITIVE_DECIMAL = /^\d+(\.\d+)?$/;
const NON_NEGATIVE_DECIMAL = /^\d+(\.\d+)?$/;
const WALLET_NAME = /^[A-Za-z0-9_-]+$/;

function validateAssetCode(value: unknown): true | string {
  const v = String(value ?? '').trim();
  if (!ASSET_CODE.test(v)) return 'Use a 1-12 char alphanumeric code (e.g. XLM, USDC)';
  return true;
}

function validateAmount(value: unknown): true | string {
  const v = String(value ?? '').trim();
  if (!POSITIVE_DECIMAL.test(v) || Number(v) <= 0) return 'Amount must be a positive decimal';
  return true;
}

function validateSlippage(value: unknown): true | string {
  const v = String(value ?? '').trim();
  if (!NON_NEGATIVE_DECIMAL.test(v)) return 'Slippage must be a non-negative decimal';
  const n = Number(v);
  if (n < 0 || n > 100) return 'Slippage must be between 0 and 100';
  return true;
}

function validateOptionalWallet(value: unknown): true | string {
  const v = String(value ?? '').trim();
  if (!v) return true;
  if (!WALLET_NAME.test(v)) return 'Only letters, numbers, dashes and underscores';
  return true;
}

function pushFlag(out: string[], flag: string, value: unknown): void {
  if (value === undefined || value === null) return;
  const str = String(value).trim();
  if (!str) return;
  out.push(flag, str);
}

const networkChoices = [
  { name: 'Testnet', value: 'testnet', default: true },
  { name: 'Mainnet', value: 'mainnet' },
];

export const blendSupplyFlow: PromptFlow = {
  id: 'defi:blend-supply',
  title: '🟢 Blend — Supply',
  description: 'Supply assets to Blend Protocol',
  destructive: true,
  steps: [
    {
      name: 'asset',
      message: 'Asset code (e.g. USDC, XLM):',
      type: 'input',
      default: 'USDC',
      validate: validateAssetCode,
    },
    {
      name: 'amount',
      message: 'Amount to supply:',
      type: 'input',
      validate: validateAmount,
    },
    {
      name: 'wallet',
      message: 'Wallet name (leave blank to be prompted by command):',
      type: 'input',
      default: '',
      validate: validateOptionalWallet,
    },
    {
      name: 'network',
      message: 'Network:',
      type: 'list',
      choices: networkChoices,
      default: 'testnet',
    },
  ],
  buildArgs: (a) => {
    const args = ['defi', 'blend', 'supply', String(a.asset), String(a.amount)];
    pushFlag(args, '--wallet', a.wallet);
    args.push('--network', String(a.network), '-y');
    return args;
  },
  summarize: (a): SummaryLine[] => [
    { label: 'Operation', value: 'supply' },
    { label: 'Asset', value: String(a.asset) },
    { label: 'Amount', value: String(a.amount) },
    { label: 'Wallet', value: String(a.wallet || 'prompt') },
    { label: 'Network', value: String(a.network) },
  ],
};

export const blendBorrowFlow: PromptFlow = {
  id: 'defi:blend-borrow',
  title: '🟡 Blend — Borrow',
  description: 'Borrow assets from Blend Protocol',
  destructive: true,
  steps: [
    {
      name: 'asset',
      message: 'Asset code (e.g. USDC, XLM):',
      type: 'input',
      validate: validateAssetCode,
    },
    {
      name: 'amount',
      message: 'Amount to borrow:',
      type: 'input',
      validate: validateAmount,
    },
    {
      name: 'wallet',
      message: 'Wallet name (leave blank to be prompted by command):',
      type: 'input',
      default: '',
      validate: validateOptionalWallet,
    },
    {
      name: 'network',
      message: 'Network:',
      type: 'list',
      choices: networkChoices,
      default: 'testnet',
    },
  ],
  buildArgs: (a) => {
    const args = ['defi', 'blend', 'borrow', String(a.asset), String(a.amount)];
    pushFlag(args, '--wallet', a.wallet);
    args.push('--network', String(a.network), '-y');
    return args;
  },
  summarize: (a): SummaryLine[] => [
    { label: 'Operation', value: 'borrow' },
    { label: 'Asset', value: String(a.asset) },
    { label: 'Amount', value: String(a.amount) },
    { label: 'Wallet', value: String(a.wallet || 'prompt') },
    { label: 'Network', value: String(a.network) },
  ],
};

export const swapFlow: PromptFlow = {
  id: 'defi:swap',
  title: '🔄 Swap (Soroswap)',
  description: 'Swap tokens via the Soroswap DEX',
  destructive: true,
  steps: [
    {
      name: 'fromAsset',
      message: 'Asset to sell (e.g. XLM):',
      type: 'input',
      default: 'XLM',
      validate: validateAssetCode,
    },
    {
      name: 'toAsset',
      message: 'Asset to buy (e.g. USDC):',
      type: 'input',
      default: 'USDC',
      validate: validateAssetCode,
    },
    {
      name: 'amount',
      message: 'Amount to swap:',
      type: 'input',
      validate: validateAmount,
    },
    {
      name: 'slippage',
      message: 'Max slippage (%):',
      type: 'input',
      default: '1',
      validate: validateSlippage,
    },
    {
      name: 'wallet',
      message: 'Wallet name (leave blank to be prompted by command):',
      type: 'input',
      default: '',
      validate: validateOptionalWallet,
    },
    {
      name: 'network',
      message: 'Network:',
      type: 'list',
      choices: networkChoices,
      default: 'testnet',
    },
    {
      name: 'quoteOnly',
      message: 'Only fetch quote, do not execute swap?',
      type: 'confirm',
      default: false,
    },
  ],
  buildArgs: (a) => {
    const args = [
      'defi',
      'swap',
      String(a.fromAsset),
      String(a.toAsset),
      String(a.amount),
      '--slippage',
      String(a.slippage),
    ];
    pushFlag(args, '--wallet', a.wallet);
    args.push('--network', String(a.network));
    if (a.quoteOnly) args.push('--quote-only');
    else args.push('-y');
    return args;
  },
  summarize: (a): SummaryLine[] => [
    { label: 'From', value: String(a.fromAsset) },
    { label: 'To', value: String(a.toAsset) },
    { label: 'Amount', value: String(a.amount) },
    { label: 'Slippage', value: `${a.slippage}%` },
    { label: 'Wallet', value: String(a.wallet || 'prompt') },
    { label: 'Network', value: String(a.network) },
    { label: 'Mode', value: a.quoteOnly ? 'quote only' : 'execute' },
  ],
};

export const listPoolsFlow: PromptFlow = {
  id: 'defi:pools',
  title: '🌊 Liquidity Pools',
  description: 'List Soroswap liquidity pools with TVL and APY',
  steps: [
    {
      name: 'network',
      message: 'Network:',
      type: 'list',
      choices: networkChoices,
      default: 'testnet',
    },
    {
      name: 'json',
      message: 'Output as JSON?',
      type: 'confirm',
      default: false,
    },
  ],
  buildArgs: (a) => {
    const args = ['defi', 'pools', 'list', '--network', String(a.network)];
    if (a.json) args.push('--json');
    return args;
  },
  summarize: (a) => [
    { label: 'Network', value: String(a.network) },
    { label: 'Format', value: a.json ? 'json' : 'table' },
  ],
};

export const DEFI_PROMPTS: Record<string, PromptFlow> = {
  [blendSupplyFlow.id]: blendSupplyFlow,
  [blendBorrowFlow.id]: blendBorrowFlow,
  [swapFlow.id]: swapFlow,
  [listPoolsFlow.id]: listPoolsFlow,
};
