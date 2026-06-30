import { AlertEvaluator } from '../alert-evaluator';
import { MonitoringAlert } from '../../../types/monitoring-types';

function baseAlert(overrides: Partial<MonitoringAlert> = {}): MonitoringAlert {
  return {
    id: 'alert-1',
    userId: 'user-1',
    name: 'Blend HF guard',
    protocol: 'blend',
    accountAddress: 'GABC',
    network: 'testnet',
    alertType: 'health_factor_below',
    threshold: 1.5,
    channel: 'webhook',
    channelConfig: { url: 'https://example.com', secret: 'sixteenchars1234' },
    cooldownSeconds: 300,
    status: 'active',
    lastTriggeredAt: null,
    lastEvaluatedAt: null,
    lastHealthFactor: null,
    metadata: {},
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('AlertEvaluator', () => {
  const evaluator = new AlertEvaluator();
  const now = new Date('2026-06-29T12:00:00Z');

  it('triggers when health factor is below threshold and never triggered before', () => {
    const decision = evaluator.evaluate(baseAlert(), { observedValue: 1.2, now });
    expect(decision).toEqual({ shouldTrigger: true, reason: 'condition_met' });
  });

  it('does not trigger when health factor is equal to threshold', () => {
    const decision = evaluator.evaluate(baseAlert(), { observedValue: 1.5, now });
    expect(decision.shouldTrigger).toBe(false);
    expect(decision.reason).toBe('condition_not_met');
  });

  it('does not trigger when health factor is above threshold', () => {
    const decision = evaluator.evaluate(baseAlert(), { observedValue: 2.0, now });
    expect(decision.shouldTrigger).toBe(false);
  });

  it('does not trigger when observed value is null', () => {
    const decision = evaluator.evaluate(baseAlert(), { observedValue: null, now });
    expect(decision).toEqual({ shouldTrigger: false, reason: 'observation_unavailable' });
  });

  it('respects cooldown window after a recent trigger', () => {
    const alert = baseAlert({
      cooldownSeconds: 300,
      lastTriggeredAt: new Date('2026-06-29T11:59:00Z'),
    });
    const decision = evaluator.evaluate(alert, { observedValue: 1.0, now });
    expect(decision).toEqual({ shouldTrigger: false, reason: 'cooldown_active' });
  });

  it('triggers again after cooldown elapses', () => {
    const alert = baseAlert({
      cooldownSeconds: 60,
      lastTriggeredAt: new Date('2026-06-29T11:58:00Z'),
    });
    const decision = evaluator.evaluate(alert, { observedValue: 1.0, now });
    expect(decision.shouldTrigger).toBe(true);
  });

  it('never triggers when observed value is Infinity (no debt position)', () => {
    const decision = evaluator.evaluate(baseAlert(), { observedValue: Number.POSITIVE_INFINITY, now });
    expect(decision.shouldTrigger).toBe(false);
  });
});
