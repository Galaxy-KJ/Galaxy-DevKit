/**
 * @fileoverview Guided wallet prompt flows.
 * @description PromptFlow definitions for wallet management operations.
 *   Each flow collects parameters with real-time validation and forwards
 *   a structured argv array to the existing `galaxy wallet …` commands.
 * @since 2026-06-28
 */

import type { PromptFlow, SummaryLine } from './index.js';

const STELLAR_PUBLIC_KEY = /^G[A-Z2-7]{55}$/;
const WALLET_NAME = /^[A-Za-z0-9_-]+$/;
const POSITIVE_DECIMAL = /^\d+(\.\d+)?$/;
const ASSET_FORMAT = /^(XLM|[A-Za-z0-9]{1,12}:G[A-Z2-7]{55})$/;

function validateWalletName(value: unknown): true | string {
  const v = String(value ?? '').trim();
  if (!v) return 'Wallet name is required';
  if (!WALLET_NAME.test(v)) return 'Only letters, numbers, dashes and underscores';
  return true;
}

function validatePublicKey(value: unknown): true | string {
  const v = String(value ?? '').trim();
  if (!v) return 'Address is required';
  if (!STELLAR_PUBLIC_KEY.test(v)) return 'Invalid Stellar public key (56 chars, starts with G)';
  return true;
}

function validateAmount(value: unknown): true | string {
  const v = String(value ?? '').trim();
  if (!POSITIVE_DECIMAL.test(v) || Number(v) <= 0) return 'Amount must be a positive decimal';
  return true;
}

function validateAsset(value: unknown): true | string {
  const v = String(value ?? '').trim();
  if (!ASSET_FORMAT.test(v)) return "Use 'XLM' or 'CODE:ISSUER'";
  return true;
}

function validatePassword(value: unknown): true | string {
  const v = String(value ?? '');
  if (v.length < 8) return 'Password must be at least 8 characters';
  return true;
}

function validateMemo(value: unknown): true | string {
  const v = String(value ?? '');
  if (Buffer.byteLength(v, 'utf8') > 28) return 'Memo must be 28 bytes or fewer (UTF-8)';
  return true;
}

function networkFlag(network: unknown): string[] {
  return network === 'mainnet' ? ['--mainnet'] : ['--testnet'];
}

function pushFlag(out: string[], flag: string, value: unknown): void {
  if (value === undefined || value === null) return;
  const str = String(value).trim();
  if (!str) return;
  out.push(flag, str);
}

export const createWalletFlow: PromptFlow = {
  id: 'wallet:create',
  title: '🔑 Create Wallet',
  description: 'Generate a new keypair and store it locally',
  steps: [
    {
      name: 'name',
      message: 'Wallet name:',
      type: 'input',
      default: 'default',
      validate: validateWalletName,
    },
    {
      name: 'network',
      message: 'Network:',
      type: 'list',
      choices: [
        { name: 'Testnet', value: 'testnet', default: true },
        { name: 'Mainnet', value: 'mainnet' },
      ],
      default: 'testnet',
    },
    {
      name: 'encrypt',
      message: 'Encrypt the secret key with a password?',
      type: 'confirm',
      default: true,
    },
    {
      name: 'password',
      message: 'Password (min 8 chars):',
      type: 'password',
      when: (a) => a.encrypt === true,
      validate: validatePassword,
    },
  ],
  buildArgs: (a) => {
    const args = ['wallet', 'create', '--name', String(a.name), ...networkFlag(a.network)];
    if (a.encrypt) {
      args.push('--encrypt');
      pushFlag(args, '--password', a.password);
    }
    return args;
  },
  summarize: (a): SummaryLine[] => [
    { label: 'Name', value: String(a.name) },
    { label: 'Network', value: String(a.network) },
    { label: 'Encrypted', value: a.encrypt ? 'yes' : 'no' },
  ],
};

export const importWalletFlow: PromptFlow = {
  id: 'wallet:import',
  title: '📥 Import Wallet',
  description: 'Import an existing wallet from its secret key',
  steps: [
    {
      name: 'name',
      message: 'Wallet name:',
      type: 'input',
      default: 'imported-wallet',
      validate: validateWalletName,
    },
    {
      name: 'secretKey',
      message: 'Secret key (S…):',
      type: 'password',
      validate: (v) => (String(v ?? '').trim() ? true : 'Secret key is required'),
    },
    {
      name: 'network',
      message: 'Network:',
      type: 'list',
      choices: [
        { name: 'Testnet', value: 'testnet', default: true },
        { name: 'Mainnet', value: 'mainnet' },
      ],
      default: 'testnet',
    },
    {
      name: 'encrypt',
      message: 'Encrypt at rest with a password?',
      type: 'confirm',
      default: true,
    },
    {
      name: 'password',
      message: 'Password (min 8 chars):',
      type: 'password',
      when: (a) => a.encrypt === true,
      validate: validatePassword,
    },
  ],
  buildArgs: (a) => {
    const args = [
      'wallet',
      'import',
      String(a.secretKey),
      '--name',
      String(a.name),
      ...networkFlag(a.network),
    ];
    if (a.encrypt) {
      args.push('--encrypt');
      pushFlag(args, '--password', a.password);
    }
    return args;
  },
  summarize: (a): SummaryLine[] => [
    { label: 'Name', value: String(a.name) },
    { label: 'Network', value: String(a.network) },
    { label: 'Encrypted', value: a.encrypt ? 'yes' : 'no' },
    { label: 'Secret', value: '••• (hidden)' },
  ],
};

export const listWalletsFlow: PromptFlow = {
  id: 'wallet:list',
  title: '📒 List Wallets',
  description: 'Show all wallets stored locally',
  steps: [],
  buildArgs: () => ['wallet', 'list'],
};

export const walletInfoFlow: PromptFlow = {
  id: 'wallet:info',
  title: 'ℹ️  Wallet Info',
  description: 'Show details of a stored wallet or any Stellar address',
  steps: [
    {
      name: 'target',
      message: 'Wallet name or public key:',
      type: 'input',
      validate: (v) => (String(v ?? '').trim() ? true : 'Target is required'),
    },
  ],
  buildArgs: (a) => ['wallet', 'info', String(a.target)],
  summarize: (a) => [{ label: 'Target', value: String(a.target) }],
};

export const balanceWalletFlow: PromptFlow = {
  id: 'wallet:balance',
  title: '💰 Wallet Balance',
  description: 'Show XLM and asset balances for an address',
  steps: [
    {
      name: 'mode',
      message: 'How do you want to look it up?',
      type: 'list',
      choices: [
        { name: 'By stored wallet name', value: 'name', default: true },
        { name: 'By public address', value: 'address' },
      ],
      default: 'name',
    },
    {
      name: 'wallet',
      message: 'Wallet name:',
      type: 'input',
      when: (a) => a.mode === 'name',
      validate: validateWalletName,
    },
    {
      name: 'address',
      message: 'Stellar public key (G…):',
      type: 'input',
      when: (a) => a.mode === 'address',
      validate: validatePublicKey,
    },
    {
      name: 'network',
      message: 'Network:',
      type: 'list',
      choices: [
        { name: 'Testnet', value: 'testnet', default: true },
        { name: 'Mainnet', value: 'mainnet' },
      ],
      default: 'testnet',
    },
  ],
  buildArgs: (a) => {
    const args = ['wallet', 'balance'];
    if (a.mode === 'address') args.push(String(a.address));
    if (a.mode === 'name') args.push('--name', String(a.wallet));
    args.push('--network', String(a.network));
    return args;
  },
  summarize: (a) => {
    const lines: SummaryLine[] = [{ label: 'Network', value: String(a.network) }];
    if (a.mode === 'name') lines.unshift({ label: 'Wallet', value: String(a.wallet) });
    else lines.unshift({ label: 'Address', value: String(a.address) });
    return lines;
  },
};

export const fundWalletFlow: PromptFlow = {
  id: 'wallet:fund',
  title: '🚰 Fund Wallet (testnet)',
  description: 'Request XLM from the Stellar friendbot for a testnet wallet',
  steps: [
    {
      name: 'name',
      message: 'Wallet name to fund:',
      type: 'input',
      validate: validateWalletName,
    },
    {
      name: 'amount',
      message: 'Amount (XLM):',
      type: 'input',
      default: '10000',
      validate: validateAmount,
    },
  ],
  buildArgs: (a) => ['wallet', 'fund', '--name', String(a.name), '--amount', String(a.amount)],
  summarize: (a) => [
    { label: 'Wallet', value: String(a.name) },
    { label: 'Amount', value: `${a.amount} XLM` },
  ],
};

export const sendPaymentFlow: PromptFlow = {
  id: 'wallet:send',
  title: '💸 Send Payment',
  description: 'Transfer XLM or an issued asset from a stored wallet',
  destructive: true,
  steps: [
    {
      name: 'from',
      message: 'Source wallet (stored locally):',
      type: 'input',
      validate: validateWalletName,
    },
    {
      name: 'to',
      message: 'Destination public key (G…):',
      type: 'input',
      validate: validatePublicKey,
    },
    {
      name: 'asset',
      message: "Asset ('XLM' or 'CODE:ISSUER'):",
      type: 'input',
      default: 'XLM',
      validate: validateAsset,
    },
    {
      name: 'amount',
      message: 'Amount:',
      type: 'input',
      validate: validateAmount,
    },
    {
      name: 'memo',
      message: 'Memo (optional, max 28 bytes):',
      type: 'input',
      default: '',
      validate: validateMemo,
    },
    {
      name: 'network',
      message: 'Network override (leave on wallet default if unsure):',
      type: 'list',
      choices: [
        { name: 'Use wallet default', value: '', default: true },
        { name: 'Testnet', value: 'testnet' },
        { name: 'Mainnet', value: 'mainnet' },
      ],
      default: '',
    },
  ],
  buildArgs: (a) => {
    const args = [
      'wallet',
      'send',
      String(a.from),
      String(a.to),
      String(a.amount),
      String(a.asset),
    ];
    pushFlag(args, '--memo', a.memo);
    pushFlag(args, '--network', a.network);
    return args;
  },
  summarize: (a) => [
    { label: 'From', value: String(a.from) },
    { label: 'To', value: String(a.to) },
    { label: 'Amount', value: `${a.amount} ${a.asset}` },
    { label: 'Memo', value: String(a.memo || '—') },
    { label: 'Network', value: String(a.network || 'wallet default') },
  ],
};

export const WALLET_PROMPTS: Record<string, PromptFlow> = {
  [createWalletFlow.id]: createWalletFlow,
  [importWalletFlow.id]: importWalletFlow,
  [listWalletsFlow.id]: listWalletsFlow,
  [walletInfoFlow.id]: walletInfoFlow,
  [balanceWalletFlow.id]: balanceWalletFlow,
  [fundWalletFlow.id]: fundWalletFlow,
  [sendPaymentFlow.id]: sendPaymentFlow,
};
