import { PositionMonitorWorker } from '../position-monitor.worker';
import { MonitoringAlertRepository } from '../../repositories/monitoring-alert.repository';
import { AlertEvaluator } from '../../services/monitoring/alert-evaluator';
import { ChannelDispatcher } from '../../services/monitoring/channels/channel-dispatcher';
import { ProtocolPool } from '../../services/monitoring/protocol-pool';
import { MonitoringAlert } from '../../types/monitoring-types';

function makeAlert(over: Partial<MonitoringAlert> = {}): MonitoringAlert {
  return {
    id: 'a1',
    userId: 'u1',
    name: 'guard',
    protocol: 'blend',
    accountAddress: 'GABC',
    network: 'testnet',
    alertType: 'health_factor_below',
    threshold: 1.5,
    channel: 'webhook',
    channelConfig: { url: 'https://x', secret: 'sixteenchars1234' },
    cooldownSeconds: 60,
    status: 'active',
    lastTriggeredAt: null,
    lastEvaluatedAt: null,
    lastHealthFactor: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

describe('PositionMonitorWorker.evaluationTick', () => {
  const silentLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

  function buildWorker(opts: {
    alerts: MonitoringAlert[];
    healthFactor: string;
    dispatchOk?: boolean;
  }) {
    const repo = {
      listActiveForEvaluation: jest.fn().mockResolvedValue(opts.alerts),
      markEvaluated: jest.fn().mockResolvedValue(undefined),
      createEvent: jest
        .fn()
        .mockImplementation(async (alertId: string) => ({
          id: 'evt-1',
          alertId,
          deliveryAttempts: 0,
        })),
      updateEventDelivery: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<MonitoringAlertRepository>;

    const protocolPool = {
      get: jest.fn().mockReturnValue({
        getHealthFactor: jest.fn().mockResolvedValue({
          value: opts.healthFactor,
          liquidationThreshold: '1',
          maxLTV: '0.8',
          isHealthy: opts.healthFactor === '∞' || Number(opts.healthFactor) >= 1,
        }),
      }),
    } as unknown as jest.Mocked<ProtocolPool>;

    const dispatcher = {
      dispatch: jest.fn().mockResolvedValue({
        success: opts.dispatchOk !== false,
        durationMs: 10,
        retryable: opts.dispatchOk === false,
        statusCode: opts.dispatchOk !== false ? 200 : 503,
        error: opts.dispatchOk === false ? 'HTTP 503' : undefined,
      }),
      computeNextRetry: jest.fn().mockReturnValue(new Date(Date.now() + 30_000)),
    } as unknown as jest.Mocked<ChannelDispatcher>;

    const worker = new PositionMonitorWorker(
      { network: 'testnet', evaluationIntervalMs: 60_000, retryIntervalMs: 60_000, batchSize: 10 },
      { repo, evaluator: new AlertEvaluator(), dispatcher, protocolPool, logger: silentLogger }
    );

    return { worker, repo, dispatcher, protocolPool };
  }

  beforeEach(() => jest.clearAllMocks());

  it('dispatches when an alert is below its threshold', async () => {
    const { worker, repo, dispatcher } = buildWorker({
      alerts: [makeAlert()],
      healthFactor: '1.2',
    });

    await worker.evaluationTick();

    expect(repo.markEvaluated).toHaveBeenCalledWith('a1', 1.2, true);
    expect(repo.createEvent).toHaveBeenCalledTimes(1);
    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
    expect(repo.updateEventDelivery).toHaveBeenCalledWith(
      'evt-1',
      expect.objectContaining({ deliveryStatus: 'delivered', deliveryAttempts: 1 })
    );
  });

  it('does not dispatch when above threshold but still records evaluation', async () => {
    const { worker, repo, dispatcher } = buildWorker({
      alerts: [makeAlert()],
      healthFactor: '2.0',
    });

    await worker.evaluationTick();

    expect(repo.markEvaluated).toHaveBeenCalledWith('a1', 2.0, false);
    expect(repo.createEvent).not.toHaveBeenCalled();
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('treats "∞" health factor as positive infinity (no trigger)', async () => {
    const { worker, repo } = buildWorker({
      alerts: [makeAlert()],
      healthFactor: '∞',
    });

    await worker.evaluationTick();

    expect(repo.markEvaluated).toHaveBeenCalledWith('a1', Number.POSITIVE_INFINITY, false);
  });

  it('respects cooldown after a recent trigger', async () => {
    const recent = new Date(Date.now() - 10_000);
    const { worker, dispatcher } = buildWorker({
      alerts: [makeAlert({ cooldownSeconds: 300, lastTriggeredAt: recent })],
      healthFactor: '1.2',
    });

    await worker.evaluationTick();

    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('marks delivery as retrying when dispatcher fails with retryable error', async () => {
    const { worker, repo } = buildWorker({
      alerts: [makeAlert()],
      healthFactor: '1.2',
      dispatchOk: false,
    });

    await worker.evaluationTick();

    expect(repo.updateEventDelivery).toHaveBeenCalledWith(
      'evt-1',
      expect.objectContaining({ deliveryStatus: 'retrying', deliveryAttempts: 1 })
    );
  });

  it('continues evaluating other alerts when one fails to fetch the health factor', async () => {
    const { worker, repo, protocolPool } = buildWorker({
      alerts: [makeAlert({ id: 'a1' }), makeAlert({ id: 'a2' })],
      healthFactor: '2.0',
    });

    const getHF = jest
      .fn()
      .mockRejectedValueOnce(new Error('rpc down'))
      .mockResolvedValueOnce({ value: '2.0', liquidationThreshold: '1', maxLTV: '0.8', isHealthy: true });
    (protocolPool.get as jest.Mock).mockReturnValue({ getHealthFactor: getHF });

    await worker.evaluationTick();

    expect(repo.markEvaluated).toHaveBeenCalledTimes(2);
    const calls = (repo.markEvaluated as jest.Mock).mock.calls.map((c) => c[0]).sort();
    expect(calls).toEqual(['a1', 'a2']);
  });

  it('start/stop is idempotent and clears intervals', () => {
    const { worker } = buildWorker({ alerts: [], healthFactor: '2' });
    worker.start();
    worker.start();
    worker.stop();
    worker.stop();
  });
});
