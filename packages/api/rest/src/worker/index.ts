/**
 * @fileoverview Entrypoint for the PositionMonitorWorker process.
 * @description Runs separately from the REST API so polling does not
 *              duplicate when the API is horizontally scaled.
 *              Configurable via env:
 *                MONITOR_NETWORK              — 'testnet' | 'mainnet' (default testnet)
 *                MONITOR_EVAL_INTERVAL_MS     — default 60000
 *                MONITOR_RETRY_INTERVAL_MS    — default 60000
 *                MONITOR_BATCH_SIZE           — default 50
 * @author Galaxy DevKit Team
 * @since 2026-06-29
 */

import { config } from 'dotenv';
import { resolve } from 'path';

try {
  config({ path: resolve(__dirname, '../../../../../.env.local') });
} catch {
  // ignore
}

import { PositionMonitorWorker } from './position-monitor.worker';
import { StellarNetworkName } from '../types/monitoring-types';
import { TransactionMonitorWorker } from './transaction-monitor.worker';
import { ComplianceReportWorker } from './compliance-report.worker';

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

async function main(): Promise<void> {
  const worker = new PositionMonitorWorker({
    network: (process.env.MONITOR_NETWORK as StellarNetworkName) || 'testnet',
    evaluationIntervalMs: envInt('MONITOR_EVAL_INTERVAL_MS', 60_000),
    retryIntervalMs: envInt('MONITOR_RETRY_INTERVAL_MS', 60_000),
    batchSize: envInt('MONITOR_BATCH_SIZE', 50),
  });
  const transactionWorker = new TransactionMonitorWorker({
    network: (process.env.MONITOR_NETWORK as StellarNetworkName) || 'testnet',
    accountRefreshIntervalMs: envInt('TRANSACTION_MONITOR_ACCOUNT_REFRESH_MS', 30_000),
    maxConcurrency: envInt('TRANSACTION_MONITOR_CONCURRENCY', 16),
  });
  const complianceWorker = new ComplianceReportWorker(undefined, undefined, {
    pollIntervalMs: envInt('COMPLIANCE_SCHEDULER_INTERVAL_MS', 60_000),
    batchSize: envInt('COMPLIANCE_SCHEDULER_BATCH_SIZE', 50),
  });

  worker.start();
  await transactionWorker.start();
  complianceWorker.start();

  const shutdown = (signal: string): void => {
    console.log(`\n[monitor] received ${signal}, shutting down...`);
    worker.stop();
    transactionWorker.stop();
    complianceWorker.stop();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[monitor] fatal error in main:', err);
    process.exit(1);
  });
}

export { PositionMonitorWorker, TransactionMonitorWorker, ComplianceReportWorker };
