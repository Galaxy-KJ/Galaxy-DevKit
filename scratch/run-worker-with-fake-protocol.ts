/**
 * Smoke-test entrypoint for PositionMonitorWorker.
 *
 * Wires a fake ProtocolPool that returns a low health factor so the worker
 * triggers the alert without touching Stellar RPC.
 *
 * Run from packages/api/rest:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   npx ts-node ../../../scratch/run-worker-with-fake-protocol.ts
 */

import { PositionMonitorWorker } from '../packages/api/rest/src/worker/position-monitor.worker';
import { ProtocolPool } from '../packages/api/rest/src/services/monitoring/protocol-pool';

const fakeHealthFactor = process.env.FAKE_HEALTH_FACTOR ?? '0.9';

class FakeProtocolPool extends ProtocolPool {
  get(): any {
    return {
      getHealthFactor: async () => ({
        value: fakeHealthFactor,
        liquidationThreshold: '1',
        maxLTV: '0.8',
        isHealthy: Number(fakeHealthFactor) >= 1,
      }),
    };
  }
}

const worker = new PositionMonitorWorker(
  {
    network: 'testnet',
    evaluationIntervalMs: 5_000,
    retryIntervalMs: 30_000,
    batchSize: 50,
  },
  { protocolPool: new FakeProtocolPool() }
);

worker.start();
console.log(`[smoke-worker] running with fake HF=${fakeHealthFactor}`);

const shutdown = (sig: string) => {
  console.log(`\n[smoke-worker] ${sig} received, stopping...`);
  worker.stop();
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
