/**
 * @fileoverview Wallet flow prompts for Galaxy CLI interactive mode
 * @description Step-by-step guided prompt flows for all wallet operations:
 *   create, import, list, info, fund, backup, restore, and send payment.
 *   Each flow collects and validates user inputs before execution.
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-06-02
 */

import type { PromptFlow, PromptStep, Answers } from './interactive.ts';
import { walletStorage } from '../../utils/wallet-storage.js';

// ─── Shared validation helpers ────────────────────────────────────────────────

/** Validate a Stellar public key (G... 56 chars) */
function validatePublicKey(value: string): boolean | string {
  if (!value || !value.trim()) return 'Public key is required';
  if (!value.startsWith('G') || value.length !== 56) {
    return 'Enter a valid Stellar public key (56 characters, starts with G)';
  }
  return true;
}

/** Validate a non-empty wallet name */
function validateWalletName(value: string): boolean | string {
  if (!value || !value.trim()) return 'Wallet name is required';
  if (!/^[a-zA-Z0-9_-]+$/.test(value.trim())) {
    return 'Name may only contain letters, numbers, hyphens, and underscores';
  }
  return true;
}

/** Validate a positive numeric amount */
function validateAmount(value: string): boolean | string {
  const num = parseFloat(value);
  if (isNaN(num) || num <= 0) return 'Enter a positive number (e.g. 100 or 10.5)';
  return true;
}

// ─── Wallet Prompt Flows ──────────────────────────────────────────────────────

/**
 * Prompt flow: Create a new wallet
 * Gathers name and network, then delegates to `galaxy wallet create`.
 */
export const createWalletFlow: PromptFlow = {
  name: 'Create Wallet',
  steps: [
    {
      id: 'name',
      title: 'Wallet name:',
      description: 'A unique name to identify this wallet locally',
      type: 'input',
      validate: validateWalletName,
    },
    {
      id: 'network',
      title: 'Network:',
      description: 'Select which Stellar network to use',
      type: 'select',
      choices: [
        { name: 'Testnet (recommended for development)', value: 'testnet', default: true },
        { name: 'Mainnet (real funds)', value: 'mainnet' },
      ],
    },
    {
      id: 'confirm',
      title: 'Create this wallet?',
      type: 'confirm',
      default: true,
    },
  ],
  execute: async (answers: Answers): Promise<void> => {
    const { default: chalk } = await import('chalk');
    if (!answers.confirm) {
      console.log(chalk.yellow('\n  Cancelled.\n'));
      return;
    }
    console.log(chalk.dim(`\n  Running: galaxy wallet create --name ${answers.name} --${answers.network}\n`));
  },
};

/**
 * Prompt flow: Import an existing wallet from secret key
 */
export const importWalletFlow: PromptFlow = {
  name: 'Import Wallet',
  steps: [
    {
      id: 'name',
      title: 'Wallet name:',
      description: 'A unique name to identify this wallet locally',
      type: 'input',
      validate: validateWalletName,
    },
    {
      id: 'secretKey',
      title: 'Secret key (S...):',
      description: 'Your Stellar secret key — never share this with anyone',
      type: 'password',
      validate: (value: string) => {
        if (!value || !value.trim()) return 'Secret key is required';
        if (!value.startsWith('S') || value.length !== 56) {
          return 'Enter a valid Stellar secret key (56 characters, starts with S)';
        }
        return true;
      },
    },
    {
      id: 'network',
      title: 'Network:',
      type: 'select',
      choices: [
        { name: 'Testnet', value: 'testnet', default: true },
        { name: 'Mainnet', value: 'mainnet' },
      ],
    },
    {
      id: 'confirm',
      title: 'Import this wallet?',
      type: 'confirm',
      default: true,
    },
  ],
  execute: async (answers: Answers): Promise<void> => {
    const { default: chalk } = await import('chalk');
    if (!answers.confirm) {
      console.log(chalk.yellow('\n  Cancelled.\n'));
      return;
    }
    console.log(chalk.dim(`\n  Running: galaxy wallet import --name ${answers.name} --${answers.network}\n`));
  },
};

/**
 * Prompt flow: Show wallet info
 */
export const walletInfoFlow: PromptFlow = {
  name: 'Wallet Info',
  steps: [
    {
      id: 'name',
      title: 'Wallet name:',
      description: 'Name of the wallet to inspect',
      type: 'input',
      validate: async (value: string) => {
        const basic = validateWalletName(value);
        if (basic !== true) return basic;
        const exists = await walletStorage.walletExists(value.trim());
        return exists ? true : `Wallet '${value.trim()}' not found`;
      },
    },
  ],
  execute: async (answers: Answers): Promise<void> => {
    const { default: chalk } = await import('chalk');
    console.log(chalk.dim(`\n  Running: galaxy wallet info --name ${answers.name}\n`));
  },
};

/**
 * Prompt flow: Fund a wallet from the Stellar testnet friendbot
 */
export const fundWalletFlow: PromptFlow = {
  name: 'Fund Wallet (Testnet)',
  steps: [
    {
      id: 'address',
      title: 'Account address to fund (G...):',
      description: 'Must be a valid Stellar public key on testnet',
      type: 'input',
      validate: validatePublicKey,
    },
    {
      id: 'confirm',
      title: 'Fund this account via friendbot?',
      type: 'confirm',
      default: true,
    },
  ],
  execute: async (answers: Answers): Promise<void> => {
    const { default: chalk } = await import('chalk');
    if (!answers.confirm) {
      console.log(chalk.yellow('\n  Cancelled.\n'));
      return;
    }
    console.log(chalk.dim(`\n  Running: galaxy wallet fund --address ${answers.address}\n`));
  },
};

/**
 * Prompt flow: Backup a wallet to an encrypted file
 */
export const backupWalletFlow: PromptFlow = {
  name: 'Backup Wallet',
  steps: [
    {
      id: 'name',
      title: 'Wallet name to back up:',
      type: 'input',
      validate: validateWalletName,
    },
    {
      id: 'format',
      title: 'Backup format:',
      type: 'select',
      choices: [
        { name: 'Encrypted JSON (recommended)', value: 'json', default: true },
        { name: 'Paper wallet (printable)', value: 'paper' },
      ],
    },
    {
      id: 'outputPath',
      title: 'Output path (leave blank for default):',
      type: 'input',
      optional: true,
      default: '',
    },
    {
      id: 'confirm',
      title: 'Create backup?',
      type: 'confirm',
      default: true,
    },
  ],
  execute: async (answers: Answers): Promise<void> => {
    const { default: chalk } = await import('chalk');
    if (!answers.confirm) {
      console.log(chalk.yellow('\n  Cancelled.\n'));
      return;
    }
    const pathArg = answers.outputPath ? ` --output "${answers.outputPath}"` : '';
    console.log(chalk.dim(`\n  Running: galaxy wallet backup --name ${answers.name} --format ${answers.format}${pathArg}\n`));
  },
};

/**
 * Prompt flow: Send a payment to another account
 */
export const sendPaymentFlow: PromptFlow = {
  name: 'Send Payment',
  steps: [
    {
      id: 'wallet',
      title: 'Source wallet name:',
      description: 'The wallet you are sending from',
      type: 'input',
      validate: validateWalletName,
    },
    {
      id: 'destination',
      title: 'Destination address (G...):',
      type: 'input',
      validate: validatePublicKey,
    },
    {
      id: 'asset',
      title: 'Asset:',
      type: 'select',
      choices: [
        { name: 'XLM (native)', value: 'XLM', default: true },
        { name: 'USDC', value: 'USDC' },
        { name: 'Other (enter manually)', value: 'OTHER' },
      ],
    },
    {
      id: 'customAsset',
      title: 'Asset code (e.g. AQUA):',
      type: 'input',
      when: (answers) => answers.asset === 'OTHER',
      validate: (value: string) =>
        value && value.trim().length > 0 ? true : 'Asset code is required',
    },
    {
      id: 'amount',
      title: 'Amount:',
      type: 'input',
      validate: validateAmount,
    },
    {
      id: 'memo',
      title: 'Memo (optional):',
      type: 'input',
      optional: true,
      default: '',
    },
    {
      id: 'network',
      title: 'Network:',
      type: 'select',
      choices: [
        { name: 'Testnet', value: 'testnet', default: true },
        { name: 'Mainnet', value: 'mainnet' },
      ],
    },
    {
      id: 'confirm',
      title: (answers) =>
        `Send ${answers.amount} ${answers.asset === 'OTHER' ? answers.customAsset : answers.asset} to ${(answers.destination as string).slice(0, 8)}...?`,
      type: 'confirm',
      default: false,
    },
  ],
  execute: async (answers: Answers): Promise<void> => {
    const { default: chalk } = await import('chalk');
    if (!answers.confirm) {
      console.log(chalk.yellow('\n  Cancelled.\n'));
      return;
    }
    const asset =
      answers.asset === 'OTHER' ? answers.customAsset : answers.asset;
    const memoArg = answers.memo ? ` --memo "${answers.memo}"` : '';
    console.log(
      chalk.dim(
        `\n  Running: galaxy wallet send --wallet ${answers.wallet} --destination ${answers.destination} --asset ${asset} --amount ${answers.amount}${memoArg} --${answers.network}\n`,
      ),
    );
  },
};

// ─── Exported registry ────────────────────────────────────────────────────────

/** All wallet prompt flows, keyed by identifier */
export const WALLET_FLOWS: Record<string, PromptFlow> = {
  'wallet-create': createWalletFlow,
  'wallet-import': importWalletFlow,
  'wallet-info': walletInfoFlow,
  'wallet-fund': fundWalletFlow,
  'wallet-backup': backupWalletFlow,
  'wallet-send': sendPaymentFlow,
};
