/**
 * @fileoverview Position watch command (`galaxy watch position <address>`).
 * Monitors Blend health factor in real time via polling with a live terminal UI.
 */

// @ts-nocheck
import { Command } from 'commander';
import chalk from 'chalk';
import * as StellarSDK from '@stellar/stellar-sdk';
import { TerminalUI } from '../../utils/terminal-ui.js';
import { BlendProtocol } from '../../../../../packages/core/defi-protocols/src/protocols/blend/blend-protocol.js';
import { getCliBlendConfig } from '../blend/config.js';

export interface PositionWatchOptions {
  network: 'testnet' | 'mainnet';
  interval: string;
  json: boolean;
}

export interface PositionTick {
  address: string;
  healthFactor?: string;
  liquidationThreshold?: string;
  isHealthy?: boolean;
  status?: 'green' | 'yellow' | 'red';
  error?: string;
  timestamp: string;
}

const positionWatchCommand = new Command('position');

positionWatchCommand
  .description('Monitor Blend lending position health factor in real time')
  .argument('<address>', 'Stellar account address')
  .option('--network <type>', 'Network (testnet/mainnet)', 'testnet')
  .option('--interval <seconds>', 'Polling interval in seconds', '10')
  .option('--json', 'Emit JSON ticks instead of dashboard output', false)
  .action(async (address: string, options: PositionWatchOptions) => {
    await runPositionWatch(address, options);
  });

export async function runPositionWatch(
  address: string,
  options: PositionWatchOptions,
  deps: {
    blendFactory?: (mainnet: boolean) => BlendProtocol;
    ui?: { logBox?: { log: (line: string) => void }; render?: () => void };
    sleep?: (ms: number) => Promise<void>;
    maxTicks?: number;
  } = {},
): Promise<void> {
  const cleanAddress = address.trim();
  if (!StellarSDK.StrKey.isValidEd25519PublicKey(cleanAddress)) {
    throw new Error('Invalid Stellar public key');
  }

  const intervalSec = Number.parseInt(options.interval, 10);
  if (!Number.isFinite(intervalSec) || intervalSec <= 0) {
    throw new Error(`--interval must be a positive integer (got "${options.interval}")`);
  }

  const mainnet = options.network === 'mainnet';
  const blendFactory = deps.blendFactory ?? ((useMainnet: boolean) => {
    const blend = new BlendProtocol(getCliBlendConfig(useMainnet));
    return blend;
  });
  const blend = blendFactory(mainnet);
  await blend.initialize();

  const emit = options.json
    ? jsonEmitter()
    : dashboardEmitter(cleanAddress, options, deps.ui).emit;

  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let ticksRemaining = deps.maxTicks ?? Number.POSITIVE_INFINITY;

  if (options.json) {
    emit({
      address: cleanAddress,
      timestamp: new Date().toISOString(),
    });
  }

  while (ticksRemaining > 0) {
    try {
      const health = await blend.getHealthFactor(cleanAddress);
      const value = Number.parseFloat(health.value);
      const status = classifyHealth(value);

      emit({
        address: cleanAddress,
        healthFactor: health.value,
        liquidationThreshold: health.liquidationThreshold,
        isHealthy: health.isHealthy,
        status,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      emit({
        address: cleanAddress,
        error: err?.message ?? 'Failed to fetch health factor',
        timestamp: new Date().toISOString(),
      });
    }

    ticksRemaining -= 1;
    if (ticksRemaining <= 0) break;
    await sleep(intervalSec * 1000);
  }
}

export function classifyHealth(value: number): 'green' | 'yellow' | 'red' {
  if (!Number.isFinite(value) || value === Infinity) return 'green';
  if (value > 1.5) return 'green';
  if (value > 1.2) return 'yellow';
  return 'red';
}

function jsonEmitter() {
  return (tick: PositionTick) => {
    process.stdout.write(`${JSON.stringify(tick)}\n`);
  };
}

function dashboardEmitter(
  address: string,
  options: PositionWatchOptions,
  injected?: { logBox?: { log: (line: string) => void }; render?: () => void },
) {
  let logBox: { log: (line: string) => void };
  let render: () => void;

  if (injected?.logBox && injected?.render) {
    logBox = injected.logBox;
    render = injected.render;
  } else {
    const ui = new TerminalUI(`Galaxy Watch - Position ${address.substring(0, 8)}...`);
    logBox = ui.createLogBox({
      row: 0,
      col: 0,
      rowSpan: 12,
      colSpan: 12,
      label: ` Blend health [${options.network}] `,
    });
    render = () => ui.render();
    logBox.log(chalk.gray(`[*] Polling every ${options.interval}s — press 'q' or Ctrl+C to stop.`));
  }

  return {
    emit: (tick: PositionTick) => {
      const ts = chalk.cyan(`[${new Date(tick.timestamp).toLocaleTimeString()}]`);
      if (tick.error) {
        logBox.log(`${ts} ${chalk.red('ERROR')} ${tick.error}`);
      } else {
        const color =
          tick.status === 'green' ? chalk.green
            : tick.status === 'yellow' ? chalk.yellow
              : chalk.red;
        const healthyLabel = tick.isHealthy ? chalk.green('healthy') : chalk.red('at risk');
        logBox.log(
          `${ts} HF=${color(tick.healthFactor ?? '?')} threshold=${tick.liquidationThreshold ?? 'n/a'} ${healthyLabel}`,
        );
      }
      render();
    },
  };
}

export { positionWatchCommand };
