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
        signal: controller.signal,
      });

      const durationMs = Date.now() - start;
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
