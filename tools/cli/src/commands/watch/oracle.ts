// @ts-nocheck
/**
 * @fileoverview Oracle monitoring command
 * @description Streams real-time price updates from oracles using IOracleSource
 * @author Galaxy DevKit Team
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { TerminalUI } from '../../utils/terminal-ui.js';
import { MockOracleSource } from '../../utils/oracle-registry.js';
import { OracleAggregator, MedianStrategy } from '@galaxy/core-oracles';

const oracleWatchCommand = new Command('oracle');

/**
 * Create a configured oracle aggregator with mock sources
 * In production, this would load real oracle sources from configuration
 */
function createOracleAggregator(): OracleAggregator {
  const aggregator = new OracleAggregator({ minSources: 1 });
  aggregator.setStrategy(new MedianStrategy());

  // Create mock sources with realistic price variations
  // In production, replace with real oracle sources (Binance, CoinGecko, etc.)
  const basePrices = new Map<string, number>([
    ['XLM', 0.12],
    ['BTC', 50230],
    ['ETH', 2850],
    ['USDC', 1.0],
    ['USDT', 1.0],
    ['EUR', 1.08],
  ]);

  // Source 1: Primary market data
  const source1 = new MockOracleSource('MarketData-1', new Map(basePrices));
  aggregator.addSource(source1, 1.0);

  // Source 2: Secondary with slight variation
  const source2Prices = new Map<string, number>();
  basePrices.forEach((price, symbol) => {
    source2Prices.set(symbol, price * (1 + (Math.random() - 0.5) * 0.002));
  });
  const source2 = new MockOracleSource('MarketData-2', source2Prices);
  aggregator.addSource(source2, 0.8);

  // Source 3: DEX aggregator with variation
  const source3Prices = new Map<string, number>();
  basePrices.forEach((price, symbol) => {
    source3Prices.set(symbol, price * (1 + (Math.random() - 0.5) * 0.003));
  });
  const source3 = new MockOracleSource('DEX-Aggregator', source3Prices);
  aggregator.addSource(source3, 0.6);

  return aggregator;
}

oracleWatchCommand
  .description('Stream real-time price updates for a symbol')
  .argument('<symbol>', 'Asset symbol (e.g. XLM, BTC)')
  .option('--network <type>', 'Network (testnet/mainnet)', 'testnet')
  .option('--interval <seconds>', 'Update interval in seconds', '5')
  .option('--json', 'Output stream as JSON instead of dashboard', false)
  .action(async (symbol, options) => {
    const upperSymbol = symbol.toUpperCase();
    const intervalMs = parseInt(options.interval) * 1000;
    const aggregator = createOracleAggregator();

    if (options.json) {
      console.log(
        JSON.stringify({
          status: 'started',
          symbol: upperSymbol,
          network: options.network,
          interval: parseInt(options.interval),
        })
      );

      let lastPrice: number | null = null;

      const fetchAndPrint = async () => {
        try {
          const result = await aggregator.getAggregatedPrice(upperSymbol);
          const change = lastPrice !== null ? result.price - lastPrice : 0;
          const changePercent =
            lastPrice !== null ? (change / lastPrice) * 100 : 0;

          console.log(
            JSON.stringify({
              symbol: upperSymbol,
              price: result.price,
              change: change,
              changePercent: changePercent,
              confidence: result.confidence,
              sourcesUsed: result.sourcesUsed.length,
              timestamp: new Date().toISOString(),
            })
          );

          lastPrice = result.price;
        } catch (err: any) {
          console.log(
            JSON.stringify({
              status: 'error',
              message: err.message,
              timestamp: new Date().toISOString(),
            })
          );
        }
      };

      fetchAndPrint();
      setInterval(fetchAndPrint, intervalMs);
      return;
    }

    // Dashboard mode
    const ui = new TerminalUI(`Galaxy Watch - Oracle [${upperSymbol}]`);

    const logBox = ui.createLogBox({
      row: 6,
      col: 0,
      rowSpan: 6,
      colSpan: 12,
      label: ' Price Updates ',
    });

    const priceChart = ui.createLineChart({
      row: 0,
      col: 0,
      rowSpan: 6,
      colSpan: 12,
      label: ` ${upperSymbol}/USD Price Trend `,
    });

    logBox.log(chalk.yellow(`[*] Monitoring oracle prices for ${upperSymbol}...`));
    logBox.log(chalk.gray(`[*] Update interval: ${options.interval}s`));
    logBox.log(chalk.gray(`[*] Press 'q' or 'Ctrl+C' to stop`));

    // Get source info
    const sources = aggregator.getSources();
    logBox.log(chalk.cyan(`[*] Active sources: ${sources.length}`));
    sources.forEach(source => {
      logBox.log(chalk.gray(`    └── ${source.name}`));
    });

    let lastPrice: number | null = null;

    const priceData = {
      title: upperSymbol,
      x: [] as string[],
      y: [] as number[],
      style: { line: 'yellow' },
    };

    const updatePrice = async () => {
      try {
        const result = await aggregator.getAggregatedPrice(upperSymbol);
        const currentPrice = result.price;
        const time = new Date().toLocaleTimeString();

        let indicator = '';
        let changeStr = '';

        if (lastPrice !== null) {
          const change = currentPrice - lastPrice;
          const changePercent = (change / lastPrice) * 100;

          if (change >= 0) {
            indicator = chalk.green('↑');
            changeStr = chalk.green(`+${changePercent.toFixed(4)}%`);
          } else {
            indicator = chalk.red('↓');
            changeStr = chalk.red(`${changePercent.toFixed(4)}%`);
          }
        }

        logBox.log(
          `${chalk.cyan(`[${time}]`)} ${upperSymbol}: ${chalk.bold(`$${currentPrice.toFixed(4)}`)} ${indicator} ${changeStr} | Sources: ${result.sourcesUsed.length}/${sources.length}`
        );

        lastPrice = currentPrice;

        // Update chart
        priceData.x.push(time);
        priceData.y.push(currentPrice);

        if (priceData.x.length > 20) {
          priceData.x.shift();
          priceData.y.shift();
        }

        priceChart.setData([priceData]);
        ui.render();
      } catch (err: any) {
        logBox.log(chalk.red(`[ERROR] ${err.message}`));
        ui.render();
      }
    };

    // Initial fetch
    await updatePrice();

    // Set up interval
    setInterval(updatePrice, intervalMs);
    ui.render();
  });

export { oracleWatchCommand };
