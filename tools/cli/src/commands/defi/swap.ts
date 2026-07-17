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
  outputSwapQuote,
  outputTransactionResult,
  outputError,
  outputCancelled,
} from '../../utils/protocol-formatter.js';
import { PROTOCOL_IDS, Asset } from '@galaxy-kj/core-defi-protocols';

interface SwapOptions {
  wallet?: string;
  network: string;
  json?: boolean;
  yes?: boolean;
  slippage: string;
  quoteOnly?: boolean;
}

function resolveAsset(assetCode: string): Asset {
  const code = assetCode.toUpperCase();
  if (code === 'XLM') {
    return { code: 'XLM', type: 'native' };
  }
  return {
    code,
    type: code.length <= 4 ? 'credit_alphanum4' : 'credit_alphanum12',
  };
}

export const swapCommand = new Command('swap')
  .description('Swap tokens via Soroswap DEX')
  .argument('<from-asset>', 'Source asset code (e.g., XLM)')
  .argument('<to-asset>', 'Destination asset code (e.g., USDC)')
  .argument('<amount>', 'Amount of source asset to swap')
  .option('-w, --wallet <name>', 'Wallet name to use')
  .option('--network <network>', 'Network (testnet/mainnet)', 'testnet')
  .option('--json', 'Output as JSON')
  .option('-y, --yes', 'Skip confirmation prompt')
  .option('--slippage <percent>', 'Slippage tolerance percent', '1')
  .option('--quote-only', 'Only show quote, do not execute')
  .action(async (fromAsset: string, toAsset: string, amount: string, options: SwapOptions) => {
    const spinner = options.json ? null : ora('Getting swap quote...').start();

    try {
      validateAmount(amount, 'Amount');
      const slippage = validateSlippage(options.slippage);

      if (!['testnet', 'mainnet'].includes(options.network)) {
        throw new Error('Network must be either "testnet" or "mainnet"');
      }
      const network = options.network as 'testnet' | 'mainnet';

      const protocol = await getProtocolInstance(PROTOCOL_IDS.SOROSWAP, network);
      await protocol.initialize();

      const assetIn = resolveAsset(fromAsset);
      const assetOut = resolveAsset(toAsset);

      const quote = await protocol.getSwapQuote(assetIn, assetOut, amount);

      spinner?.stop();
      outputSwapQuote(quote, { json: options.json });

      if (options.quoteOnly) {
        return;
      }

      spinner?.stop();
      const wallet = await selectWallet({
        wallet: options.wallet,
        network,
        json: options.json,
      });
      spinner?.start('Preparing swap...');

      const preview: TransactionPreview = {
        operation: 'SWAP',
        protocol: 'Soroswap',
        network,
        estimatedFee: '100',
        walletAddress: wallet.publicKey,
        tokenIn: fromAsset.toUpperCase(),
        tokenOut: toAsset.toUpperCase(),
        amountIn: amount,
        expectedAmountOut: quote.amountOut,
        minimumReceived: quote.minimumReceived,
        priceImpact: quote.priceImpact,
        slippage: options.slippage,
      };

      const confirmed = await confirmTransaction(preview, {
        yes: options.yes,
        json: options.json,
      });

      if (!confirmed) {
        outputCancelled({ json: options.json });
        return;
      }

      spinner?.start('Executing swap...');

      const result = await protocol.swap(
        wallet.publicKey,
        wallet.secretKey,
        assetIn,
        assetOut,
        amount,
        slippage
      );

      spinner?.stop();
      outputTransactionResult(result, { json: options.json, network });
    } catch (error) {
      spinner?.fail('Swap failed');
      outputError(error, { json: options.json });
      process.exit(1);
    }
  });
