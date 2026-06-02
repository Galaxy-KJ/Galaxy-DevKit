/**
 * @fileoverview DeFi flow prompts for Galaxy CLI interactive mode
 * @description Step-by-step guided prompt flows for DeFi operations:
 *   Blend supply/withdraw/borrow/repay, Soroswap swap, and liquidity management.
 *   Each flow validates inputs before execution and shows a confirmation summary.
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-06-02
 */

import type { PromptFlow, PromptStep, Answers } from './interactive.ts';
import { walletStorage } from '../../utils/wallet-storage.js';

// ─── Shared validation helpers ────────────────────────────────────────────────

/** Validate a positive numeric amount */
function validateAmount(value: string): boolean | string {
  const num = parseFloat(value);
  if (isNaN(num) || num <= 0) return 'Enter a positive number (e.g. 100 or 10.5)';
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

/** Validate slippage percentage */
function validateSlippage(value: string): boolean | string {
  const num = parseFloat(value);
  if (isNaN(num) || num < 0 || num > 100) {
    return 'Enter a slippage percentage between 0 and 100 (e.g. 0.5)';
  }
  return true;
}

/** Common network selection step */
const networkStep: PromptStep = {
  id: 'network',
  title: 'Network:',
  type: 'select',
  choices: [
    { name: 'Testnet (recommended for development)', value: 'testnet', default: true },
    { name: 'Mainnet (real funds)', value: 'mainnet' },
  ],
};

/** Common wallet selection step */
const walletStep: PromptStep = {
  id: 'wallet',
  title: 'Wallet name:',
  description: 'The wallet to use for this operation',
  type: 'input',
  validate: validateWalletName,
};

/** Common asset selection step */
const assetStep: PromptStep = {
  id: 'asset',
  title: 'Asset:',
  type: 'select',
  choices: [
    { name: 'XLM (native)', value: 'XLM', default: true },
    { name: 'USDC', value: 'USDC' },
    { name: 'AQUA', value: 'AQUA' },
    { name: 'Other (enter manually)', value: 'OTHER' },
  ],
};

/** Step to enter custom asset code when 'OTHER' is selected */
const customAssetStep: PromptStep = {
  id: 'customAsset',
  title: 'Asset code (e.g. yXLM):',
  type: 'input',
  when: (answers) => answers.asset === 'OTHER',
  validate: (value: string) =>
    value && value.trim().length > 0 ? true : 'Asset code is required',
};

// ─── Blend Prompt Flows ───────────────────────────────────────────────────────

/**
 * Prompt flow: Supply assets to Blend Protocol
 */
export const blendSupplyFlow: PromptFlow = {
  name: 'Blend — Supply',
  steps: [
    walletStep,
    assetStep,
    customAssetStep,
    {
      id: 'amount',
      title: 'Amount to supply:',
      type: 'input',
      validate: validateAmount,
    },
    networkStep,
    {
      id: 'confirm',
      title: (answers) => {
        const asset = answers.asset === 'OTHER' ? answers.customAsset : answers.asset;
        return `Supply ${answers.amount} ${asset} to Blend on ${answers.network}?`;
      },
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
    const asset = answers.asset === 'OTHER' ? answers.customAsset : answers.asset;
    const networkFlag = answers.network === 'mainnet' ? ' --mainnet' : ' --testnet';
    console.log(
      chalk.dim(
        `\n  Running: galaxy blend supply --wallet ${answers.wallet} --asset ${asset} --amount ${answers.amount}${networkFlag}\n`,
      ),
    );
  },
};

/**
 * Prompt flow: Withdraw assets from Blend Protocol
 */
export const blendWithdrawFlow: PromptFlow = {
  name: 'Blend — Withdraw',
  steps: [
    walletStep,
    assetStep,
    customAssetStep,
    {
      id: 'amount',
      title: 'Amount to withdraw:',
      type: 'input',
      validate: validateAmount,
    },
    networkStep,
    {
      id: 'confirm',
      title: (answers) => {
        const asset = answers.asset === 'OTHER' ? answers.customAsset : answers.asset;
        return `Withdraw ${answers.amount} ${asset} from Blend on ${answers.network}?`;
      },
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
    const asset = answers.asset === 'OTHER' ? answers.customAsset : answers.asset;
    const networkFlag = answers.network === 'mainnet' ? ' --mainnet' : ' --testnet';
    console.log(
      chalk.dim(
        `\n  Running: galaxy blend withdraw --wallet ${answers.wallet} --asset ${asset} --amount ${answers.amount}${networkFlag}\n`,
      ),
    );
  },
};

/**
 * Prompt flow: Borrow assets from Blend Protocol
 */
export const blendBorrowFlow: PromptFlow = {
  name: 'Blend — Borrow',
  steps: [
    walletStep,
    assetStep,
    customAssetStep,
    {
      id: 'amount',
      title: 'Amount to borrow:',
      type: 'input',
      validate: validateAmount,
    },
    networkStep,
    {
      id: 'confirm',
      title: (answers) => {
        const asset = answers.asset === 'OTHER' ? answers.customAsset : answers.asset;
        return `Borrow ${answers.amount} ${asset} from Blend on ${answers.network}? Ensure you have sufficient collateral.`;
      },
      description: 'Borrowing requires adequate collateral in your Blend position',
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
    const asset = answers.asset === 'OTHER' ? answers.customAsset : answers.asset;
    const networkFlag = answers.network === 'mainnet' ? ' --mainnet' : ' --testnet';
    console.log(
      chalk.dim(
        `\n  Running: galaxy blend borrow --wallet ${answers.wallet} --asset ${asset} --amount ${answers.amount}${networkFlag}\n`,
      ),
    );
  },
};

/**
 * Prompt flow: Repay a Blend Protocol loan
 */
export const blendRepayFlow: PromptFlow = {
  name: 'Blend — Repay',
  steps: [
    walletStep,
    assetStep,
    customAssetStep,
    {
      id: 'amount',
      title: 'Amount to repay:',
      type: 'input',
      validate: validateAmount,
    },
    networkStep,
    {
      id: 'confirm',
      title: (answers) => {
        const asset = answers.asset === 'OTHER' ? answers.customAsset : answers.asset;
        return `Repay ${answers.amount} ${asset} on Blend (${answers.network})?`;
      },
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
    const asset = answers.asset === 'OTHER' ? answers.customAsset : answers.asset;
    const networkFlag = answers.network === 'mainnet' ? ' --mainnet' : ' --testnet';
    console.log(
      chalk.dim(
        `\n  Running: galaxy blend repay --wallet ${answers.wallet} --asset ${asset} --amount ${answers.amount}${networkFlag}\n`,
      ),
    );
  },
};

/**
 * Prompt flow: View Blend position and health factor
 */
export const blendPositionFlow: PromptFlow = {
  name: 'Blend — View Position',
  steps: [
    walletStep,
    networkStep,
  ],
  execute: async (answers: Answers): Promise<void> => {
    const { default: chalk } = await import('chalk');
    const networkFlag = answers.network === 'mainnet' ? ' --mainnet' : ' --testnet';
    console.log(
      chalk.dim(
        `\n  Running: galaxy blend position --wallet ${answers.wallet}${networkFlag}\n`,
      ),
    );
  },
};

// ─── Swap Prompt Flows ────────────────────────────────────────────────────────

/**
 * Prompt flow: Get a swap quote via Soroswap
 */
export const swapQuoteFlow: PromptFlow = {
  name: 'Swap — Get Quote',
  steps: [
    {
      id: 'sellAsset',
      title: 'Asset to sell:',
      type: 'select',
      choices: [
        { name: 'XLM', value: 'XLM', default: true },
        { name: 'USDC', value: 'USDC' },
        { name: 'AQUA', value: 'AQUA' },
        { name: 'Other (enter manually)', value: 'OTHER' },
      ],
    },
    {
      id: 'customSellAsset',
      title: 'Asset to sell (code):',
      type: 'input',
      when: (answers) => answers.sellAsset === 'OTHER',
      validate: (v: string) => (v.trim().length > 0 ? true : 'Asset code is required'),
    },
    {
      id: 'buyAsset',
      title: 'Asset to buy:',
      type: 'select',
      choices: [
        { name: 'USDC', value: 'USDC', default: true },
        { name: 'XLM', value: 'XLM' },
        { name: 'AQUA', value: 'AQUA' },
        { name: 'Other (enter manually)', value: 'OTHER' },
      ],
    },
    {
      id: 'customBuyAsset',
      title: 'Asset to buy (code):',
      type: 'input',
      when: (answers) => answers.buyAsset === 'OTHER',
      validate: (v: string) => (v.trim().length > 0 ? true : 'Asset code is required'),
    },
    {
      id: 'amount',
      title: 'Amount to sell:',
      type: 'input',
      validate: validateAmount,
    },
    networkStep,
  ],
  execute: async (answers: Answers): Promise<void> => {
    const { default: chalk } = await import('chalk');
    const sell = answers.sellAsset === 'OTHER' ? answers.customSellAsset : answers.sellAsset;
    const buy = answers.buyAsset === 'OTHER' ? answers.customBuyAsset : answers.buyAsset;
    console.log(
      chalk.dim(
        `\n  Running: galaxy protocol swap quote ${sell} ${buy} ${answers.amount}\n`,
      ),
    );
  },
};

/**
 * Prompt flow: Execute a swap via Soroswap
 */
export const swapExecuteFlow: PromptFlow = {
  name: 'Swap — Execute',
  steps: [
    walletStep,
    {
      id: 'sellAsset',
      title: 'Asset to sell:',
      type: 'select',
      choices: [
        { name: 'XLM', value: 'XLM', default: true },
        { name: 'USDC', value: 'USDC' },
        { name: 'AQUA', value: 'AQUA' },
        { name: 'Other (enter manually)', value: 'OTHER' },
      ],
    },
    {
      id: 'customSellAsset',
      title: 'Asset to sell (code):',
      type: 'input',
      when: (answers) => answers.sellAsset === 'OTHER',
      validate: (v: string) => (v.trim().length > 0 ? true : 'Asset code is required'),
    },
    {
      id: 'buyAsset',
      title: 'Asset to buy:',
      type: 'select',
      choices: [
        { name: 'USDC', value: 'USDC', default: true },
        { name: 'XLM', value: 'XLM' },
        { name: 'AQUA', value: 'AQUA' },
        { name: 'Other (enter manually)', value: 'OTHER' },
      ],
    },
    {
      id: 'customBuyAsset',
      title: 'Asset to buy (code):',
      type: 'input',
      when: (answers) => answers.buyAsset === 'OTHER',
      validate: (v: string) => (v.trim().length > 0 ? true : 'Asset code is required'),
    },
    {
      id: 'amount',
      title: 'Amount to sell:',
      type: 'input',
      validate: validateAmount,
    },
    {
      id: 'slippage',
      title: 'Max slippage % (e.g. 0.5):',
      type: 'input',
      default: '0.5',
      validate: validateSlippage,
    },
    networkStep,
    {
      id: 'confirm',
      title: (answers) => {
        const sell = answers.sellAsset === 'OTHER' ? answers.customSellAsset : answers.sellAsset;
        const buy = answers.buyAsset === 'OTHER' ? answers.customBuyAsset : answers.buyAsset;
        return `Swap ${answers.amount} ${sell} → ${buy} with max ${answers.slippage}% slippage on ${answers.network}?`;
      },
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
    const sell = answers.sellAsset === 'OTHER' ? answers.customSellAsset : answers.sellAsset;
    const buy = answers.buyAsset === 'OTHER' ? answers.customBuyAsset : answers.buyAsset;
    console.log(
      chalk.dim(
        `\n  Running: galaxy protocol swap execute ${sell} ${buy} ${answers.amount} --slippage ${answers.slippage}\n`,
      ),
    );
  },
};

// ─── Liquidity Prompt Flows ───────────────────────────────────────────────────

/**
 * Prompt flow: Add liquidity to a pool
 */
export const addLiquidityFlow: PromptFlow = {
  name: 'Add Liquidity',
  steps: [
    walletStep,
    {
      id: 'pool',
      title: 'Pool (asset pair, e.g. XLM/USDC):',
      type: 'input',
      validate: (v: string) => {
        if (!v || !v.trim()) return 'Pool identifier is required';
        if (!v.includes('/')) return 'Use format ASSET1/ASSET2 (e.g. XLM/USDC)';
        return true;
      },
    },
    {
      id: 'amount',
      title: 'Amount to deposit:',
      type: 'input',
      validate: validateAmount,
    },
    networkStep,
    {
      id: 'confirm',
      title: (answers) =>
        `Add ${answers.amount} to ${answers.pool} pool on ${answers.network}?`,
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
    const [assetA, assetB] = (answers.pool as string).split('/');
    console.log(
      chalk.dim(
        `\n  Running: galaxy protocol liquidity add ${assetA} ${assetB} ${answers.amount}\n`,
      ),
    );
  },
};

/**
 * Prompt flow: List available liquidity pools
 */
export const listPoolsFlow: PromptFlow = {
  name: 'List Liquidity Pools',
  steps: [
    {
      id: 'filter',
      title: 'Filter by asset (leave blank for all):',
      type: 'input',
      optional: true,
      default: '',
    },
    networkStep,
  ],
  execute: async (answers: Answers): Promise<void> => {
    const { default: chalk } = await import('chalk');
    const filterArg = answers.filter ? ` --asset ${answers.filter}` : '';
    console.log(
      chalk.dim(
        `\n  Running: galaxy protocol liquidity pools${filterArg}\n`,
      ),
    );
  },
};

// ─── Exported registry ────────────────────────────────────────────────────────

/** All DeFi prompt flows, keyed by identifier */
export const DEFI_FLOWS: Record<string, PromptFlow> = {
  'blend-supply': blendSupplyFlow,
  'blend-withdraw': blendWithdrawFlow,
  'blend-borrow': blendBorrowFlow,
  'blend-repay': blendRepayFlow,
  'blend-position': blendPositionFlow,
  'swap-quote': swapQuoteFlow,
  'swap-execute': swapExecuteFlow,
  'liquidity-add': addLiquidityFlow,
  'liquidity-pools': listPoolsFlow,
};
