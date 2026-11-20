/**
 * @fileoverview Webhook notification channel.
 * @description POSTs the alert payload to a user-configured URL with an
 *              HMAC-SHA256 signature so the receiver can verify authenticity
 *              and an idempotency key (payload.eventId) so retries don't
 *              double-process. Distinguishes retryable failures (network,
 *              5xx, 408, 429) from terminal ones (other 4xx).
 * @author Galaxy DevKit Team
 * @since 2026-06-29
 */

import { createHmac } from 'crypto';
import {
  AlertEventPayload,
  ChannelDeliveryResult,
  MonitoringAlert,
  WebhookChannelConfig,
} from '../../../types/monitoring-types';
import { assertWebhookUrlSafe, SsrfBlockedError } from '../../../utils/ssrf-guard';
import { INotificationChannel } from './notification-channel';

export interface WebhookChannelOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 5_000;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

export class WebhookChannel implements INotificationChannel {
  readonly kind = 'webhook' as const;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: WebhookChannelOptions = {}) {
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async send(alert: MonitoringAlert, payload: AlertEventPayload): Promise<ChannelDeliveryResult> {
    const config = alert.channelConfig as WebhookChannelConfig;

    // Resolve the destination hostname and reject any private/reserved address.
    // This catches DNS rebinding and hostnames that weren't literal IPs at
    // validation time. We also disable redirect following so a 3xx to a
    // private address cannot bypass this check.
    try {
      await assertWebhookUrlSafe(config.url);
    } catch (err) {
      if (err instanceof SsrfBlockedError) {
        return {
          success: false,
          durationMs: 0,
          retryable: false,
          error: err.message,
        };
      }
      throw err;
    }

    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1_000).toString();
    const signature = this.sign(config.secret, timestamp, body);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const start = Date.now();

    try {
      const response = await this.fetchImpl(config.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'GalaxyDevKit-Monitoring/1.0',
          'X-Galaxy-Event': 'monitoring.alert.triggered',
          'X-Galaxy-Event-Id': payload.eventId,
          'X-Galaxy-Timestamp': timestamp,
          'X-Galaxy-Signature': `sha256=${signature}`,
          ...(config.headers ?? {}),
        },
        body,
        // 'manual' means the fetch will NOT follow redirects. A 3xx response is
        // returned as-is so we can inspect the Location header ourselves.
        // This prevents a public URL from bouncing the request to an internal host.
        redirect: 'manual',
        signal: controller.signal,
      });

      const durationMs = Date.now() - start;

      // redirect:'manual' surfaces 3xx responses rather than following them.
      // Treat any redirect as a terminal SSRF-prevention failure — we don't
      // validate what the Location header points to, so we refuse to follow it.
      if (response.status >= 300 && response.status < 400) {
        return {
          success: false,
          statusCode: response.status,
          durationMs,
          retryable: false,
          error: `Redirect responses are not followed (HTTP ${response.status})`,
        };
      }

      const success = response.ok;
      return {
        success,
        statusCode: response.status,
        durationMs,
        retryable: !success && RETRYABLE_STATUS_CODES.has(response.status),
        error: success ? undefined : `HTTP ${response.status}`,
      };
    } catch (err) {
      const durationMs = Date.now() - start;
      const isAbort = err instanceof Error && err.name === 'AbortError';
      return {
        success: false,
        durationMs,
        retryable: true,
        error: isAbort ? `timeout after ${this.timeoutMs}ms` : (err as Error).message,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * HMAC-SHA256(secret, `${timestamp}.${body}`). Receivers must reconstruct the
   * same string and use a constant-time compare against the X-Galaxy-Signature header.
   */
  private sign(secret: string, timestamp: string, body: string): string {
    return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
  }
}
