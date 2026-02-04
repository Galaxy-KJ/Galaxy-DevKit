/**
 * @fileoverview Blend Protocol commands
 * @description CLI commands for Blend lending/borrowing operations
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-01-30
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import {
  getProtocolInstance,
  selectWallet,
  confirmTransaction,
  validateAmount,
  TransactionPreview,
} from '../../utils/protocol-registry.js';
import {
  outputTransactionPreview,
  outputTransactionResult,
  outputPosition,
  outputError,
  outputCancelled,
} from '../../utils/protocol-formatter.js';
import { PROTOCOL_IDS, Asset, TransactionResult } from '@galaxy-kj/core-defi-protocols';

interface BlendCommandOptions {
  wallet?: string;
  network: string;
  json?: boolean;
  yes?: boolean;
}

/**
 * Resolve asset code to Asset object
 */
function resolveAsset(assetCode: string): Asset {
  const code = assetCode.toUpperCase();

  if (code === 'XLM') {
    return {
      code: 'XLM',
      type: 'native',
    };
  }

  // For non-native assets, we'd need issuer information
  // This is a simplified implementation
  return {
    code: code,
    type: code.length <= 4 ? 'credit_alphanum4' : 'credit_alphanum12',
    // Issuer would be set based on known assets on testnet/mainnet
  };
}

/**
 * Execute a Blend operation (supply, withdraw, borrow, repay)
 */
async function executeBlendOperation(
  operation: 'supply' | 'withdraw' | 'borrow' | 'repay',
  asset: string,
  amount: string,
  options: BlendCommandOptions
): Promise<void> {
  const spinner = options.json ? null : ora(`Preparing ${operation}...`).start();

  try {
    // Validate inputs
    validateAmount(amount, 'Amount');

    // Validate network
    if (!['testnet', 'mainnet'].includes(options.network)) {
      throw new Error('Network must be either "testnet" or "mainnet"');
    }
    const network = options.network as 'testnet' | 'mainnet';

    // Select wallet
    spinner?.stop();
    const wallet = await selectWallet({
      wallet: options.wallet,
      network: network,
      json: options.json,
    });
    spinner?.start(`Preparing ${operation}...`);

    // Get protocol instance
    const protocol = await getProtocolInstance(PROTOCOL_IDS.BLEND, network);
    await protocol.initialize();

    // Resolve asset
    const assetObj = resolveAsset(asset);

    // Build transaction preview
    const preview: TransactionPreview = {
      operation: operation.toUpperCase(),
      protocol: 'Blend Protocol',
      network: network,
      asset: asset.toUpperCase(),
      amount: amount,
      estimatedFee: '100', // Estimate in stroops
      walletAddress: wallet.publicKey,
    };

    // Show preview and confirm
    spinner?.stop();
    outputTransactionPreview(preview, { json: options.json });

    const confirmed = await confirmTransaction(preview, {
      yes: options.yes,
      json: options.json,
    });

    if (!confirmed) {
      outputCancelled({ json: options.json });
      return;
    }

    // Execute operation
    spinner?.start(`Executing ${operation}...`);

    let result: TransactionResult;
    switch (operation) {
      case 'supply':
        result = await protocol.supply(wallet.publicKey, wallet.secretKey, assetObj, amount);
        break;
      case 'withdraw':
        result = await protocol.withdraw(wallet.publicKey, wallet.secretKey, assetObj, amount);
        break;
      case 'borrow':
        result = await protocol.borrow(wallet.publicKey, wallet.secretKey, assetObj, amount);
        break;
      case 'repay':
        result = await protocol.repay(wallet.publicKey, wallet.secretKey, assetObj, amount);
        break;
    }

    spinner?.stop();
    outputTransactionResult(result, { json: options.json, network });
  } catch (error) {
    spinner?.fail(`${operation} failed`);
    outputError(error, { json: options.json });
    process.exit(1);
  }
}

// Create main blend command
export const blendCommand = new Command('blend')
  .description('Interact with Blend Protocol (lending/borrowing)');

// Supply subcommand
const supplyCommand = new Command('supply')
  .description('Supply assets to Blend Protocol')
  .argument('<asset>', 'Asset code (e.g., USDC, XLM)')
  .argument('<amount>', 'Amount to supply')
  .option('-w, --wallet <name>', 'Wallet name to use')
  .option('--network <network>', 'Network (testnet/mainnet)', 'testnet')
  .option('--json', 'Output as JSON')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (asset: string, amount: string, options: BlendCommandOptions) => {
    await executeBlendOperation('supply', asset, amount, options);
  });

// Withdraw subcommand
const withdrawCommand = new Command('withdraw')
  .description('Withdraw assets from Blend Protocol')
  .argument('<asset>', 'Asset code (e.g., USDC, XLM)')
  .argument('<amount>', 'Amount to withdraw')
  .option('-w, --wallet <name>', 'Wallet name to use')
  .option('--network <network>', 'Network (testnet/mainnet)', 'testnet')
  .option('--json', 'Output as JSON')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (asset: string, amount: string, options: BlendCommandOptions) => {
    await executeBlendOperation('withdraw', asset, amount, options);
  });

// Borrow subcommand
const borrowCommand = new Command('borrow')
  .description('Borrow assets from Blend Protocol')
  .argument('<asset>', 'Asset code (e.g., USDC, XLM)')
  .argument('<amount>', 'Amount to borrow')
  .option('-w, --wallet <name>', 'Wallet name to use')
  .option('--network <network>', 'Network (testnet/mainnet)', 'testnet')
  .option('--json', 'Output as JSON')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (asset: string, amount: string, options: BlendCommandOptions) => {
    await executeBlendOperation('borrow', asset, amount, options);
  });

// Repay subcommand
const repayCommand = new Command('repay')
  .description('Repay borrowed assets')
  .argument('<asset>', 'Asset code (e.g., USDC, XLM)')
  .argument('<amount>', 'Amount to repay')
  .option('-w, --wallet <name>', 'Wallet name to use')
  .option('--network <network>', 'Network (testnet/mainnet)', 'testnet')
  .option('--json', 'Output as JSON')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (asset: string, amount: string, options: BlendCommandOptions) => {
    await executeBlendOperation('repay', asset, amount, options);
  });

// Position subcommand (read-only)
const positionCommand = new Command('position')
  .description('View current lending position')
  .option('-w, --wallet <name>', 'Wallet name to use')
  .option('--network <network>', 'Network (testnet/mainnet)', 'testnet')
  .option('--json', 'Output as JSON')
  .action(async (options: Omit<BlendCommandOptions, 'yes'>) => {
    const spinner = options.json ? null : ora('Loading position...').start();

    try {
      // Validate network
      if (!['testnet', 'mainnet'].includes(options.network)) {
        throw new Error('Network must be either "testnet" or "mainnet"');
      }
      const network = options.network as 'testnet' | 'mainnet';

      // Select wallet
      spinner?.stop();
      const wallet = await selectWallet({
        wallet: options.wallet,
        network: network,
        json: options.json,
      });
      spinner?.start('Loading position...');

      // Get protocol and position
      const protocol = await getProtocolInstance(PROTOCOL_IDS.BLEND, network);
      await protocol.initialize();

      const position = await protocol.getPosition(wallet.publicKey);

      spinner?.stop();
      outputPosition(position, { json: options.json });
    } catch (error) {
      spinner?.fail('Failed to load position');
      outputError(error, { json: options.json });
      process.exit(1);
    }
  });

// Register subcommands
blendCommand.addCommand(supplyCommand);
blendCommand.addCommand(withdrawCommand);
blendCommand.addCommand(borrowCommand);
blendCommand.addCommand(repayCommand);
blendCommand.addCommand(positionCommand);
