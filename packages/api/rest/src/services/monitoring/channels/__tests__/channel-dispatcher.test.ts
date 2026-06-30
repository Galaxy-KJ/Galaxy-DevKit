import { ChannelDispatcher, MAX_DELIVERY_ATTEMPTS } from '../channel-dispatcher';
import {
  AlertEventPayload,
  ChannelDeliveryResult,
  MonitoringAlert,
} from '../../../../types/monitoring-types';
import { INotificationChannel } from '../notification-channel';

function alert(channel: 'webhook' | 'email' = 'webhook'): MonitoringAlert {
  return {
    id: 'a1',
    userId: 'u1',
    name: 'n',
    protocol: 'blend',
    accountAddress: 'GABC',
    network: 'testnet',
    alertType: 'health_factor_below',
    threshold: 1,
    channel,
    channelConfig: { url: 'https://x', secret: 'sixteenchars1234' },
    cooldownSeconds: 60,
    status: 'active',
    lastTriggeredAt: null,
    lastEvaluatedAt: null,
    lastHealthFactor: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function payload(): AlertEventPayload {
  return {
    eventId: 'evt-1',
    alertId: 'a1',
    alertName: 'n',
    protocol: 'blend',
    accountAddress: 'GABC',
    network: 'testnet',
    alertType: 'health_factor_below',
    threshold: 1,
    observedValue: 0.5,
    triggeredAt: new Date().toISOString(),
  };
}

class FakeChannel implements INotificationChannel {
  readonly kind: 'webhook' | 'email';
  send = jest.fn<Promise<ChannelDeliveryResult>, [MonitoringAlert, AlertEventPayload]>();
  constructor(kind: 'webhook' | 'email') {
    this.kind = kind;
  }
}

describe('ChannelDispatcher', () => {
  it('routes to the matching channel by kind', async () => {
    const webhook = new FakeChannel('webhook');
    webhook.send.mockResolvedValue({ success: true, durationMs: 1, retryable: false });

    const dispatcher = new ChannelDispatcher([webhook]);
    const result = await dispatcher.dispatch(alert('webhook'), payload());

    expect(webhook.send).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
  });

  it('returns a terminal failure when no channel is registered for the kind', async () => {
    const dispatcher = new ChannelDispatcher([new FakeChannel('webhook')]);
    const result = await dispatcher.dispatch(alert('email'), payload());

    expect(result.success).toBe(false);
    expect(result.retryable).toBe(false);
    expect(result.error).toContain('email');
  });

  it('returns null next retry after MAX_DELIVERY_ATTEMPTS', () => {
    const dispatcher = new ChannelDispatcher([new FakeChannel('webhook')]);
    expect(dispatcher.computeNextRetry(MAX_DELIVERY_ATTEMPTS)).toBeNull();
  });

  it('returns a future Date for in-range attempt counts', () => {
    const dispatcher = new ChannelDispatcher([new FakeChannel('webhook')]);
    const next = dispatcher.computeNextRetry(1);
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBeGreaterThanOrEqual(Date.now());
  });
});
