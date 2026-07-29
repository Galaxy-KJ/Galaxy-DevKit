/**
 * @fileoverview Guided Oracle prompt flows.
 * @description PromptFlow definitions for oracle price queries and management.
 * @since 2026-07-29
 */

import type { PromptFlow, SummaryLine } from './index.js';

const SYMBOL_FORMAT = /^[A-Za-z0-9]+\/[A-Za-z0-9]+$/;

function validateSymbol(value: unknown): true | string {
  const v = String(value ?? '').trim();
  if (!v) return 'Asset symbol is required';
  if (!SYMBOL_FORMAT.test(v)) return "Use format like 'XLM/USD' or 'BTC/USD'";
  return true;
}

export const oraclePriceFlow: PromptFlow = {
  id: 'oracle:price',
  title: '🔮 Oracle — Get Asset Price',
  description: 'Query the current aggregated price for an asset from multiple oracle sources',
  steps: [
    {
      name: 'symbol',
      message: 'Asset symbol (e.g. XLM/USD, BTC/USD):',
      type: 'input',
      default: 'XLM/USD',
      validate: validateSymbol,
    },
    {
      name: 'strategy',
      message: 'Aggregation strategy:',
      type: 'list',
      choices: [
        { name: 'Median (default)', value: 'median', default: true },
        { name: 'Mean', value: 'mean' },
        { name: 'TWAP (Time-weighted avg)', value: 'twap' },
        { name: 'Weighted average', value: 'weighted' },
      ],
      default: 'median',
    },
    {
      name: 'network',
      message: 'Oracle network:',
      type: 'list',
      choices: [
        { name: 'Testnet', value: 'testnet', default: true },
        { name: 'Mainnet', value: 'mainnet' },
      ],
      default: 'testnet',
    },
    {
      name: 'watch',
      message: 'Watch for real-time price updates?',
      type: 'confirm',
      default: false,
    },
  ],
  buildArgs: (a) => {
    const args = ['oracle', 'price', String(a.symbol), '--strategy', String(a.strategy), '--network', String(a.network)];
    if (a.watch) args.push('--watch');
    return args;
  },
  summarize: (a): SummaryLine[] => [
    { label: 'Symbol', value: String(a.symbol) },
    { label: 'Strategy', value: String(a.strategy) },
    { label: 'Network', value: String(a.network) },
    { label: 'Watch', value: a.watch ? 'yes' : 'no' },
  ],
};

export const ORACLE_PROMPTS: Record<string, PromptFlow> = {
  [oraclePriceFlow.id]: oraclePriceFlow,
};
