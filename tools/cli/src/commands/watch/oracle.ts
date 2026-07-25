// @ts-nocheck
/**
 * @fileoverview Oracle monitoring command
 * @description Streams real-time price updates from an on-chain pool when available,
 *   with a legacy aggregator fallback when no streamable pool is configured.
 * @author Galaxy DevKit Team
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { TerminalUI } from '../../utils/terminal-ui.js';
import { createOracleAggregator } from '../../utils/oracle-registry.js';
import { MedianStrategy } from '@galaxy-kj/core-oracles';
import { getBlendConfig } from '../../utils/protocol-registry.js';
import { timer, defer, of, from } from 'rxjs';
import { switchMap, catchError, timeout, retry } from 'rxjs/operators';

const oracleWatchCommand = new Command('oracle-watch')
  .description('Stream real-time price updates for a symbol')
  .argument('<symbol>', 'Asset symbol (e.g. XLM, BTC)')
  .option('--network <type>', 'Network (testnet/mainnet)', 'testnet')
  .option('--pool-id <id>', 'Stream price from this liquidity pool id')
  .option('--interval <seconds>', 'Update interval in seconds', '5')
  .option('--json', 'Output stream as JSON instead of dashboard', false)
  .action(async (symbol, options) => {
    const upperSymbol = symbol.toUpperCase();
    const intervalMs = parseInt(options.interval) * 1000;
    const poolId =
      options.poolId?.trim() ||
      getBlendConfig(options.network as 'testnet' | 'mainnet').contractAddresses.pool?.trim() ||
      '';

    if (poolId) {
      await runSseOracleWatch(upperSymbol, poolId, options);
      return;
    }

    const aggregator = await createOracleAggregator({ network: options.network });
    aggregator.setStrategy(new MedianStrategy());

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

      timer(0, intervalMs)
        .pipe(
          switchMap(() =>
            defer(() => from(fetchAndPrint())).pipe(
              timeout({ first: 10000, each: 10000 }),
              retry({ count: 2, delay: (_, retryCount) => timer(500 * retryCount) }),
              catchError(err => {
                console.error(err);
                return of(null);
              })
            )
          )
        )
        .subscribe();
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

    // Setup timer stream
    timer(0, intervalMs)
      .pipe(
        switchMap(() =>
          defer(() => from(updatePrice())).pipe(
            timeout({ first: 10000, each: 10000 }),
            retry({ count: 2, delay: (_, retryCount) => timer(500 * retryCount) }),
            catchError(err => {
              logBox.log(chalk.red(`[STREAM ERROR] ${err.message}`));
              ui.render();
              return of(null);
            })
          )
        )
      )
      .subscribe();
    ui.render();
  });

async function runSseOracleWatch(
  upperSymbol: string,
  poolId: string,
  options: { network: 'testnet' | 'mainnet'; json: boolean; interval: string }
) {
  const streamManager = new (await import('../../utils/stream-manager.js')).StreamManager({
    network: options.network,
  });
  const intervalMs = Math.max(1000, parseInt(options.interval, 10) * 1000);
  let lastPrice: number | null = null;

  const fetchPrice = async () => {
    const pool = await streamManager
      .getServer()
      .liquidityPools()
      .liquidityPool(poolId)
      .call();

    const reserves = (pool.reserves ?? []) as Array<{ asset: string; amount: string }>;
    if (reserves.length < 2) {
      throw new Error(`Pool ${poolId} does not expose two reserves`);
    }

    const base = reserves[0];
    const quote = reserves[1];
    const baseAmount = Number.parseFloat(base.amount);
    const quoteAmount = Number.parseFloat(quote.amount);
    if (!Number.isFinite(baseAmount) || !Number.isFinite(quoteAmount) || baseAmount <= 0) {
      throw new Error('Unable to derive price from pool reserves');
    }

    return {
      price: quoteAmount / baseAmount,
      reserveBase: base,
      reserveQuote: quote,
    };
  };

  const emit = (tick: {
    symbol: string;
    price?: number;
    change?: number;
    changePercent?: number;
    error?: string;
    timestamp: string;
  }) => {
    if (options.json) {
      console.log(JSON.stringify(tick));
      return;
    }
    console.log(
      chalk.cyan(`[${new Date(tick.timestamp).toLocaleTimeString()}]`) +
        ` ${upperSymbol}: ` +
        (tick.error ? chalk.red(tick.error) : chalk.bold(`$${tick.price?.toFixed(6) ?? '?'}`))
    );
  };

  emit({ symbol: upperSymbol, timestamp: new Date().toISOString() });

  timer(0, intervalMs)
    .pipe(
      switchMap(() =>
        defer(() => from(fetchPrice())).pipe(
          timeout({ first: 10000, each: 10000 }),
          retry({ count: 2, delay: (_, retryCount) => timer(500 * retryCount) }),
          catchError(err => {
            emit({
              symbol: upperSymbol,
              error: err?.message || 'Oracle stream error',
              timestamp: new Date().toISOString(),
            });
            return of(null);
          })
        )
      )
    )
    .subscribe(result => {
      if (!result) return;
      const change = lastPrice !== null ? result.price - lastPrice : 0;
      const changePercent =
        lastPrice !== null && lastPrice !== 0 ? (change / lastPrice) * 100 : 0;
      emit({
        symbol: upperSymbol,
        price: result.price,
        change,
        changePercent,
        timestamp: new Date().toISOString(),
      });
      lastPrice = result.price;
    });
}

export { oracleWatchCommand };
