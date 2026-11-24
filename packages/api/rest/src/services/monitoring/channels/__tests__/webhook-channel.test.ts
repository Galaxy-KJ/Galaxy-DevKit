import { createHmac } from 'crypto';
import { WebhookChannel } from '../webhook-channel';
import { AlertEventPayload, MonitoringAlert } from '../../../../types/monitoring-types';

// Mock the SSRF guard so webhook-channel tests are not affected by DNS.
// Individual SSRF scenarios are tested in ssrf-guard.test.ts.
jest.mock('../../../../utils/ssrf-guard', () => ({
  assertWebhookUrlSafe: jest.fn().mockResolvedValue(undefined),
  SsrfBlockedError: class SsrfBlockedError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'SsrfBlockedError';
    }
  },
}));

import { assertWebhookUrlSafe, SsrfBlockedError } from '../../../../utils/ssrf-guard';

const mockAssertWebhookUrlSafe = assertWebhookUrlSafe as jest.MockedFunction<typeof assertWebhookUrlSafe>;

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
  beforeEach(() => {
    mockAssertWebhookUrlSafe.mockResolvedValue(undefined);
  });

  afterEach(() => {
    mockAssertWebhookUrlSafe.mockReset();
  });

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

  // ── SSRF guard integration ──────────────────────────────────────────────────

  it('returns a terminal failure when the SSRF guard rejects the URL', async () => {
    mockAssertWebhookUrlSafe.mockRejectedValueOnce(
      new SsrfBlockedError('Webhook URL hostname "internal.corp" resolves to a private/reserved address (10.0.0.1) and is not allowed')
    );
    const fetchMock = jest.fn();
    const channel = new WebhookChannel({ fetchImpl: fetchMock as unknown as typeof fetch });

    const result = await channel.send(makeAlert(), makePayload());

    expect(result.success).toBe(false);
    expect(result.retryable).toBe(false);
    expect(result.error).toContain('private/reserved address');
    // fetch must not have been called after the SSRF check failed
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls assertWebhookUrlSafe with the configured URL before each send', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    const channel = new WebhookChannel({ fetchImpl: fetchMock as unknown as typeof fetch });

    await channel.send(makeAlert(), makePayload());

    expect(mockAssertWebhookUrlSafe).toHaveBeenCalledWith('https://hook.example.com/alerts');
  });

  // ── Redirect handling ───────────────────────────────────────────────────────

  it('treats a 301 redirect as a terminal SSRF-prevention failure (redirect:manual)', async () => {
    const redirectResponse = new Response(null, {
      status: 301,
      headers: { Location: 'http://169.254.169.254/latest/meta-data' },
    });
    const fetchMock = jest.fn().mockResolvedValue(redirectResponse);
    const channel = new WebhookChannel({ fetchImpl: fetchMock as unknown as typeof fetch });

    const result = await channel.send(makeAlert(), makePayload());

    expect(result.success).toBe(false);
    expect(result.retryable).toBe(false);
    expect(result.statusCode).toBe(301);
    expect(result.error).toMatch(/redirect/i);
  });

  it('treats a 302 redirect as a terminal failure (redirect:manual)', async () => {
    const redirectResponse = new Response(null, {
      status: 302,
      headers: { Location: 'http://10.0.0.1/secret' },
    });
    const fetchMock = jest.fn().mockResolvedValue(redirectResponse);
    const channel = new WebhookChannel({ fetchImpl: fetchMock as unknown as typeof fetch });

    const result = await channel.send(makeAlert(), makePayload());

    expect(result.success).toBe(false);
    expect(result.retryable).toBe(false);
    expect(result.statusCode).toBe(302);
  });

  it('sends the request with redirect:manual so fetch never auto-follows redirects', async () => {
    const fetchMock = jest.fn().mockResolvedValue(new Response('ok', { status: 200 }));
    const channel = new WebhookChannel({ fetchImpl: fetchMock as unknown as typeof fetch });

    await channel.send(makeAlert(), makePayload());

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.redirect).toBe('manual');
  });
});
