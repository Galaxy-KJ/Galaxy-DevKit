/**
 * @fileoverview Liquidity pool commands
 * @description CLI commands for liquidity pool operations
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
  outputLiquidityPool,
  outputLiquidityPoolList,
  outputError,
  outputCancelled,
} from '../../utils/protocol-formatter.js';
import { PROTOCOL_IDS, Asset, LiquidityPool } from '@galaxy-kj/core-defi-protocols';

interface LiquidityCommandOptions {
  wallet?: string;
  network: string;
  json?: boolean;
  yes?: boolean;
}

/**
 * Issuers of well-known tokens, per network. Same issuers the rest of the
 * app already relies on (see `packages/frontend/src/config/soroswap-tokens.ts`):
 * Circle's official USDC issuing accounts.
 */
const KNOWN_TOKEN_ISSUERS: Record<string, Record<string, string>> = {
  testnet: {
    USDC: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  },
  mainnet: {
    USDC: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  },
};

/**
 * Resolve asset code to Asset object. When a network is given, well-known
 * tokens resolve to their issuing account, which the protocol needs to
 * derive the token's contract address (a bare code has no issuer and the
 * protocol rejects it: "Non-native assets must have an issuer").
 */
function resolveAsset(assetCode: string, network?: string): Asset {
  const code = assetCode.toUpperCase();

  if (code === 'XLM') {
    return {
      code: 'XLM',
      type: 'native',
    };
  }

  const issuer = network ? KNOWN_TOKEN_ISSUERS[network]?.[code] : undefined;

  return {
    code: code,
    ...(issuer ? { issuer } : {}),
    type: code.length <= 4 ? 'credit_alphanum4' : 'credit_alphanum12',
  };
}

/**
 * Resolve a token code from a pair input ("XLM-USDC") to an Asset the
 * protocol can use. Anything that is not a well-known token for the network
 * fails here with a clear message instead of a misleading "no pool" error
 * from the factory lookup.
 */
function resolvePairToken(code: string, network: string): Asset {
  const asset = resolveAsset(code, network);
  if (asset.type !== 'native' && !asset.issuer) {
    const known = ['XLM', ...Object.keys(KNOWN_TOKEN_ISSUERS[network] ?? {})].join(', ');
    throw new Error(
      `Unknown token "${code}" on ${network}: no issuer known for this token. Use a pool contract address instead, or a well-known token (${known}).`
    );
  }
  return asset;
}

// Create main liquidity command
export const liquidityCommand = new Command('liquidity')
  .description('Liquidity pool operations');

// Add liquidity subcommand
const addCommand = new Command('add')
  .description('Add liquidity to a pool')
  .argument('<tokenA>', 'First token (e.g., XLM)')
  .argument('<tokenB>', 'Second token (e.g., USDC)')
  .argument('<amountA>', 'Amount of first token')
  .argument('<amountB>', 'Amount of second token')
  .option('-w, --wallet <name>', 'Wallet name to use')
  .option('--network <network>', 'Network (testnet/mainnet)', 'testnet')
  .option('--json', 'Output as JSON')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(
    async (
      tokenA: string,
      tokenB: string,
      amountA: string,
      amountB: string,
      options: LiquidityCommandOptions
    ) => {
      const spinner = options.json ? null : ora('Preparing to add liquidity...').start();

      try {
        // Validate inputs
        validateAmount(amountA, 'Amount A');
        validateAmount(amountB, 'Amount B');

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
        spinner?.start('Preparing to add liquidity...');

        // Resolve assets
        const assetA = resolveAsset(tokenA);
        const assetB = resolveAsset(tokenB);

        // Get protocol
        const protocol = await getProtocolInstance(PROTOCOL_IDS.SOROSWAP, network);
        await protocol.initialize();

        // Check if addLiquidity method exists
        if (!protocol.addLiquidity) {
          throw new Error('Add liquidity is not supported by this protocol');
        }

        // Build transaction preview
        const preview: TransactionPreview = {
          operation: 'ADD LIQUIDITY',
          protocol: 'Soroswap',
          network: network,
          estimatedFee: '100',
          walletAddress: wallet.publicKey,
          tokenIn: `${tokenA.toUpperCase()} (${amountA})`,
          tokenOut: `${tokenB.toUpperCase()} (${amountB})`,
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

        // Execute add liquidity
        spinner?.start('Adding liquidity...');
        const result = await protocol.addLiquidity(
          wallet.publicKey,
          wallet.secretKey,
          assetA,
          assetB,
          amountA,
          amountB
        );

        spinner?.stop();
        outputTransactionResult(result, { json: options.json, network });
      } catch (error) {
        spinner?.fail('Failed to add liquidity');
        outputError(error, { json: options.json });
        process.exit(1);
      }
    }
  );

// Remove liquidity subcommand
const removeCommand = new Command('remove')
  .description('Remove liquidity from a pool')
  .argument('<pool>', 'Pool address or pair (e.g., XLM-USDC)')
  .argument('<amount>', 'Amount of LP tokens to remove')
  .option('-w, --wallet <name>', 'Wallet name to use')
  .option('--network <network>', 'Network (testnet/mainnet)', 'testnet')
  .option('--json', 'Output as JSON')
  .option('-y, --yes', 'Skip confirmation prompt')
  .action(
    async (
      pool: string,
      amount: string,
      options: LiquidityCommandOptions
    ) => {
      const spinner = options.json ? null : ora('Preparing to remove liquidity...').start();

      try {
        // Validate inputs
        validateAmount(amount, 'Amount');

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
        spinner?.start('Preparing to remove liquidity...');

        // Get protocol
        const protocol = await getProtocolInstance(PROTOCOL_IDS.SOROSWAP, network);
        await protocol.initialize();

        // Check if removeLiquidity method exists
        if (!protocol.removeLiquidity) {
          throw new Error('Remove liquidity is not supported by this protocol');
        }

        // Build transaction preview
        const preview: TransactionPreview = {
          operation: 'REMOVE LIQUIDITY',
          protocol: 'Soroswap',
          network: network,
          estimatedFee: '100',
          walletAddress: wallet.publicKey,
          asset: pool,
          amount: amount,
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

        // Resolve tokens and the real pool address.
        // Pair input ("XLM-USDC"): look the pool up in the Soroswap factory
        // so the transaction targets the real pool contract, not the raw
        // "XLM-USDC" string. A pair with no pool fails here with a clear
        // error instead of an RPC failure further down.
        // Contract input ("C..."): read token_0/token_1 from the pair
        // contract instead of assuming the pool holds XLM and USDC.
        let tokenA: Asset;
        let tokenB: Asset;
        let poolAddress: string;

        if (pool.includes('-')) {
          const [a, b] = pool.split('-');
          tokenA = resolvePairToken(a, network);
          tokenB = resolvePairToken(b, network);
          if (!protocol.getLiquidityPool) {
            throw new Error('Pool lookup is not supported by this protocol');
          }
          let poolInfo: LiquidityPool;
          try {
            poolInfo = await protocol.getLiquidityPool(tokenA, tokenB);
          } catch {
            throw new Error(
              `No liquidity pool exists for ${pool} on ${network}. Check the token pair and network.`
            );
          }
          poolAddress = poolInfo.address;
        } else {
          if (!protocol.getPairTokens) {
            throw new Error('Reading pool tokens is not supported by this protocol');
          }
          const tokens = await protocol.getPairTokens(pool);
          tokenA = tokens.token0;
          tokenB = tokens.token1;
          poolAddress = pool;
        }

        // Execute remove liquidity
        spinner?.start('Removing liquidity...');
        const result = await protocol.removeLiquidity(
          wallet.publicKey,
          wallet.secretKey,
          tokenA,
          tokenB,
          poolAddress,
          amount
        );

        spinner?.stop();
        outputTransactionResult(result, { json: options.json, network });
      } catch (error) {
        spinner?.fail('Failed to remove liquidity');
        outputError(error, { json: options.json });
        process.exit(1);
      }
    }
  );

// Pools subcommand (read-only) - list available pools
const poolsCommand = new Command('pools')
  .description('List available liquidity pools')
  .option('--network <network>', 'Network (testnet/mainnet)', 'testnet')
  .option('--json', 'Output as JSON')
  .action(async (options: { network: string; json?: boolean }) => {
    const spinner = options.json ? null : ora('Loading pools...').start();

    try {
      if (!['testnet', 'mainnet'].includes(options.network)) {
        throw new Error('Network must be either "testnet" or "mainnet"');
      }
      const network = options.network as 'testnet' | 'mainnet';

      // Get protocol
      const protocol = await getProtocolInstance(PROTOCOL_IDS.SOROSWAP, network);
      await protocol.initialize();

      // Only a fixed list of common pairs is checked here. Each entry is a
      // real pool resolved through the protocol's factory lookup; pairs with
      // no pool on this network are skipped.
      const pools: LiquidityPool[] = [];

      const commonPairs = [
        ['XLM', 'USDC'],
        ['XLM', 'BTC'],
        ['USDC', 'ETH'],
      ];

      for (const [tokenA, tokenB] of commonPairs) {
        try {
          if (protocol.getLiquidityPool) {
            const pool = await protocol.getLiquidityPool(
              resolveAsset(tokenA),
              resolveAsset(tokenB)
            );
            pools.push(pool);
          }
        } catch {
          // Pool might not exist, continue
        }
      }

      spinner?.stop();

      if (pools.length === 0) {
        if (options.json) {
          console.log(JSON.stringify({ pools: [], message: 'No pools found' }, null, 2));
        } else {
          console.log(
            chalk.yellow(
              '\nNo liquidity pools found on this network (checked common pairs: XLM/USDC, XLM/BTC, USDC/ETH).'
            )
          );
        }
      } else {
        outputLiquidityPoolList(pools, { json: options.json });
      }
    } catch (error) {
      spinner?.fail('Failed to load pools');
      outputError(error, { json: options.json });
      process.exit(1);
    }
  });

// Info subcommand - get info about a specific pool
const infoCommand = new Command('info')
  .description('Get information about a liquidity pool')
  .argument('<tokenA>', 'First token (e.g., XLM)')
  .argument('<tokenB>', 'Second token (e.g., USDC)')
  .option('--network <network>', 'Network (testnet/mainnet)', 'testnet')
  .option('--json', 'Output as JSON')
  .action(
    async (
      tokenA: string,
      tokenB: string,
      options: { network: string; json?: boolean }
    ) => {
      const spinner = options.json ? null : ora('Loading pool info...').start();

      try {
        if (!['testnet', 'mainnet'].includes(options.network)) {
          throw new Error('Network must be either "testnet" or "mainnet"');
        }
        const network = options.network as 'testnet' | 'mainnet';

        // Resolve assets
        const assetA = resolveAsset(tokenA);
        const assetB = resolveAsset(tokenB);

        // Get protocol
        const protocol = await getProtocolInstance(PROTOCOL_IDS.SOROSWAP, network);
        await protocol.initialize();

        // Check if getLiquidityPool method exists
        if (!protocol.getLiquidityPool) {
          throw new Error('Pool info is not supported by this protocol');
        }

        const pool = await protocol.getLiquidityPool(assetA, assetB);

        spinner?.stop();
        outputLiquidityPool(pool, { json: options.json });
      } catch (error) {
        spinner?.fail('Failed to load pool info');
        outputError(error, { json: options.json });
        process.exit(1);
      }
    }
  );

// Register subcommands
liquidityCommand.addCommand(addCommand);
liquidityCommand.addCommand(removeCommand);
liquidityCommand.addCommand(poolsCommand);
liquidityCommand.addCommand(infoCommand);
