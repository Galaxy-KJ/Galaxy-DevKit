/**
 * @fileoverview Dashboard view command
 * @description Combined multi-panel view for real-time network, oracle, and transaction monitoring
 * @author Galaxy DevKit Team
 */

import { Command } from 'commander';
import { TerminalUI } from '../../utils/terminal-ui.js';
import { StreamManager } from '../../utils/stream-manager.js';
import {
  OracleAggregator,
  MockOracleSource,
  MedianStrategy,
} from '@galaxy/core-oracles';
import chalk from 'chalk';

const dashboardWatchCommand = new Command('dashboard');

/**
 * Create oracle aggregator for dashboard price display
 */
function createOracleAggregator(): OracleAggregator {
  const aggregator = new OracleAggregator({ minSources: 1 });
  aggregator.setStrategy(new MedianStrategy());

  const basePrices = new Map<string, number>([
    ['XLM', 0.1234],
    ['BTC', 50230],
    ['ETH', 2850],
    ['USDC', 1.0],
  ]);

  const source1 = new MockOracleSource('MarketData-1', new Map(basePrices));
  aggregator.addSource(source1, 1.0);

  const source2Prices = new Map<string, number>();
  basePrices.forEach((price, symbol) => {
    source2Prices.set(symbol, price * (1 + (Math.random() - 0.5) * 0.002));
  });
  const source2 = new MockOracleSource('MarketData-2', source2Prices);
  aggregator.addSource(source2, 0.8);

  return aggregator;
}

dashboardWatchCommand
  .alias('--dashboard')
  .description('Show multi-panel combined monitoring view')
  .option('--network <type>', 'Network (testnet/mainnet)', 'testnet')
  .action(async options => {
    const ui = new TerminalUI(`Galaxy DevKit Dashboard [${options.network}]`);
    const streamManager = new StreamManager({ network: options.network });
    const aggregator = createOracleAggregator();

    // Panel 1: Network Stats (top-left)
    const netLog = ui.createLogBox({
      row: 0,
      col: 0,
      rowSpan: 6,
      colSpan: 6,
      label: ' Network Activity ',
    });

    // Panel 2: Oracle / Price list (top-right)
    const priceLog = ui.createLogBox({
      row: 0,
      col: 6,
      rowSpan: 6,
      colSpan: 6,
      label: ' Market Prices ',
    });

    // Panel 3: Transactions (bottom full width)
    const txLog = ui.createLogBox({
      row: 6,
      col: 0,
      rowSpan: 6,
      colSpan: 12,
      label: ' Global Transaction Stream ',
    });

    // Initialize panels
    netLog.log(chalk.cyan('Status: ') + chalk.yellow('Connecting...'));
    netLog.log(chalk.cyan('Network: ') + options.network);
    priceLog.log(chalk.gray('Loading prices...'));
    txLog.log(chalk.gray('Waiting for transactions...'));
    ui.render();

    // Track network stats
    let ledgerCount = 0;
    let totalTxs = 0;
    let lastLedgerTime = Date.now();
    const tpsHistory: number[] = [];

    // Subscribe to ledger stream
    streamManager.watchLedgers().subscribe({
      next: ledger => {
        ledgerCount++;
        const txCount = ledger.successful_transaction_count;
        totalTxs += txCount;

        // Calculate TPS
        const now = Date.now();
        const elapsed = (now - lastLedgerTime) / 1000;
        lastLedgerTime = now;
        const tps = elapsed > 0 ? txCount / elapsed : 0;
        tpsHistory.push(tps);
        if (tpsHistory.length > 10) tpsHistory.shift();
        const avgTps =
          tpsHistory.reduce((a, b) => a + b, 0) / tpsHistory.length;

        netLog.log(
          `${chalk.cyan(`[${new Date().toLocaleTimeString()}]`)} ` +
          `Ledger ${chalk.yellow(ledger.sequence)} | ` +
          `TXs: ${chalk.green(txCount)} | ` +
          `TPS: ${chalk.magenta(avgTps.toFixed(1))}`
        );
        ui.render();
      },
      error: err => {
        netLog.log(chalk.red(`[ERROR] ${err.message}`));
        ui.render();
      },
    });

    // Mark as connected after first render
    setTimeout(() => {
      netLog.log(chalk.cyan('Status: ') + chalk.green('Connected ✓'));
      ui.render();
    }, 2000);

    // Subscribe to transaction stream
    streamManager.watchAllTransactions().subscribe({
      next: tx => {
        const time = new Date().toLocaleTimeString();
        const hashShort = tx.hash.substring(0, 8);
        const status = tx.successful ? chalk.green('✓') : chalk.red('✗');

        txLog.log(
          `${chalk.cyan(`[${time}]`)} ${status} ` +
          `${chalk.yellow(hashShort)}... | ` +
          `Ops: ${tx.operation_count} | ` +
          `Fee: ${tx.fee_charged} stroops`
        );
        ui.render();
      },
      error: err => {
        txLog.log(chalk.red(`[TX ERROR] ${err.message}`));
        ui.render();
      },
    });

    // Price tracking state
    const lastPrices: Map<string, number> = new Map();
    const symbols = ['XLM', 'BTC', 'ETH', 'USDC'];

    // Update prices periodically
    const updatePrices = async () => {
      try {
        priceLog.log(chalk.gray('─'.repeat(30)));

        for (const symbol of symbols) {
          try {
            const result = await aggregator.getAggregatedPrice(symbol);
            const price = result.price;
            const lastPrice = lastPrices.get(symbol);

            let indicator = '  ';
            if (lastPrice !== undefined) {
              if (price > lastPrice) indicator = chalk.green('↑');
              else if (price < lastPrice) indicator = chalk.red('↓');
            }

            const priceStr =
              symbol === 'BTC' || symbol === 'ETH'
                ? `$${price.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                : `$${price.toFixed(4)}`;

            priceLog.log(`${chalk.yellow(symbol.padEnd(5))}: ${priceStr} ${indicator}`);
            lastPrices.set(symbol, price);
          } catch {
            priceLog.log(`${chalk.yellow(symbol.padEnd(5))}: ${chalk.gray('N/A')}`);
          }
        }

        priceLog.log(
          chalk.gray(`Updated: ${new Date().toLocaleTimeString()}`)
        );
        ui.render();
      } catch (err: any) {
        priceLog.log(chalk.red(`[ERROR] ${err.message}`));
        ui.render();
      }
    };

    // Initial price fetch
    await updatePrices();

    // Update prices every 10 seconds
    setInterval(updatePrices, 10000);

    ui.render();
  });

export { dashboardWatchCommand };
