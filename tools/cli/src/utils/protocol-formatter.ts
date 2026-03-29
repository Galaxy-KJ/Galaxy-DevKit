/**
 * @fileoverview Protocol Output Formatter
 * @description Formats protocol data for CLI output (tables, JSON)
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-01-30
 */

import chalk from 'chalk';
import Table from 'cli-table3';
import {
  TransactionResult,
  Position,
  SwapQuote,
  LiquidityPool,
  ProtocolStats,
} from '@galaxy-kj/core-defi-protocols';
import {
  SupportedProtocol,
  TransactionPreview,
  getExplorerUrl,
} from './protocol-registry.js';

/**
 * Output options
 */
interface OutputOptions {
  json?: boolean;
}

/**
 * Output protocol list
 */
export function outputProtocolList(
  protocols: SupportedProtocol[],
  options: OutputOptions & { network?: string }
): void {
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          network: options.network || 'all',
          protocols: protocols.map((p) => ({
            id: p.id,
            name: p.name,
            type: p.type,
            description: p.description,
            networks: p.networks,
            capabilities: p.capabilities,
          })),
        },
        null,
        2
      )
    );
    return;
  }

  console.log(chalk.blue('\n📋 Available DeFi Protocols'));
  if (options.network) {
    console.log(chalk.gray(`   Network: ${options.network}\n`));
  } else {
    console.log('');
  }

  const table = new Table({
    head: [
      chalk.cyan('Protocol'),
      chalk.cyan('Type'),
      chalk.cyan('Networks'),
      chalk.cyan('Capabilities'),
    ],
    colWidths: [20, 12, 20, 30],
  });

  protocols.forEach((p) => {
    table.push([
      p.name,
      p.type,
      p.networks.join(', '),
      p.capabilities.join(', '),
    ]);
  });

  console.log(table.toString());
  console.log(chalk.gray(`\nTotal: ${protocols.length} protocol(s)`));
}

/**
 * Output protocol info with stats
 */
export function outputProtocolInfo(
  protocol: SupportedProtocol,
  stats: ProtocolStats | null,
  options: OutputOptions
): void {
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          id: protocol.id,
          name: protocol.name,
          type: protocol.type,
          description: protocol.description,
          networks: protocol.networks,
          capabilities: protocol.capabilities,
          stats: stats
            ? {
                totalSupply: stats.totalSupply,
                totalBorrow: stats.totalBorrow,
                tvl: stats.tvl,
                utilizationRate: stats.utilizationRate,
                timestamp: stats.timestamp.toISOString(),
              }
            : null,
        },
        null,
        2
      )
    );
    return;
  }

  console.log(chalk.blue(`\n📊 ${protocol.name}`));
  console.log(chalk.gray('─'.repeat(40)));
  console.log(chalk.white('ID:          ') + protocol.id);
  console.log(chalk.white('Type:        ') + protocol.type);
  console.log(chalk.white('Description: ') + protocol.description);
  console.log(chalk.white('Networks:    ') + protocol.networks.join(', '));
  console.log(chalk.white('Capabilities:') + ' ' + protocol.capabilities.join(', '));

  if (stats) {
    console.log(chalk.blue('\n📈 Protocol Statistics'));
    console.log(chalk.gray('─'.repeat(40)));
    console.log(chalk.white('Total Supply:     ') + `$${formatNumber(stats.totalSupply)}`);
    console.log(chalk.white('Total Borrow:     ') + `$${formatNumber(stats.totalBorrow)}`);
    console.log(chalk.white('TVL:              ') + `$${formatNumber(stats.tvl)}`);
    console.log(chalk.white('Utilization Rate: ') + `${stats.utilizationRate.toFixed(2)}%`);
    console.log(chalk.gray(`\nLast updated: ${stats.timestamp.toLocaleString()}`));
  }
}

/**
 * Output transaction preview
 */
export function outputTransactionPreview(
  preview: TransactionPreview,
  options: OutputOptions
): void {
  if (options.json) {
    console.log(JSON.stringify(preview, null, 2));
    return;
  }

  console.log(chalk.blue('\n📝 Transaction Preview'));
  console.log(chalk.gray('─'.repeat(40)));
  console.log(chalk.white('Operation:    ') + chalk.yellow(preview.operation));
  console.log(chalk.white('Protocol:     ') + preview.protocol);
  console.log(chalk.white('Network:      ') + preview.network);
  console.log(chalk.white('Wallet:       ') + truncateAddress(preview.walletAddress));

  if (preview.asset && preview.amount) {
    console.log(chalk.white('Asset:        ') + preview.asset);
    console.log(chalk.white('Amount:       ') + preview.amount);
  }

  if (preview.tokenIn && preview.tokenOut) {
    console.log(chalk.white('From:         ') + `${preview.amountIn} ${preview.tokenIn}`);
    console.log(chalk.white('To:           ') + `${preview.expectedAmountOut} ${preview.tokenOut}`);
    if (preview.minimumReceived) {
      console.log(chalk.white('Min Received: ') + preview.minimumReceived);
    }
    if (preview.priceImpact) {
      console.log(chalk.white('Price Impact: ') + `${preview.priceImpact}%`);
    }
    if (preview.slippage) {
      console.log(chalk.white('Slippage:     ') + `${preview.slippage}%`);
    }
  }

  console.log(chalk.white('Est. Fee:     ') + `${preview.estimatedFee} stroops`);
  console.log('');
}

/**
 * Output transaction result
 */
export function outputTransactionResult(
  result: TransactionResult,
  options: OutputOptions & { network?: 'testnet' | 'mainnet' }
): void {
  const network = options.network || 'testnet';

  if (options.json) {
    console.log(
      JSON.stringify(
        {
          hash: result.hash,
          status: result.status,
          ledger: result.ledger,
          createdAt: result.createdAt.toISOString(),
          explorerUrl: getExplorerUrl(result.hash, network),
          metadata: result.metadata,
        },
        null,
        2
      )
    );
    return;
  }

  const statusColor =
    result.status === 'success'
      ? chalk.green
      : result.status === 'failed'
        ? chalk.red
        : chalk.yellow;

  console.log(chalk.blue('\n✅ Transaction Result'));
  console.log(chalk.gray('─'.repeat(40)));
  console.log(chalk.white('Status: ') + statusColor(result.status.toUpperCase()));
  console.log(chalk.white('Hash:   ') + result.hash);
  console.log(chalk.white('Ledger: ') + result.ledger);
  console.log(chalk.white('Time:   ') + result.createdAt.toLocaleString());
  console.log(chalk.blue('\n🔗 View on Stellar Expert:'));
  console.log(chalk.gray(`   ${getExplorerUrl(result.hash, network)}`));
}

/**
 * Output swap quote
 */
export function outputSwapQuote(quote: SwapQuote, options: OutputOptions): void {
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          tokenIn: quote.tokenIn,
          tokenOut: quote.tokenOut,
          amountIn: quote.amountIn,
          amountOut: quote.amountOut,
          priceImpact: quote.priceImpact,
          minimumReceived: quote.minimumReceived,
          path: quote.path,
          validUntil: quote.validUntil.toISOString(),
        },
        null,
        2
      )
    );
    return;
  }

  console.log(chalk.blue('\n💱 Swap Quote'));
  console.log(chalk.gray('─'.repeat(40)));
  console.log(chalk.white('From:            ') + `${quote.amountIn} ${quote.tokenIn.code}`);
  console.log(chalk.white('To:              ') + `${quote.amountOut} ${quote.tokenOut.code}`);
  console.log(chalk.white('Exchange Rate:   ') + calculateExchangeRate(quote));
  console.log(chalk.white('Price Impact:    ') + formatPriceImpact(quote.priceImpact));
  console.log(chalk.white('Min Received:    ') + `${quote.minimumReceived} ${quote.tokenOut.code}`);

  if (quote.path.length > 2) {
    console.log(chalk.white('Path:            ') + quote.path.join(' → '));
  }

  console.log(chalk.gray(`\nQuote valid until: ${quote.validUntil.toLocaleString()}`));
}

/**
 * Output position info
 */
export function outputPosition(position: Position, options: OutputOptions): void {
  if (options.json) {
    console.log(JSON.stringify(position, null, 2));
    return;
  }

  console.log(chalk.blue('\n💰 Lending Position'));
  console.log(chalk.gray('─'.repeat(40)));
  console.log(chalk.white('Address: ') + truncateAddress(position.address));
  console.log(chalk.white('Health Factor: ') + formatHealthFactor(position.healthFactor));
  console.log(chalk.white('Collateral Value: ') + `$${formatNumber(position.collateralValue)}`);
  console.log(chalk.white('Debt Value: ') + `$${formatNumber(position.debtValue)}`);

  if (position.supplied.length > 0) {
    console.log(chalk.blue('\n📈 Supplied Assets'));
    const supplyTable = new Table({
      head: [chalk.cyan('Asset'), chalk.cyan('Amount'), chalk.cyan('Value (USD)')],
    });
    position.supplied.forEach((b) => {
      supplyTable.push([b.asset.code, b.amount, `$${formatNumber(b.valueUSD)}`]);
    });
    console.log(supplyTable.toString());
  }

  if (position.borrowed.length > 0) {
    console.log(chalk.blue('\n📉 Borrowed Assets'));
    const borrowTable = new Table({
      head: [chalk.cyan('Asset'), chalk.cyan('Amount'), chalk.cyan('Value (USD)')],
    });
    position.borrowed.forEach((b) => {
      borrowTable.push([b.asset.code, b.amount, `$${formatNumber(b.valueUSD)}`]);
    });
    console.log(borrowTable.toString());
  }
}

/**
 * Output liquidity pool info
 */
export function outputLiquidityPool(pool: LiquidityPool, options: OutputOptions): void {
  if (options.json) {
    console.log(JSON.stringify(pool, null, 2));
    return;
  }

  console.log(chalk.blue('\n🌊 Liquidity Pool'));
  console.log(chalk.gray('─'.repeat(40)));
  console.log(chalk.white('Pool:      ') + `${pool.tokenA.code}/${pool.tokenB.code}`);
  console.log(chalk.white('Address:   ') + truncateAddress(pool.address));
  console.log(chalk.white('Reserve A: ') + `${formatNumber(pool.reserveA)} ${pool.tokenA.code}`);
  console.log(chalk.white('Reserve B: ') + `${formatNumber(pool.reserveB)} ${pool.tokenB.code}`);
  console.log(chalk.white('Liquidity: ') + formatNumber(pool.totalLiquidity));
  console.log(chalk.white('Fee:       ') + `${parseFloat(pool.fee) * 100}%`);
}

/**
 * Output liquidity pools list
 */
export function outputLiquidityPoolList(
  pools: LiquidityPool[],
  options: OutputOptions
): void {
  if (options.json) {
    console.log(JSON.stringify({ pools }, null, 2));
    return;
  }

  console.log(chalk.blue('\n🌊 Liquidity Pools'));
  console.log('');

  const table = new Table({
    head: [
      chalk.cyan('Pair'),
      chalk.cyan('Reserve A'),
      chalk.cyan('Reserve B'),
      chalk.cyan('Liquidity'),
      chalk.cyan('Fee'),
    ],
  });

  pools.forEach((p) => {
    table.push([
      `${p.tokenA.code}/${p.tokenB.code}`,
      formatNumber(p.reserveA),
      formatNumber(p.reserveB),
      formatNumber(p.totalLiquidity),
      `${parseFloat(p.fee) * 100}%`,
    ]);
  });

  console.log(table.toString());
  console.log(chalk.gray(`\nTotal: ${pools.length} pool(s)`));
}

/**
 * Output error in appropriate format
 */
export function outputError(
  error: Error | unknown,
  options: OutputOptions
): void {
  const message = error instanceof Error ? error.message : String(error);

  if (options.json) {
    console.log(JSON.stringify({ error: message }, null, 2));
  } else {
    console.error(chalk.red('Error:'), message);
  }
}

/**
 * Output cancelled message
 */
export function outputCancelled(options: OutputOptions): void {
  if (options.json) {
    console.log(JSON.stringify({ cancelled: true }));
  } else {
    console.log(chalk.yellow('Transaction cancelled.'));
  }
}

// Helper functions

function formatNumber(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return value.toString();
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function truncateAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}...${address.slice(-4)}`;
}

function calculateExchangeRate(quote: SwapQuote): string {
  const amountIn = parseFloat(quote.amountIn);
  const amountOut = parseFloat(quote.amountOut);
  if (amountIn === 0) return 'N/A';
  const rate = amountOut / amountIn;
  return `1 ${quote.tokenIn.code} = ${rate.toFixed(6)} ${quote.tokenOut.code}`;
}

function formatPriceImpact(impact: string): string {
  const num = parseFloat(impact);
  if (isNaN(num)) return impact;
  const color = num < 1 ? chalk.green : num < 3 ? chalk.yellow : chalk.red;
  return color(`${num.toFixed(2)}%`);
}

function formatHealthFactor(healthFactor: string): string {
  const num = parseFloat(healthFactor);
  if (isNaN(num)) return healthFactor;
  const color = num >= 1.5 ? chalk.green : num >= 1.2 ? chalk.yellow : chalk.red;
  return color(num.toFixed(2));
}
