/**
 * @fileoverview Liquidity pool monitoring command (`galaxy watch pool <id>`).
 *
 * Polls Horizon's `/liquidity_pools/{id}` endpoint on a fixed interval and
 * surfaces reserve and price changes. Horizon does not expose a streaming
 * endpoint for pools, so polling is the only option — the loop is rebuilt to
 * survive transient RPC errors and prints diagnostic ALERTs whenever
 * reserves change between ticks.
 *
 * Supports both `--json` (one JSON tick per line) and dashboard output, in
 * keeping with the rest of the `galaxy watch` family.
 */

// @ts-nocheck
import { Command } from 'commander';
import chalk from 'chalk';
import * as StellarSDK from '@stellar/stellar-sdk';

import { TerminalUI } from '../../utils/terminal-ui.js';
import { StreamManager } from '../../utils/stream-manager.js';

const POOL_ID_REGEX = /^[a-f0-9]{64}$/i;

export interface PoolReserve {
  asset: string;
  amount: string;
}

export interface PoolTick {
  poolId: string;
  reserves?: PoolReserve[];
  totalShares?: string;
  feeBp?: number;
  changes?: Array<{ asset: string; from: string; to: string }>;
  error?: string;
  timestamp: string;
}

interface PoolWatchOptions {
  network: 'testnet' | 'mainnet';
  interval: string;
  json: boolean;
}

interface PoolPollDeps {
  streamManager?: StreamManager;
  ui?: { logBox?: { log: (line: string) => void }; render?: () => void };
  sleep?: (ms: number) => Promise<void>;
  maxTicks?: number;
}

const poolWatchCommand = new Command('pool');

poolWatchCommand
  .description('Monitor a Stellar liquidity pool in real time')
  .argument('<poolId>', '64-character hex pool id (from Horizon)')
  .option('--network <type>', 'Network (testnet/mainnet)', 'testnet')
  .option('--interval <seconds>', 'Polling interval in seconds', '5')
  .option('--json', 'Emit JSON ticks instead of dashboard output', false)
  .action(async (poolId: string, options: PoolWatchOptions) => {
    await runPoolWatch(poolId, options);
  });

export async function runPoolWatch(
  poolId: string,
  options: PoolWatchOptions,
  deps: PoolPollDeps = {},
): Promise<void> {
  const cleanId = poolId.trim().toLowerCase();
  if (!POOL_ID_REGEX.test(cleanId)) {
    throw new Error(
      `Invalid pool id "${poolId}": expected 64 hex characters as returned by Horizon`,
    );
  }

  const intervalSec = Number.parseInt(options.interval, 10);
  if (!Number.isFinite(intervalSec) || intervalSec <= 0) {
    throw new Error(`--interval must be a positive integer (got "${options.interval}")`);
  }

  const stream = deps.streamManager ?? new StreamManager({ network: options.network });
  const handler = options.json ? jsonHandler() : dashboardHandler(cleanId, options, deps.ui);

  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let ticksRemaining = deps.maxTicks ?? Number.POSITIVE_INFINITY;
  let previous: PoolReserve[] | undefined;

  if (options.json) {
    handler.emit({ poolId: cleanId, timestamp: new Date().toISOString() });
  }

  while (ticksRemaining > 0) {
    const next = await pollOnce(stream, cleanId);
    if (next.error) {
      handler.emit(next);
    } else {
      const changes = previous ? diffReserves(previous, next.reserves ?? []) : [];
      handler.emit({ ...next, changes });
      previous = next.reserves;
    }
    ticksRemaining -= 1;
    if (ticksRemaining <= 0) break;
    await sleep(intervalSec * 1000);
  }
}

async function pollOnce(stream: StreamManager, poolId: string): Promise<PoolTick> {
  try {
    const server: StellarSDK.Horizon.Server = stream.getServer();
    // The SDK exposes liquidityPools() with `.liquidityPool(id)` for a single
    // pool lookup. Result includes reserves[] (asset/amount) and total_shares.
    const pool: any = await server
      .liquidityPools()
      .liquidityPool(poolId)
      .call();

    const reserves: PoolReserve[] = (pool.reserves ?? []).map((r: any) => ({
      asset: r.asset,
      amount: r.amount,
    }));

    return {
      poolId,
      reserves,
      totalShares: pool.total_shares,
      feeBp: pool.fee_bp,
      timestamp: new Date().toISOString(),
    };
  } catch (err: any) {
    return {
      poolId,
      error: err?.message ?? String(err),
      timestamp: new Date().toISOString(),
    };
  }
}

export function diffReserves(prev: PoolReserve[], curr: PoolReserve[]): PoolTick['changes'] {
  const out: NonNullable<PoolTick['changes']> = [];
  for (const c of curr) {
    const p = prev.find((x) => x.asset === c.asset);
    if (p && p.amount !== c.amount) {
      out.push({ asset: c.asset, from: p.amount, to: c.amount });
    }
  }
  return out;
}

function jsonHandler() {
  return {
    emit: (tick: PoolTick) => process.stdout.write(`${JSON.stringify(tick)}\n`),
  };
}

function dashboardHandler(
  poolId: string,
  options: PoolWatchOptions,
  injected?: { logBox?: { log: (line: string) => void }; render?: () => void },
) {
  let logBox: { log: (line: string) => void };
  let render: () => void;

  if (injected?.logBox && injected?.render) {
    logBox = injected.logBox;
    render = injected.render;
  } else {
    const ui = new TerminalUI(`Galaxy Watch - Pool ${poolId.substring(0, 8)}…`);
    logBox = ui.createLogBox({
      row: 0,
      col: 0,
      rowSpan: 12,
      colSpan: 12,
      label: ` Liquidity pool reserves (${options.network}) `,
    });
    render = () => ui.render();
    logBox.log(chalk.gray(`[*] Polling every ${options.interval}s — press 'q' or Ctrl+C to stop.`));
  }

  return {
    emit: (tick: PoolTick) => {
      const ts = chalk.cyan(`[${new Date(tick.timestamp).toLocaleTimeString()}]`);
      if (tick.error) {
        logBox.log(`${ts} ${chalk.red('ERROR')} ${tick.error}`);
      } else {
        const reservesLine = (tick.reserves ?? [])
          .map((r) => `${chalk.yellow(r.asset)}=${chalk.bold(r.amount)}`)
          .join(' | ');
        logBox.log(
          `${ts} reserves[ ${reservesLine} ] shares=${tick.totalShares ?? '?'} feeBp=${tick.feeBp ?? '?'}`,
        );
        for (const c of tick.changes ?? []) {
          logBox.log(chalk.magenta(`  Δ ${c.asset}: ${c.from} → ${c.to}`));
        }
      }
      render();
    },
  };
}

export { poolWatchCommand };
