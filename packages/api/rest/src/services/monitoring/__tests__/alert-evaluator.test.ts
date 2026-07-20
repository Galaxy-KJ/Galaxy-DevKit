/**
 * @fileoverview Unit tests for the extended AlertEvaluator (issue #341)
 */

import { AlertEvaluator, EvaluationContext } from '../alert-evaluator';
import { MonitoringAlert, AlertType } from '../../../types/monitoring-types';

function makeAlert(overrides: Partial<MonitoringAlert> = {}): MonitoringAlert {
  return {
    id: 'a1',
    userId: 'u1',
    name: 'Test Alert',
    protocol: 'blend',
    accountAddress: 'GABC',
    network: 'testnet',
    alertType: 'health_factor_below',
    threshold: 1.2,
    channel: 'webhook',
    channelConfig: { url: 'https://example.com/hook', secret: 'sixteenchars1234' },
    cooldownSeconds: 60,
    status: 'active',
    lastTriggeredAt: null,
    lastEvaluatedAt: null,
    lastHealthFactor: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeCtx(overrides: Partial<EvaluationContext> = {}): EvaluationContext {
  return {
    observedValue: 0.8,
    now: new Date('2026-07-01T12:00:00Z'),
    recentDeliveryCount: 0,
    lastDedupeFingerprint: null,
    ...overrides,
  };
}

const evaluator = new AlertEvaluator();

// ── Position alerts ───────────────────────────────────────────────────────────

describe('health_factor_below', () => {
  it('triggers when observed < threshold', () => {
    const r = evaluator.evaluate(makeAlert({ threshold: 1.2 }), makeCtx({ observedValue: 0.9 }));
    expect(r.shouldTrigger).toBe(true);
    expect(r.reason).toBe('condition_met');
  });

  it('does not trigger when observed >= threshold', () => {
    const r = evaluator.evaluate(makeAlert({ threshold: 1.2 }), makeCtx({ observedValue: 1.5 }));
    expect(r.shouldTrigger).toBe(false);
    expect(r.reason).toBe('condition_not_met');
  });
});

// ── Price alerts ──────────────────────────────────────────────────────────────

describe('price_above', () => {
  it('triggers when price > threshold', () => {
    const r = evaluator.evaluate(
      makeAlert({ alertType: 'price_above', threshold: 0.10 }),
      makeCtx({ observedValue: 0.15 })
    );
    expect(r.shouldTrigger).toBe(true);
  });

  it('does not trigger when price <= threshold', () => {
    const r = evaluator.evaluate(
      makeAlert({ alertType: 'price_above', threshold: 0.10 }),
      makeCtx({ observedValue: 0.09 })
    );
    expect(r.shouldTrigger).toBe(false);
  });
});

describe('price_below', () => {
  it('triggers when price < threshold', () => {
    const r = evaluator.evaluate(
      makeAlert({ alertType: 'price_below', threshold: 0.10 }),
      makeCtx({ observedValue: 0.05 })
    );
    expect(r.shouldTrigger).toBe(true);
  });
});

describe('price_change_pct', () => {
  it('triggers when absolute % change >= threshold', () => {
    const r = evaluator.evaluate(
      makeAlert({ alertType: 'price_change_pct', threshold: 5 }),
      makeCtx({ observedValue: -7 })  // -7% change
    );
    expect(r.shouldTrigger).toBe(true);
  });

  it('does not trigger when change is within threshold', () => {
    const r = evaluator.evaluate(
      makeAlert({ alertType: 'price_change_pct', threshold: 5 }),
      makeCtx({ observedValue: 3 })
    );
    expect(r.shouldTrigger).toBe(false);
  });
});

// ── System alerts ─────────────────────────────────────────────────────────────

describe('system alert types', () => {
  const systemTypes: AlertType[] = [
    'api_error_rate_above',
    'oracle_staleness_above',
    'horizon_latency_above',
  ];

  systemTypes.forEach((alertType) => {
    it(`${alertType}: triggers when value > threshold`, () => {
      const r = evaluator.evaluate(
        makeAlert({ alertType, threshold: 100 }),
        makeCtx({ observedValue: 150 })
      );
      expect(r.shouldTrigger).toBe(true);
    });

    it(`${alertType}: does not trigger when value <= threshold`, () => {
      const r = evaluator.evaluate(
        makeAlert({ alertType, threshold: 100 }),
        makeCtx({ observedValue: 80 })
      );
      expect(r.shouldTrigger).toBe(false);
    });
  });
});

// ── Activity alerts ───────────────────────────────────────────────────────────

describe('activity alert types', () => {
  it('transaction_amount_above triggers when amount > threshold', () => {
    const r = evaluator.evaluate(
      makeAlert({ alertType: 'transaction_amount_above', threshold: 10_000 }),
      makeCtx({ observedValue: 50_000 })
    );
    expect(r.shouldTrigger).toBe(true);
  });

  it('unusual_transaction_pattern triggers when anomaly score >= threshold', () => {
    const r = evaluator.evaluate(
      makeAlert({ alertType: 'unusual_transaction_pattern', threshold: 0.8 }),
      makeCtx({ observedValue: 0.95 })
    );
    expect(r.shouldTrigger).toBe(true);
  });
});

// ── Observation guard ─────────────────────────────────────────────────────────

describe('observation unavailable', () => {
  it('returns observation_unavailable when observedValue is null', () => {
    const r = evaluator.evaluate(makeAlert(), makeCtx({ observedValue: null }));
    expect(r.shouldTrigger).toBe(false);
    expect(r.reason).toBe('observation_unavailable');
  });
});

// ── Cooldown ──────────────────────────────────────────────────────────────────

describe('cooldown', () => {
  it('suppresses trigger within cooldown window', () => {
    const now = new Date('2026-07-01T12:00:00Z');
    const lastTriggered = new Date(now.getTime() - 30_000); // 30s ago, cooldown=60s
    const r = evaluator.evaluate(
      makeAlert({ cooldownSeconds: 60, lastTriggeredAt: lastTriggered }),
      makeCtx({ observedValue: 0.5, now })
    );
    expect(r.shouldTrigger).toBe(false);
    expect(r.reason).toBe('cooldown_active');
  });

  it('allows trigger after cooldown expires', () => {
    const now = new Date('2026-07-01T12:00:00Z');
    const lastTriggered = new Date(now.getTime() - 120_000); // 120s ago, cooldown=60s
    const r = evaluator.evaluate(
      makeAlert({ cooldownSeconds: 60, lastTriggeredAt: lastTriggered }),
      makeCtx({ observedValue: 0.5, now })
    );
    expect(r.shouldTrigger).toBe(true);
  });
});

// ── Rate limiting ─────────────────────────────────────────────────────────────

describe('rate limiting', () => {
  it('suppresses when recentDeliveryCount >= maxDeliveries', () => {
    const r = evaluator.evaluate(
      makeAlert({ rateLimit: { maxDeliveries: 3, windowSeconds: 300 } }),
      makeCtx({ observedValue: 0.5, recentDeliveryCount: 3 })
    );
    expect(r.shouldTrigger).toBe(false);
    expect(r.reason).toBe('rate_limited');
  });

  it('allows when recentDeliveryCount < maxDeliveries', () => {
    const r = evaluator.evaluate(
      makeAlert({ rateLimit: { maxDeliveries: 3, windowSeconds: 300 } }),
      makeCtx({ observedValue: 0.5, recentDeliveryCount: 2 })
    );
    expect(r.shouldTrigger).toBe(true);
  });

  it('passes when no rateLimit is configured', () => {
    const r = evaluator.evaluate(
      makeAlert({ rateLimit: undefined }),
      makeCtx({ observedValue: 0.5, recentDeliveryCount: 99 })
    );
    expect(r.shouldTrigger).toBe(true);
  });
});

// ── Deduplication ─────────────────────────────────────────────────────────────

describe('deduplication', () => {
  it('suppresses when fingerprint matches last', () => {
    const alert = makeAlert({
      deduplication: { windowSeconds: 300, fingerprintFields: ['alertId', 'alertType', 'observedValue'] },
    });
    const now = new Date('2026-07-01T12:00:00Z');
    const ctx1 = makeCtx({ observedValue: 0.5, now });

    const first = evaluator.evaluate(alert, ctx1);
    expect(first.shouldTrigger).toBe(true);
    expect(first.fingerprint).toBeDefined();

    // Same window, same value → deduplicated
    const ctx2 = makeCtx({
      observedValue: 0.5,
      now,
      lastDedupeFingerprint: first.fingerprint!,
    });
    const second = evaluator.evaluate(alert, ctx2);
    expect(second.shouldTrigger).toBe(false);
    expect(second.reason).toBe('deduplicated');
  });

  it('does not deduplicate when fingerprint differs (different value)', () => {
    const alert = makeAlert({
      deduplication: { windowSeconds: 300 },
    });
    const now = new Date('2026-07-01T12:00:00Z');

    const first = evaluator.evaluate(alert, makeCtx({ observedValue: 0.5, now }));
    expect(first.shouldTrigger).toBe(true);

    // Different observed value → different fingerprint → not deduplicated
    const second = evaluator.evaluate(alert, makeCtx({
      observedValue: 0.3,
      now,
      lastDedupeFingerprint: first.fingerprint!,
    }));
    expect(second.shouldTrigger).toBe(true);
  });

  it('passes when no deduplication is configured', () => {
    const alert = makeAlert({ deduplication: undefined });
    const ctx = makeCtx({ observedValue: 0.5, lastDedupeFingerprint: 'anything' });
    const r = evaluator.evaluate(alert, ctx);
    expect(r.shouldTrigger).toBe(true);
  });
});

// ── Template rendering ────────────────────────────────────────────────────────

describe('buildPayload with template', () => {
  it('renders title and body from template variables', () => {
    const alert = makeAlert({
      name: 'Low HF Alert',
      protocol: 'blend',
      alertType: 'health_factor_below',
      threshold: 1.2,
      template: {
        titleTemplate: '{{alertName}} triggered on {{protocol}}',
        bodyTemplate: 'Health factor {{observedValue}} is below {{threshold}} at {{triggeredAt}}',
      },
    });

    const now = new Date('2026-07-01T12:00:00.000Z');
    const payload = evaluator.buildPayload(alert, 0.8, 'evt-abc', now);

    expect(payload.title).toBe('Low HF Alert triggered on blend');
    expect(payload.body).toContain('0.8');
    expect(payload.body).toContain('1.2');
    expect(payload.body).toContain('2026-07-01T12:00:00.000Z');
  });

  it('leaves unknown template variables as-is', () => {
    const alert = makeAlert({
      template: {
        titleTemplate: '{{unknownVar}} alert',
        bodyTemplate: 'value: {{observedValue}}',
      },
    });
    const now = new Date();
    const payload = evaluator.buildPayload(alert, 0.5, 'evt-1', now);
    expect(payload.title).toBe('{{unknownVar}} alert');
  });

  it('omits title/body when no template is configured', () => {
    const alert = makeAlert({ template: undefined });
    const payload = evaluator.buildPayload(alert, 0.5, 'evt-1', new Date());
    expect(payload.title).toBeUndefined();
    expect(payload.body).toBeUndefined();
  });

  it('sets all required payload fields', () => {
    const alert = makeAlert();
    const now = new Date();
    const payload = evaluator.buildPayload(alert, 0.9, 'evt-xyz', now);
    expect(payload.eventId).toBe('evt-xyz');
    expect(payload.alertId).toBe(alert.id);
    expect(payload.alertType).toBe(alert.alertType);
    expect(payload.observedValue).toBe(0.9);
    expect(payload.threshold).toBe(alert.threshold);
    expect(payload.network).toBe('testnet');
  });
});

// ── WebSocket channel ─────────────────────────────────────────────────────────

describe('WebSocketChannel', () => {
  it('emits to the configured topic and returns success', async () => {
    // Inline test to avoid cross-file import complexity
    const { WebSocketChannel } = await import('../channels/websocket-channel');

    const emittedTo: string[] = [];
    const emittedEvents: string[] = [];
    const mockEmitter = {
      to: (room: string) => ({
        emit: (event: string) => {
          emittedTo.push(room);
          emittedEvents.push(event);
        },
      }),
    };

    const channel = new WebSocketChannel(mockEmitter);
    const alert = makeAlert({
      channel: 'websocket',
      channelConfig: { topic: 'alert:a1' },
    });
    const payload = evaluator.buildPayload(alert, 0.5, 'evt-ws-1', new Date());

    const result = await channel.send(alert, payload);

    expect(result.success).toBe(true);
    expect(result.retryable).toBe(false);
    expect(emittedTo).toContain('alert:a1');
    expect(emittedEvents).toContain('monitoring.alert.triggered');
  });

  it('returns failure when emitter throws', async () => {
    const { WebSocketChannel } = await import('../channels/websocket-channel');

    const brokenEmitter = {
      to: () => ({
        emit: () => { throw new Error('socket disconnected'); },
      }),
    };

    const channel = new WebSocketChannel(brokenEmitter);
    const alert = makeAlert({ channel: 'websocket', channelConfig: { topic: 'x' } });
    const payload = evaluator.buildPayload(alert, 0.5, 'evt-2', new Date());

    const result = await channel.send(alert, payload);
    expect(result.success).toBe(false);
    expect(result.error).toContain('socket disconnected');
  });
});

// ── MonitoringAlertService validation ─────────────────────────────────────────

describe('MonitoringAlertService validation', () => {
  const { MonitoringAlertService } = require('../monitoring-alert.service');
  const { MonitoringError } = require('../../../types/monitoring-types');

  const mockRepo = {
    create: jest.fn(),
    list: jest.fn(),
    findByIdForUser: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    listEventsForUser: jest.fn(),
  };

  const service = new MonitoringAlertService(mockRepo);

  const baseInput = {
    name: 'Price Watch',
    protocol: 'blend',
    accountAddress: 'GABC12345678901234567890123456789012345678901234567890123',
    alertType: 'price_above' as const,
    threshold: 0.15,
    channel: 'websocket' as const,
    channelConfig: { topic: 'user:u1' },
  };

  it('rejects unsupported alert type', async () => {
    await expect(
      service.create('u1', { ...baseInput, alertType: 'bad_type' as never })
    ).rejects.toThrow(MonitoringError);
  });

  it('rejects unsupported protocol', async () => {
    await expect(
      service.create('u1', { ...baseInput, protocol: 'unknown_protocol' })
    ).rejects.toThrow(MonitoringError);
  });

  it('rejects email channel (not yet implemented)', async () => {
    await expect(
      service.create('u1', {
        ...baseInput,
        channel: 'email' as const,
        channelConfig: { to: 'test@example.com' },
      })
    ).rejects.toThrow(MonitoringError);
  });

  it('rejects websocket channel with missing topic', async () => {
    await expect(
      service.create('u1', {
        ...baseInput,
        channel: 'websocket' as const,
        channelConfig: { topic: '' },
      })
    ).rejects.toThrow(MonitoringError);
  });

  it('rejects invalid deduplication windowSeconds', async () => {
    await expect(
      service.create('u1', {
        ...baseInput,
        deduplication: { windowSeconds: 0 },
      })
    ).rejects.toThrow(MonitoringError);
  });

  it('rejects invalid rateLimit maxDeliveries', async () => {
    await expect(
      service.create('u1', {
        ...baseInput,
        rateLimit: { maxDeliveries: 0, windowSeconds: 300 },
      })
    ).rejects.toThrow(MonitoringError);
  });

  it('calls repo.create when all validation passes', async () => {
    const expected = { id: 'new-id', ...baseInput };
    mockRepo.create.mockResolvedValue(expected);

    const result = await service.create('u1', baseInput);
    expect(mockRepo.create).toHaveBeenCalledWith('u1', baseInput);
    expect(result).toBe(expected);
  });

  it('getAlertCategory classifies correctly', () => {
    expect(MonitoringAlertService.getAlertCategory('price_above')).toBe('price');
    expect(MonitoringAlertService.getAlertCategory('health_factor_below')).toBe('position');
    expect(MonitoringAlertService.getAlertCategory('api_error_rate_above')).toBe('system');
    expect(MonitoringAlertService.getAlertCategory('transaction_amount_above')).toBe('activity');
    expect(MonitoringAlertService.getAlertCategory('unknown' as never)).toBe('unknown');
  });
});