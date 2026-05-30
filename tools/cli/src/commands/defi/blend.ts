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
  outputError,
  outputCancelled,
} from '../../utils/protocol-formatter.js';
import { PROTOCOL_IDS, Asset, TransactionResult } from '@galaxy-kj/core-defi-protocols';

interface BlendOptions {
  wallet?: string;
  network: string;
  json?: boolean;
  yes?: boolean;
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

async function executeBlendOp(
  operation: 'supply' | 'borrow',
  asset: string,
  amount: string,
  options: BlendOptions
): Promise<void> {
  const spinner = options.json ? null : ora(`Preparing ${operation}...`).start();

  try {
    validateAmount(amount, 'Amount');

    if (!['testnet', 'mainnet'].includes(options.network)) {
      throw new Error('Network must be either "testnet" or "mainnet"');
    }
    const network = options.network as 'testnet' | 'mainnet';

    spinner?.stop();
    const wallet = await selectWallet({ wallet: options.wallet, network, json: options.json });
    spinner?.start(`Preparing ${operation}...`);

    const protocol = await getProtocolInstance(PROTOCOL_IDS.BLEND, network);
    await protocol.initialize();

    const assetObj = resolveAsset(asset);

    const preview: TransactionPreview = {
      operation: operation.toUpperCase(),
      protocol: 'Blend Protocol',
      network,
      asset: asset.toUpperCase(),
      amount,
      estimatedFee: '100',
      walletAddress: wallet.publicKey,
    };

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

    spinner?.start(`Executing ${operation}...`);

    let result: TransactionResult;
    if (operation === 'supply') {
      result = await protocol.supply(wallet.publicKey, wallet.secretKey, assetObj, amount);
    } else {
      result = await protocol.borrow(wallet.publicKey, wallet.secretKey, assetObj, amount);
    }

    spinner?.stop();
    outputTransactionResult(result, { json: options.json, network });
  } catch (error) {
    spinner?.fail(`${operation} failed`);
    outputError(error, { json: options.json });
    process.exit(1);
  }
}

export const blendCommand = new Command('blend')
  .description('Blend Protocol supply/borrow operations');

const supplyCmd = new Command('supply')
  .description('Supply assets to Blend Protocol')
  .argument('<asset>', 'Asset code (e.g., USDC, XLM)')
  .argument('<amount>', 'Amount to supply')
  .option('-w, --wallet <name>', 'Wallet name to use')
  .option('--network <network>', 'Network (testnet/mainnet)', 'testnet')
  .option('--json', 'Output as JSON')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (asset: string, amount: string, options: BlendOptions) => {
    await executeBlendOp('supply', asset, amount, options);
  });

const borrowCmd = new Command('borrow')
  .description('Borrow assets from Blend Protocol')
  .argument('<asset>', 'Asset code (e.g., USDC, XLM)')
  .argument('<amount>', 'Amount to borrow')
  .option('-w, --wallet <name>', 'Wallet name to use')
  .option('--network <network>', 'Network (testnet/mainnet)', 'testnet')
  .option('--json', 'Output as JSON')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(async (asset: string, amount: string, options: BlendOptions) => {
    await executeBlendOp('borrow', asset, amount, options);
  });

blendCommand.addCommand(supplyCmd);
blendCommand.addCommand(borrowCmd);
