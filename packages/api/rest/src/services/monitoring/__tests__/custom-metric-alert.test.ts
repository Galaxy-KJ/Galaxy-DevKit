/**
 * @fileoverview Integration tests for custom metric alerts.
 * @description Verifies that an alert rule can target a custom metric and fires
 *              through the existing channel dispatcher.
 * @author Galaxy DevKit Team
 * @since 2026-09-01
 */

import { AlertEvaluator } from '../alert-evaluator';
import { ChannelDispatcher } from '../channels/channel-dispatcher';
import { INotificationChannel } from '../channels/notification-channel';
import {
  AlertEventPayload,
  ChannelDeliveryResult,
  MonitoringAlert,
} from '../../../types/monitoring-types';
import { MonitoringAlertService } from '../monitoring-alert.service';

describe('Custom Metric Alert Integration', () => {
  let evaluator: AlertEvaluator;
  let mockChannel: jest.Mocked<INotificationChannel>;
  let dispatcher: ChannelDispatcher;
  let service: MonitoringAlertService;
  let mockRepo: any;

  const customMetricAlert: MonitoringAlert = {
    id: '44444444-4444-4444-4444-444444444444',
    userId: 'user-1',
    name: 'High Swap Volume Alert',
    protocol: 'custom',
    accountAddress: 'GA' + 'B'.repeat(54),
    network: 'testnet',
    alertType: 'custom_metric',
    customMetricId: '33333333-3333-3333-3333-333333333333',
    threshold: 1000,
    channel: 'webhook',
    channelConfig: { url: 'https://webhook.site/test', secret: 'secret1234567890' },
    cooldownSeconds: 300,
    status: 'active',
    lastTriggeredAt: null,
    lastEvaluatedAt: null,
    lastHealthFactor: null,
    metadata: {
      metricName: 'avg_swap_size_usd',
      condition: 'above',
    },
    createdAt: new Date('2026-09-01T00:00:00Z'),
    updatedAt: new Date('2026-09-01T00:00:00Z'),
  };

  beforeEach(() => {
    evaluator = new AlertEvaluator();
    mockChannel = {
      kind: 'webhook',
      send: jest.fn().mockResolvedValue({
        success: true,
        statusCode: 200,
        durationMs: 42,
        retryable: false,
      } as ChannelDeliveryResult),
    };
    dispatcher = new ChannelDispatcher([mockChannel]);

    mockRepo = {
      create: jest.fn().mockResolvedValue(customMetricAlert),
      findByIdForUser: jest.fn().mockResolvedValue(customMetricAlert),
      list: jest.fn().mockResolvedValue([customMetricAlert]),
    };
    service = new MonitoringAlertService(mockRepo);
  });

  it('validates and creates an alert targeting a custom metric', async () => {
    const created = await service.create('user-1', {
      name: 'High Swap Volume Alert',
      protocol: 'custom',
      accountAddress: customMetricAlert.accountAddress,
      alertType: 'custom_metric',
      customMetricId: '33333333-3333-3333-3333-333333333333',
      threshold: 1000,
      channel: 'webhook',
      channelConfig: { url: 'https://webhook.site/test', secret: 'secret1234567890' },
    });

    expect(created.id).toBe(customMetricAlert.id);
    expect(created.alertType).toBe('custom_metric');
    expect(mockRepo.create).toHaveBeenCalledTimes(1);
  });

  it('evaluates condition_met when custom metric value crosses threshold', () => {
    const decision = evaluator.evaluate(customMetricAlert, {
      observedValue: 1250.5,
      now: new Date('2026-09-01T12:00:00Z'),
    });

    expect(decision.shouldTrigger).toBe(true);
    expect(decision.reason).toBe('condition_met');
  });

  it('evaluates condition_not_met when custom metric value is below threshold', () => {
    const decision = evaluator.evaluate(customMetricAlert, {
      observedValue: 750.0,
      now: new Date('2026-09-01T12:00:00Z'),
    });

    expect(decision.shouldTrigger).toBe(false);
    expect(decision.reason).toBe('condition_not_met');
  });

  it('fires and dispatches through the existing channel dispatcher when triggered', async () => {
    const now = new Date('2026-09-01T12:00:00Z');
    const decision = evaluator.evaluate(customMetricAlert, {
      observedValue: 1500,
      now,
    });
    expect(decision.shouldTrigger).toBe(true);

    const payload: AlertEventPayload = evaluator.buildPayload(
      customMetricAlert,
      1500,
      'event-123',
      now
    );

    const delivery = await dispatcher.dispatch(customMetricAlert, payload);

    expect(delivery.success).toBe(true);
    expect(mockChannel.send).toHaveBeenCalledTimes(1);
    expect(mockChannel.send).toHaveBeenCalledWith(
      customMetricAlert,
      expect.objectContaining({
        alertId: customMetricAlert.id,
        alertType: 'custom_metric',
        observedValue: 1500,
        threshold: 1000,
      })
    );
  });
});
