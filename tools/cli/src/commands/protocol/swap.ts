/**
 * @fileoverview Swap commands
 * @description CLI commands for DEX swap operations
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
  validateSlippage,
  TransactionPreview,
} from '../../utils/protocol-registry.js';
import {
  outputTransactionPreview,
  outputTransactionResult,
  outputSwapQuote,
  outputError,
  outputCancelled,
} from '../../utils/protocol-formatter.js';
import { PROTOCOL_IDS, Asset, DEFAULT_SLIPPAGE } from '@galaxy-kj/core-defi-protocols';

interface SwapCommandOptions {
  wallet?: string;
  network: string;
  json?: boolean;
  yes?: boolean;
  slippage?: string;
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

  return {
    code: code,
    type: code.length <= 4 ? 'credit_alphanum4' : 'credit_alphanum12',
  };
}

// Create main swap command
export const swapCommand = new Command('swap')
  .description('Token swap operations on Soroswap');

// Quote subcommand (read-only)
const quoteCommand = new Command('quote')
  .description('Get swap quote without executing')
  .argument('<from>', 'Input token (e.g., XLM)')
  .argument('<to>', 'Output token (e.g., USDC)')
  .argument('<amount>', 'Amount of input token')
  .option('--network <network>', 'Network (testnet/mainnet)', 'testnet')
  .option('--json', 'Output as JSON')
  .action(
    async (
      from: string,
      to: string,
      amount: string,
      options: { network: string; json?: boolean }
    ) => {
      const spinner = options.json ? null : ora('Getting swap quote...').start();

      try {
        // Validate inputs
        validateAmount(amount, 'Amount');

        if (!['testnet', 'mainnet'].includes(options.network)) {
          throw new Error('Network must be either "testnet" or "mainnet"');
        }
        const network = options.network as 'testnet' | 'mainnet';

        // Resolve assets
        const tokenIn = resolveAsset(from);
        const tokenOut = resolveAsset(to);

        // Get protocol and quote
        const protocol = await getProtocolInstance(PROTOCOL_IDS.SOROSWAP, network);
        await protocol.initialize();

        // Check if swap method exists
        if (!protocol.getSwapQuote) {
          throw new Error('Swap quotes are not supported by this protocol');
        }

        const quote = await protocol.getSwapQuote(tokenIn, tokenOut, amount);

        spinner?.stop();
        outputSwapQuote(quote, { json: options.json });
      } catch (error) {
        spinner?.fail('Failed to get swap quote');
        outputError(error, { json: options.json });
        process.exit(1);
      }
    }
  );

// Execute subcommand
const executeCommand = new Command('execute')
  .description('Execute a token swap')
  .argument('<from>', 'Input token (e.g., XLM)')
  .argument('<to>', 'Output token (e.g., USDC)')
  .argument('<amount>', 'Amount of input token')
  .option('--slippage <percent>', 'Slippage tolerance percentage (default: 1)', '1')
  .option('-w, --wallet <name>', 'Wallet name to use')
  .option('--network <network>', 'Network (testnet/mainnet)', 'testnet')
  .option('--json', 'Output as JSON')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(
    async (
      from: string,
      to: string,
      amount: string,
      options: SwapCommandOptions
    ) => {
      const spinner = options.json ? null : ora('Preparing swap...').start();

      try {
        // Validate inputs
        validateAmount(amount, 'Amount');
        const slippageDecimal = validateSlippage(options.slippage || '1');

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
        spinner?.start('Preparing swap...');

        // Resolve assets
        const tokenIn = resolveAsset(from);
        const tokenOut = resolveAsset(to);

        // Get protocol
        const protocol = await getProtocolInstance(PROTOCOL_IDS.SOROSWAP, network);
        await protocol.initialize();

        // Check if swap method exists
        if (!protocol.swap || !protocol.getSwapQuote) {
          throw new Error('Swap operations are not supported by this protocol');
        }

        // Get quote first
        if (spinner) spinner.text = 'Getting swap quote...';
        const quote = await protocol.getSwapQuote(tokenIn, tokenOut, amount);

        // Calculate minimum amount out based on slippage
        const minAmountOut = (
          parseFloat(quote.amountOut) *
          (1 - parseFloat(slippageDecimal))
        ).toFixed(7);

        // Build transaction preview
        const preview: TransactionPreview = {
          operation: 'SWAP',
          protocol: 'Soroswap',
          network: network,
          estimatedFee: '100',
          walletAddress: wallet.publicKey,
          tokenIn: from.toUpperCase(),
          tokenOut: to.toUpperCase(),
          amountIn: amount,
          expectedAmountOut: quote.amountOut,
          minimumReceived: minAmountOut,
          priceImpact: quote.priceImpact,
          slippage: options.slippage || '1',
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

        // Execute swap
        spinner?.start('Executing swap...');
        const result = await protocol.swap(
          wallet.publicKey,
          wallet.secretKey,
          tokenIn,
          tokenOut,
          amount,
          minAmountOut
        );

        spinner?.stop();
        outputTransactionResult(result, { json: options.json, network });
      } catch (error) {
        spinner?.fail('Swap failed');
        outputError(error, { json: options.json });
        process.exit(1);
      }
    }
  );

// Register subcommands
swapCommand.addCommand(quoteCommand);
swapCommand.addCommand(executeCommand);
