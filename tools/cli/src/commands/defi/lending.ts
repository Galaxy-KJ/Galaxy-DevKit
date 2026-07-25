import { Command } from 'commander';
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
import { PROTOCOL_IDS, Asset, IDefiProtocol, TransactionResult } from '@galaxy-kj/core-defi-protocols';

export type LendingOperation = 'supply' | 'withdraw' | 'borrow' | 'repay';

interface LendingOptions {
  wallet?: string;
  network: string;
  json?: boolean;
  yes?: boolean;
}

const OPERATION_LABELS: Record<LendingOperation, string> = {
  supply: 'Supply',
  withdraw: 'Withdraw',
  borrow: 'Borrow',
  repay: 'Repay',
};

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

async function invokeLendingOperation(
  protocol: IDefiProtocol,
  operation: LendingOperation,
  publicKey: string,
  secretKey: string,
  assetObj: Asset,
  amount: string
): Promise<TransactionResult> {
  switch (operation) {
    case 'supply':
      return protocol.supply(publicKey, secretKey, assetObj, amount);
    case 'withdraw':
      return protocol.withdraw(publicKey, secretKey, assetObj, amount);
    case 'borrow':
      return protocol.borrow(publicKey, secretKey, assetObj, amount);
    case 'repay':
      return protocol.repay(publicKey, secretKey, assetObj, amount);
  }
}

export async function executeLendingOp(
  operation: LendingOperation,
  asset: string,
  amount: string,
  options: LendingOptions
): Promise<void> {
  const label = OPERATION_LABELS[operation];
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
      operation: label.toUpperCase(),
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

    const result = await invokeLendingOperation(
      protocol,
      operation,
      wallet.publicKey,
      wallet.secretKey,
      assetObj,
      amount
    );

    spinner?.stop();
    outputTransactionResult(result, { json: options.json, network });

    if (protocol.getPosition) {
      try {
        const position = await protocol.getPosition(wallet.publicKey);
        outputPosition(position, { json: options.json });
      } catch {
        // Position fetch is best-effort after transaction
      }
    }
  } catch (error) {
    spinner?.fail(`${operation} failed`);
    outputError(error, { json: options.json });
    process.exit(1);
  }
}

export function createLendingCommand(operation: LendingOperation): Command {
  const label = OPERATION_LABELS[operation];
  const descriptions: Record<LendingOperation, string> = {
    supply: 'Supply assets to Blend Protocol',
    withdraw: 'Withdraw supplied assets from Blend Protocol',
    borrow: 'Borrow assets from Blend Protocol',
    repay: 'Repay borrowed assets to Blend Protocol',
  };

  return new Command(operation)
    .description(descriptions[operation])
    .argument('<asset>', 'Asset code (e.g., USDC, XLM)')
    .argument('<amount>', `Amount to ${operation}`)
    .option('-w, --wallet <name>', 'Wallet name to use')
    .option('--network <network>', 'Network (testnet/mainnet)', 'testnet')
    .option('--json', 'Output as JSON')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (asset: string, amount: string, options: LendingOptions) => {
      await executeLendingOp(operation, asset, amount, options);
    });
}

export const supplyCommand = createLendingCommand('supply');
export const withdrawCommand = createLendingCommand('withdraw');
export const borrowCommand = createLendingCommand('borrow');
export const repayCommand = createLendingCommand('repay');
