import { createHmac } from 'crypto';
import { WebhookChannel } from '../webhook-channel';
import { AlertEventPayload, MonitoringAlert } from '../../../../types/monitoring-types';

function makeAlert(): MonitoringAlert {
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
    channelConfig: {
      url: 'https://hook.example.com/alerts',
      secret: 'sixteen-bytes-secret',
    },
    cooldownSeconds: 300,
    status: 'active',
    lastTriggeredAt: null,
    lastEvaluatedAt: null,
    lastHealthFactor: null,
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makePayload(): AlertEventPayload {
  return {
    eventId: 'evt-1',
    alertId: 'alert-1',
    alertName: 'Blend HF guard',
    protocol: 'blend',
    accountAddress: 'GABC',
    network: 'testnet',
    alertType: 'health_factor_below',
    threshold: 1.5,
    observedValue: 1.2,
    triggeredAt: '2026-06-29T12:00:00.000Z',
  };
}

describe('WebhookChannel', () => {
  it('POSTs the payload with a valid HMAC signature header', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    const channel = new WebhookChannel({ fetchImpl: fetchMock as unknown as typeof fetch });

    const result = await channel.send(makeAlert(), makePayload());

    expect(result.success).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://hook.example.com/alerts');
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['X-Galaxy-Event-Id']).toBe('evt-1');

    const timestamp = headers['X-Galaxy-Timestamp'];
    const signature = headers['X-Galaxy-Signature'];
    const expected =
      'sha256=' + createHmac('sha256', 'sixteen-bytes-secret').update(`${timestamp}.${init.body}`).digest('hex');
    expect(signature).toBe(expected);
  });

  it('marks 5xx responses as retryable', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response('boom', { status: 503 }));
    const channel = new WebhookChannel({ fetchImpl: fetchMock as unknown as typeof fetch });

    const result = await channel.send(makeAlert(), makePayload());

    expect(result.success).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.statusCode).toBe(503);
    expect(result.error).toBe('HTTP 503');
  });

  it('marks 404 (and other non-listed 4xx) as terminal', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response('nope', { status: 404 }));
    const channel = new WebhookChannel({ fetchImpl: fetchMock as unknown as typeof fetch });

    const result = await channel.send(makeAlert(), makePayload());

    expect(result.success).toBe(false);
    expect(result.retryable).toBe(false);
  });

  it('treats 429 as retryable (rate limited)', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response('slow down', { status: 429 }));
    const channel = new WebhookChannel({ fetchImpl: fetchMock as unknown as typeof fetch });

    const result = await channel.send(makeAlert(), makePayload());

    expect(result.retryable).toBe(true);
  });

  it('marks network errors as retryable', async () => {
    const fetchMock = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    const channel = new WebhookChannel({ fetchImpl: fetchMock as unknown as typeof fetch });

    const result = await channel.send(makeAlert(), makePayload());

    expect(result.success).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.error).toBe('ECONNRESET');
  });

  it('aborts with a timeout error when the request hangs', async () => {
    const fetchMock = jest.fn().mockImplementation(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          });
        })
    );
    const channel = new WebhookChannel({ fetchImpl: fetchMock as unknown as typeof fetch, timeoutMs: 10 });

    const result = await channel.send(makeAlert(), makePayload());

    expect(result.success).toBe(false);
    expect(result.retryable).toBe(true);
    expect(result.error).toContain('timeout');
  });
});
