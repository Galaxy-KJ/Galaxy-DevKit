/**
 * @fileoverview Guided Protocol prompt flows.
 * @description PromptFlow definitions for protocol operations (supply, swap, liquidity).
 * @since 2026-07-29
 */

import type { PromptFlow, SummaryLine } from './index.js';

const ASSET_CODE = /^[A-Za-z0-9]{1,12}$/;
const POSITIVE_DECIMAL = /^\d+(\.\d+)?$/;

function validateAssetCode(value: unknown): true | string {
  const v = String(value ?? '').trim();
  if (!v) return 'Asset code is required';
  if (!ASSET_CODE.test(v)) return 'Use a 1-12 char alphanumeric code (e.g. USDC, XLM)';
  return true;
}

function validateAmount(value: unknown): true | string {
  const v = String(value ?? '').trim();
  if (!POSITIVE_DECIMAL.test(v) || Number(v) <= 0) return 'Amount must be a positive decimal';
  return true;
}

function networkFlag(network: unknown): string[] {
  return network === 'mainnet' ? ['--network', 'mainnet'] : ['--network', 'testnet'];
}

const networkChoices = [
  { name: 'Testnet', value: 'testnet', default: true },
  { name: 'Mainnet', value: 'mainnet' },
];

export const protocolSupplyFlow: PromptFlow = {
  id: 'protocol:supply',
  title: '📈 Protocol — Supply',
  description: 'Supply assets to a DeFi lending protocol (defaults to Blend)',
  destructive: true,
  steps: [
    {
      name: 'asset',
      message: 'Asset code to supply (e.g. USDC, XLM):',
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
      name: 'protocol',
      message: 'Lending protocol:',
      type: 'list',
      choices: [
        { name: 'Blend (default)', value: 'blend', default: true },
      ],
      default: 'blend',
    },
    {
      name: 'wallet',
      message: 'Wallet name (optional):',
      type: 'input',
      default: '',
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
    const args = [
      'protocol',
      'supply',
      String(a.asset),
      String(a.amount),
      ...networkFlag(a.network),
      '-y',
    ];
    if (a.protocol && a.protocol !== 'blend') {
      args.push('--protocol', String(a.protocol));
    }
    if (a.wallet) {
      args.push('--wallet', String(a.wallet));
    }
    return args;
  },
  summarize: (a): SummaryLine[] => [
    { label: 'Operation', value: 'supply' },
    { label: 'Asset', value: String(a.asset) },
    { label: 'Amount', value: String(a.amount) },
    { label: 'Protocol', value: String(a.protocol) },
    { label: 'Wallet', value: String(a.wallet || '—') },
    { label: 'Network', value: String(a.network) },
  ],
};

export const protocolSwapFlow: PromptFlow = {
  id: 'protocol:swap',
  title: '🔄 Protocol — Swap',
  description: 'Execute a token swap via Soroswap DEX',
  destructive: true,
  steps: [
    {
      name: 'fromAsset',
      message: 'Token to sell (e.g. XLM):',
      type: 'input',
      default: 'XLM',
      validate: validateAssetCode,
    },
    {
      name: 'toAsset',
      message: 'Token to buy (e.g. USDC):',
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
      validate: (v) => {
        const n = Number(v);
        if (isNaN(n) || n < 0 || n > 100) return 'Slippage must be between 0 and 100';
        return true;
      },
    },
    {
      name: 'wallet',
      message: 'Wallet name (optional):',
      type: 'input',
      default: '',
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
    const args = [
      'protocol',
      'swap',
      'execute',
      String(a.fromAsset),
      String(a.toAsset),
      String(a.amount),
      '--slippage',
      String(a.slippage),
      ...networkFlag(a.network),
      '-y',
    ];
    if (a.wallet) {
      args.push('--wallet', String(a.wallet));
    }
    return args;
  },
  summarize: (a): SummaryLine[] => [
    { label: 'From', value: String(a.fromAsset) },
    { label: 'To', value: String(a.toAsset) },
    { label: 'Amount', value: String(a.amount) },
    { label: 'Slippage', value: `${a.slippage}%` },
    { label: 'Wallet', value: String(a.wallet || '—') },
    { label: 'Network', value: String(a.network) },
  ],
};

export const protocolLiquidityFlow: PromptFlow = {
  id: 'protocol:liquidity',
  title: '🌊 Protocol — Add Liquidity',
  description: 'Add liquidity to a Soroswap pool',
  destructive: true,
  steps: [
    {
      name: 'tokenA',
      message: 'First token (e.g. XLM):',
      type: 'input',
      default: 'XLM',
      validate: validateAssetCode,
    },
    {
      name: 'tokenB',
      message: 'Second token (e.g. USDC):',
      type: 'input',
      default: 'USDC',
      validate: validateAssetCode,
    },
    {
      name: 'amountA',
      message: 'Amount of first token:',
      type: 'input',
      validate: validateAmount,
    },
    {
      name: 'amountB',
      message: 'Amount of second token:',
      type: 'input',
      validate: validateAmount,
    },
    {
      name: 'wallet',
      message: 'Wallet name (optional):',
      type: 'input',
      default: '',
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
    const args = [
      'protocol',
      'liquidity',
      'add',
      String(a.tokenA),
      String(a.tokenB),
      String(a.amountA),
      String(a.amountB),
      ...networkFlag(a.network),
      '-y',
    ];
    if (a.wallet) {
      args.push('--wallet', String(a.wallet));
    }
    return args;
  },
  summarize: (a): SummaryLine[] => [
    { label: 'Token A', value: String(a.tokenA) },
    { label: 'Token B', value: String(a.tokenB) },
    { label: 'Amount A', value: String(a.amountA) },
    { label: 'Amount B', value: String(a.amountB) },
    { label: 'Wallet', value: String(a.wallet || '—') },
    { label: 'Network', value: String(a.network) },
  ],
};

export const PROTOCOL_PROMPTS: Record<string, PromptFlow> = {
  [protocolSupplyFlow.id]: protocolSupplyFlow,
  [protocolSwapFlow.id]: protocolSwapFlow,
  [protocolLiquidityFlow.id]: protocolLiquidityFlow,
};
