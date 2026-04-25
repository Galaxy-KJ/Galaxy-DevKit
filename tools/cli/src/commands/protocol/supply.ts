/**
 * @fileoverview Protocol supply command
 * @description Top-level CLI command for supplying assets to DeFi lending protocols
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-04-25
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
  SUPPORTED_PROTOCOLS,
  ProtocolCapability,
} from '../../utils/protocol-registry.js';
import {
  outputTransactionPreview,
  outputTransactionResult,
  outputError,
  outputCancelled,
} from '../../utils/protocol-formatter.js';
import { PROTOCOL_IDS, Asset } from '@galaxy-kj/core-defi-protocols';

interface SupplyCommandOptions {
  wallet?: string;
  network: string;
  protocol?: string;
  json?: boolean;
  yes?: boolean;
}

/**
 * Resolve a 7-decimal Stellar asset code to an Asset object.
 * Handles native XLM and credit assets up to alphanum12.
 */
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

/**
 * Format a raw Stellar amount (7 decimal places) for display.
 * Strips trailing zeros while preserving precision.
 */
function formatStellarAmount(raw: string): string {
  const num = parseFloat(raw);
  if (isNaN(num)) return raw;
  // Stellar uses 7 decimal places; show up to 7 but strip trailing zeros
  return num.toFixed(7).replace(/\.?0+$/, '');
}

/**
 * Resolve protocol ID for supply operations.
 * Defaults to Blend (the lending protocol) if not specified.
 */
function resolveLendingProtocol(protocolOption?: string): string {
  if (protocolOption) {
    const id = protocolOption.toLowerCase();
    const info = SUPPORTED_PROTOCOLS.find((p) => p.id === id);
    if (!info) {
      throw new Error(
        `Protocol '${protocolOption}' not found. Run 'galaxy protocol list' to see available protocols.`
      );
    }
    if (!info.capabilities.includes(ProtocolCapability.LENDING)) {
      throw new Error(
        `Protocol '${info.name}' does not support lending operations. ` +
          `Available lending protocols: ${SUPPORTED_PROTOCOLS.filter((p) =>
            p.capabilities.includes(ProtocolCapability.LENDING)
          )
            .map((p) => p.id)
            .join(', ')}`
      );
    }
    return id;
  }

  // Default to Blend
  return PROTOCOL_IDS.BLEND;
}

export const supplyCommand = new Command('supply')
  .description('Supply assets to a DeFi lending protocol (defaults to Blend)')
  .argument('<asset>', 'Asset code to supply (e.g., USDC, XLM)')
  .argument('<amount>', 'Amount to supply (supports 7 decimal places, e.g. 100.0000000)')
  .option('-p, --protocol <name>', 'Lending protocol to use (default: blend)')
  .option('-w, --wallet <name>', 'Wallet name to use for signing')
  .option('--network <network>', 'Network (testnet/mainnet)', 'testnet')
  .option('--json', 'Output result as JSON')
  .option('-y, --yes', 'Skip confirmation prompt')
  .addHelpText(
    'after',
    `
Examples:
  $ galaxy protocol supply USDC 100
  $ galaxy protocol supply XLM 500.0000000 --network mainnet
  $ galaxy protocol supply USDC 100 --protocol blend --wallet my-wallet
  $ galaxy protocol supply USDC 100 --json --yes
`
  )
  .action(async (asset: string, amount: string, options: SupplyCommandOptions) => {
    const spinner = options.json ? null : ora('Preparing supply...').start();

    try {
      // Validate inputs
      validateAmount(amount, 'Amount');

      if (!['testnet', 'mainnet'].includes(options.network)) {
        throw new Error('Network must be either "testnet" or "mainnet"');
      }
      const network = options.network as 'testnet' | 'mainnet';

      // Resolve which lending protocol to use
      const protocolId = resolveLendingProtocol(options.protocol);

      // Select wallet
      spinner?.stop();
      const wallet = await selectWallet({
        wallet: options.wallet,
        network,
        json: options.json,
      });
      spinner?.start('Preparing supply...');

      // Resolve asset
      const assetObj = resolveAsset(asset);
      const displayAmount = formatStellarAmount(amount);

      // Get and initialise protocol
      const protocol = await getProtocolInstance(protocolId, network);
      await protocol.initialize();

      // Build transaction preview
      const preview: TransactionPreview = {
        operation: 'SUPPLY',
        protocol: protocolId === PROTOCOL_IDS.BLEND ? 'Blend Protocol' : protocolId,
        network,
        asset: asset.toUpperCase(),
        amount: displayAmount,
        estimatedFee: '100',
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

      // Execute supply
      spinner?.start(`Supplying ${displayAmount} ${asset.toUpperCase()} to ${preview.protocol}...`);
      const result = await protocol.supply(wallet.publicKey, wallet.secretKey, assetObj, amount);

      spinner?.stop();

      if (!options.json) {
        console.log(
          chalk.green(
            `\nSuccessfully supplied ${displayAmount} ${asset.toUpperCase()} to ${preview.protocol}`
          )
        );
      }

      outputTransactionResult(result, { json: options.json, network });
    } catch (error) {
      spinner?.fail('Supply failed');
      outputError(error, { json: options.json });
      process.exit(1);
    }
  });
