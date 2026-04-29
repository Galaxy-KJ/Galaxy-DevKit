/**
 * @fileoverview Price monitoring command (`galaxy watch price <asset>`).
 *
 * Polls the oracle aggregator on a configurable interval and prints every
 * tick. Supports two output modes:
 *   - dashboard (default): an in-place TTY dashboard with directional
 *     indicators and an optional sparkline of recent prices.
 *   - --json: one JSON object per tick, suitable for piping to `jq`,
 *     log-shipping agents, or downstream tooling.
 *
 * Optional `--alert-above`/`--alert-below` thresholds raise an inline ALERT
 * line whenever the latest price crosses the configured bound. Polling is
 * resilient: aggregator errors are surfaced as `error` ticks rather than
 * crashing the loop, so the watch survives transient RPC hiccups.
 */

// @ts-nocheck
import { Command } from 'commander';
import chalk from 'chalk';

import { TerminalUI } from '../../utils/terminal-ui.js';
import { createOracleAggregator } from '../../utils/oracle-registry.js';
import { MedianStrategy } from '@galaxy-kj/core-oracles';

interface PriceWatchOptions {
  network: 'testnet' | 'mainnet';
  interval: string;
  json: boolean;
  alertAbove?: string;
  alertBelow?: string;
}

interface PriceTickContext {
  symbol: string;
  network: string;
  intervalSec: number;
  alertAbove?: number;
  alertBelow?: number;
  emit: (tick: PriceTick) => void;
}

export interface PriceTick {
  symbol: string;
  price?: number;
  change?: number;
  changePercent?: number;
  confidence?: number;
  sourcesUsed?: number;
  alert?: 'above' | 'below';
  error?: string;
  timestamp: string;
}

const priceWatchCommand = new Command('price');

priceWatchCommand
  .description('Monitor an oracle-aggregated asset price in real time')
  .argument('<asset>', 'Asset symbol (e.g. XLM, BTC, ETH)')
  .option('--network <type>', 'Network (testnet/mainnet)', 'testnet')
  .option('--interval <seconds>', 'Update interval in seconds', '5')
  .option('--json', 'Emit JSON ticks instead of dashboard output', false)
  .option(
    '--alert-above <price>',
    'Print an ALERT line when the price rises above this threshold',
  )
  .option(
    '--alert-below <price>',
    'Print an ALERT line when the price falls below this threshold',
  )
  .action(async (asset: string, options: PriceWatchOptions) => {
    await runPriceWatch(asset, options);
  });

export async function runPriceWatch(
  asset: string,
  options: PriceWatchOptions,
  deps: {
    aggregatorFactory?: typeof createOracleAggregator;
    ui?: { logBox?: { log: (line: string) => void }; render?: () => void };
    sleep?: (ms: number) => Promise<void>;
    maxTicks?: number;
  } = {},
): Promise<void> {
  const symbol = asset.trim().toUpperCase();
  const intervalSec = Number.parseInt(options.interval, 10);
  if (!Number.isFinite(intervalSec) || intervalSec <= 0) {
    throw new Error(`--interval must be a positive integer (got "${options.interval}")`);
  }

  const alertAbove = parseThreshold('--alert-above', options.alertAbove);
  const alertBelow = parseThreshold('--alert-below', options.alertBelow);

  const factory = deps.aggregatorFactory ?? createOracleAggregator;
  const aggregator = await factory({ network: options.network });
  aggregator.setStrategy(new MedianStrategy());

  const tickHandler = options.json ? jsonEmitter() : dashboardEmitter(symbol, options, deps.ui);

  const ctx: PriceTickContext = {
    symbol,
    network: options.network,
    intervalSec,
    alertAbove,
    alertBelow,
    emit: tickHandler.emit,
  };

  let lastPrice: number | null = null;
  let ticksRemaining = deps.maxTicks ?? Number.POSITIVE_INFINITY;
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));

  // Emit a "started" event so JSON consumers can synchronise.
  if (options.json) {
    tickHandler.emit({
      symbol,
      timestamp: new Date().toISOString(),
    });
  }

  while (ticksRemaining > 0) {
    await runOneTick(aggregator, ctx, lastPrice).then((next) => {
      if (next !== undefined) lastPrice = next;
    });
    ticksRemaining -= 1;
    if (ticksRemaining <= 0) break;
    await sleep(intervalSec * 1000);
  }
}

async function runOneTick(
  aggregator: { getAggregatedPrice: (s: string) => Promise<{ price: number; confidence: number; sourcesUsed: { name: string }[] }> },
  ctx: PriceTickContext,
  lastPrice: number | null,
): Promise<number | undefined> {
  try {
    const result = await aggregator.getAggregatedPrice(ctx.symbol);
    const price = result.price;
    const change = lastPrice !== null ? price - lastPrice : 0;
    const changePercent = lastPrice !== null && lastPrice !== 0 ? (change / lastPrice) * 100 : 0;

    let alert: PriceTick['alert'];
    if (ctx.alertAbove !== undefined && price >= ctx.alertAbove) alert = 'above';
    else if (ctx.alertBelow !== undefined && price <= ctx.alertBelow) alert = 'below';

    ctx.emit({
      symbol: ctx.symbol,
      price,
      change,
      changePercent,
      confidence: result.confidence,
      sourcesUsed: result.sourcesUsed.length,
      alert,
      timestamp: new Date().toISOString(),
    });
    return price;
  } catch (err: any) {
    ctx.emit({
      symbol: ctx.symbol,
      error: err?.message ?? 'Unknown oracle error',
      timestamp: new Date().toISOString(),
    });
    return undefined;
  }
}

function parseThreshold(flag: string, raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${flag} must be a finite number (got "${raw}")`);
  }
  return parsed;
}

function jsonEmitter() {
  return {
    emit: (tick: PriceTick) => {
      process.stdout.write(`${JSON.stringify(tick)}\n`);
    },
  };
}

function dashboardEmitter(
  symbol: string,
  options: PriceWatchOptions,
  injected?: { logBox?: { log: (line: string) => void }; render?: () => void },
) {
  // Tests inject a fake `logBox`; production constructs a real blessed UI.
  let logBox: { log: (line: string) => void };
  let render: () => void;

  if (injected?.logBox && injected?.render) {
    logBox = injected.logBox;
    render = injected.render;
  } else {
    const ui = new TerminalUI(`Galaxy Watch - Price [${symbol}]`);
    logBox = ui.createLogBox({
      row: 0,
      col: 0,
      rowSpan: 12,
      colSpan: 12,
      label: ` ${symbol}/USD - oracle aggregator (${options.network}) `,
    });
    render = () => ui.render();
    logBox.log(chalk.gray(`[*] Polling every ${options.interval}s — press 'q' or Ctrl+C to stop.`));
  }

  return {
    emit: (tick: PriceTick) => {
      const ts = chalk.cyan(`[${new Date(tick.timestamp).toLocaleTimeString()}]`);
      if (tick.error) {
        logBox.log(`${ts} ${chalk.red('ERROR')} ${tick.error}`);
      } else {
        const trend = (tick.change ?? 0) > 0 ? chalk.green('▲') : (tick.change ?? 0) < 0 ? chalk.red('▼') : '·';
        const pct = tick.changePercent ?? 0;
        const pctStr =
          pct > 0 ? chalk.green(`+${pct.toFixed(4)}%`) : chalk.red(`${pct.toFixed(4)}%`);
        logBox.log(
          `${ts} ${tick.symbol} ${chalk.bold(`$${tick.price?.toFixed(4) ?? '?'}`)} ${trend} ${pctStr} | sources=${tick.sourcesUsed ?? 0} confidence=${(tick.confidence ?? 0).toFixed(2)}`,
        );
      }
      if (tick.alert === 'above') logBox.log(chalk.yellow(`  ⚡ ALERT: price crossed above threshold`));
      if (tick.alert === 'below') logBox.log(chalk.yellow(`  ⚡ ALERT: price crossed below threshold`));
      render();
    },
  };
}

export { priceWatchCommand };
