import { SupabaseClient } from '@supabase/supabase-js';
import { MonitoringAlertRepository } from '../monitoring-alert.repository';
import {
  AlertEventPayload,
  CreateMonitoringAlertInput,
} from '../../types/monitoring-types';

/**
 * Builds a chainable Supabase mock. Each terminal method (`.single`,
 * `.maybeSingle`, awaited `.update/.delete/.range`) resolves to whatever the
 * test pre-loaded into `responses`. The order of queue entries matches the
 * order of terminal awaits in the test.
 */
function makeClient(responses: Array<{ data?: unknown; error?: unknown; count?: number }>) {
  const queue = [...responses];
  const next = () => queue.shift() ?? { data: null, error: null };

  const chain = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockImplementation(() => Promise.resolve(next())),
    limit: jest.fn().mockImplementation(() => Promise.resolve(next())),
    single: jest.fn().mockImplementation(() => Promise.resolve(next())),
    maybeSingle: jest.fn().mockImplementation(() => Promise.resolve(next())),
    then: undefined as unknown,
  };

  // For awaited chains that DON'T end on .single/.range (e.g. update().eq()),
  // make the chain itself thenable so `await query` resolves with the next response.
  (chain as unknown as { then: (resolve: (v: unknown) => void) => void }).then = (
    resolve
  ) => resolve(next());

  const client = {
    from: jest.fn().mockReturnValue(chain),
  } as unknown as SupabaseClient;

  return { client, chain };
}

const baseRow = {
  id: '11111111-1111-1111-1111-111111111111',
  user_id: 'user-1',
  name: 'Blend HF guard',
  protocol: 'blend',
  account_address: 'GA' + 'A'.repeat(54),
  network: 'testnet',
  alert_type: 'health_factor_below',
  threshold: '1.5',
  channel: 'webhook',
  channel_config: { url: 'https://x', secret: 'sixteenchars1234' },
  cooldown_seconds: 300,
  status: 'active',
  last_triggered_at: null,
  last_evaluated_at: null,
  last_health_factor: null,
  metadata: {},
  created_at: '2026-06-29T00:00:00Z',
  updated_at: '2026-06-29T00:00:00Z',
};

const validInput: CreateMonitoringAlertInput = {
  name: 'Blend HF guard',
  protocol: 'blend',
  accountAddress: baseRow.account_address,
  network: 'testnet',
  alertType: 'health_factor_below',
  threshold: 1.5,
  channel: 'webhook',
  channelConfig: { url: 'https://hook.example.com', secret: 'sixteenchars1234' },
  cooldownSeconds: 300,
  metadata: {},
};

describe('MonitoringAlertRepository', () => {
  it('maps a created row into the domain MonitoringAlert', async () => {
    const { client } = makeClient([{ data: baseRow, error: null }]);
    const repo = new MonitoringAlertRepository(client);

    const alert = await repo.create('user-1', validInput);

    expect(alert.id).toBe(baseRow.id);
    expect(alert.userId).toBe('user-1');
    expect(alert.threshold).toBe(1.5);
    expect(alert.createdAt).toBeInstanceOf(Date);
  });

  it('throws when create returns an error', async () => {
    const { client } = makeClient([{ data: null, error: { message: 'duplicate' } }]);
    const repo = new MonitoringAlertRepository(client);

    await expect(repo.create('user-1', validInput)).rejects.toThrow('Failed to create monitoring alert');
  });

  it('returns null when findByIdForUser does not match', async () => {
    const { client } = makeClient([{ data: null, error: null }]);
    const repo = new MonitoringAlertRepository(client);

    const result = await repo.findByIdForUser('missing', 'user-1');
    expect(result).toBeNull();
  });

  it('returns the alert when findByIdForUser matches', async () => {
    const { client } = makeClient([{ data: baseRow, error: null }]);
    const repo = new MonitoringAlertRepository(client);

    const alert = await repo.findByIdForUser(baseRow.id, 'user-1');
    expect(alert?.id).toBe(baseRow.id);
  });

  it('lists alerts with pagination defaults', async () => {
    const { client } = makeClient([{ data: [baseRow], error: null }]);
    const repo = new MonitoringAlertRepository(client);

    const list = await repo.list({ userId: 'user-1' });
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(baseRow.id);
  });

  it('lists alerts with status and protocol filters', async () => {
    const { client, chain } = makeClient([{ data: [baseRow], error: null }]);
    const repo = new MonitoringAlertRepository(client);

    await repo.list({
      userId: 'user-1',
      status: 'active',
      protocol: 'blend',
      limit: 10,
      offset: 5,
    });

    expect(chain.eq).toHaveBeenCalledWith('status', 'active');
    expect(chain.eq).toHaveBeenCalledWith('protocol', 'blend');
    expect(chain.range).toHaveBeenCalledWith(5, 14);
  });

  it('short-circuits update when no patch fields are present', async () => {
    const { client } = makeClient([{ data: baseRow, error: null }]);
    const repo = new MonitoringAlertRepository(client);

    const result = await repo.update(baseRow.id, 'user-1', {});
    expect(result?.id).toBe(baseRow.id);
  });

  it('applies patch fields on update', async () => {
    const { client, chain } = makeClient([
      { data: { ...baseRow, threshold: '1.2', name: 'renamed' }, error: null },
    ]);
    const repo = new MonitoringAlertRepository(client);

    const result = await repo.update(baseRow.id, 'user-1', {
      threshold: 1.2,
      name: 'renamed',
      cooldownSeconds: 120,
      status: 'paused',
      metadata: { source: 'test' },
      channelConfig: { url: 'https://y', secret: 'sixteenchars1234' },
    });

    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        threshold: 1.2,
        name: 'renamed',
        cooldown_seconds: 120,
        status: 'paused',
      })
    );
    expect(result?.threshold).toBe(1.2);
  });

  it('returns null on update when no row was touched', async () => {
    const { client } = makeClient([{ data: null, error: null }]);
    const repo = new MonitoringAlertRepository(client);

    const result = await repo.update(baseRow.id, 'user-1', { name: 'x' });
    expect(result).toBeNull();
  });

  it('returns true when delete affects a row', async () => {
    const { client } = makeClient([{ error: null, count: 1 }]);
    const repo = new MonitoringAlertRepository(client);

    const ok = await repo.delete(baseRow.id, 'user-1');
    expect(ok).toBe(true);
  });

  it('returns false when delete affects no rows', async () => {
    const { client } = makeClient([{ error: null, count: 0 }]);
    const repo = new MonitoringAlertRepository(client);

    const ok = await repo.delete(baseRow.id, 'user-1');
    expect(ok).toBe(false);
  });

  it('lists active alerts for the worker scoped to network', async () => {
    const { client, chain } = makeClient([{ data: [baseRow], error: null }]);
    const repo = new MonitoringAlertRepository(client);

    const alerts = await repo.listActiveForEvaluation('testnet', 25);
    expect(alerts).toHaveLength(1);
    expect(chain.eq).toHaveBeenCalledWith('status', 'active');
    expect(chain.eq).toHaveBeenCalledWith('network', 'testnet');
    expect(chain.limit).toHaveBeenCalledWith(25);
  });

  it('records evaluation with last_triggered_at when didTrigger=true', async () => {
    const { client, chain } = makeClient([{ error: null }]);
    const repo = new MonitoringAlertRepository(client);

    await repo.markEvaluated(baseRow.id, 1.2, true);

    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        last_health_factor: 1.2,
        last_triggered_at: expect.any(String),
        last_evaluated_at: expect.any(String),
      })
    );
  });

  it('records evaluation without last_triggered_at when didTrigger=false', async () => {
    const { client, chain } = makeClient([{ error: null }]);
    const repo = new MonitoringAlertRepository(client);

    await repo.markEvaluated(baseRow.id, 2.5, false);

    const updateArg = (chain.update as jest.Mock).mock.calls[0][0];
    expect(updateArg.last_triggered_at).toBeUndefined();
    expect(updateArg.last_health_factor).toBe(2.5);
  });

  it('persists alert events and maps the row back', async () => {
    const eventRow = {
      id: 'evt-1',
      alert_id: baseRow.id,
      triggered_at: '2026-06-29T12:00:00Z',
      health_factor_value: '1.2',
      payload: {},
      delivery_status: 'pending',
      delivery_attempts: 0,
      last_attempt_at: null,
      next_retry_at: null,
      last_error: null,
      created_at: '2026-06-29T12:00:00Z',
      updated_at: '2026-06-29T12:00:00Z',
    };
    const { client } = makeClient([{ data: eventRow, error: null }]);
    const repo = new MonitoringAlertRepository(client);

    const payload: AlertEventPayload = {
      eventId: 'evt-1',
      alertId: baseRow.id,
      alertName: 'n',
      protocol: 'blend',
      accountAddress: baseRow.account_address,
      network: 'testnet',
      alertType: 'health_factor_below',
      threshold: 1.5,
      observedValue: 1.2,
      triggeredAt: '2026-06-29T12:00:00Z',
    };

    const event = await repo.createEvent(baseRow.id, payload, 1.2);
    expect(event.id).toBe('evt-1');
    expect(event.healthFactorValue).toBe(1.2);
  });

  it('updates delivery status with retry metadata', async () => {
    const { client, chain } = makeClient([{ error: null }]);
    const repo = new MonitoringAlertRepository(client);

    const nextRetry = new Date('2026-06-29T12:05:00Z');
    await repo.updateEventDelivery('evt-1', {
      deliveryStatus: 'retrying',
      deliveryAttempts: 2,
      lastError: 'HTTP 503',
      nextRetryAt: nextRetry,
    });

    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        delivery_status: 'retrying',
        delivery_attempts: 2,
        last_error: 'HTTP 503',
        next_retry_at: nextRetry.toISOString(),
      })
    );
  });

  it('returns null events when alert is not owned by user', async () => {
    const { client } = makeClient([{ data: null, error: null }]);
    const repo = new MonitoringAlertRepository(client);

    const events = await repo.listEventsForUser('a1', 'user-1');
    expect(events).toBeNull();
  });

  it('returns the events list when alert is owned by user', async () => {
    const eventRow = {
      id: 'evt-1',
      alert_id: baseRow.id,
      triggered_at: '2026-06-29T12:00:00Z',
      health_factor_value: '1.2',
      payload: {},
      delivery_status: 'delivered',
      delivery_attempts: 1,
      last_attempt_at: '2026-06-29T12:00:01Z',
      next_retry_at: null,
      last_error: null,
      created_at: '2026-06-29T12:00:00Z',
      updated_at: '2026-06-29T12:00:01Z',
    };
    const { client } = makeClient([
      { data: baseRow, error: null }, // findByIdForUser
      { data: [eventRow], error: null }, // events
    ]);
    const repo = new MonitoringAlertRepository(client);

    const events = await repo.listEventsForUser(baseRow.id, 'user-1');
    expect(events).toHaveLength(1);
    expect(events?.[0].deliveryStatus).toBe('delivered');
  });
});
