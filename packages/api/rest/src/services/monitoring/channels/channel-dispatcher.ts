/**
 * @fileoverview Routes an alert to the right channel implementation and computes
 *               the next retry timestamp using exponential backoff with jitter.
 * @author Galaxy DevKit Team
 * @since 2026-06-29
 */

import {
  AlertChannel,
  AlertEventPayload,
  ChannelDeliveryResult,
  MonitoringAlert,
} from '../../../types/monitoring-types';
import { INotificationChannel } from './notification-channel';
import { WebhookChannel } from './webhook-channel';

export const MAX_DELIVERY_ATTEMPTS = 5;
const BASE_BACKOFF_SECONDS = 30;

export class ChannelDispatcher {
  private readonly channels: Map<AlertChannel, INotificationChannel>;

  constructor(channels?: INotificationChannel[]) {
    const list = channels ?? [new WebhookChannel()];
    this.channels = new Map(list.map((c) => [c.kind as AlertChannel, c]));
  }

  async dispatch(alert: MonitoringAlert, payload: AlertEventPayload): Promise<ChannelDeliveryResult> {
    const channel = this.channels.get(alert.channel);
    if (!channel) {
      return {
        success: false,
        durationMs: 0,
        retryable: false,
        error: `No implementation registered for channel "${alert.channel}"`,
      };
    }
    return channel.send(alert, payload);
  }

  /**
   * Exponential backoff with full jitter. Returns null when the attempt limit
   * is exhausted — the caller should then mark the event as terminally failed.
   */
  computeNextRetry(attempts: number): Date | null {
    if (attempts >= MAX_DELIVERY_ATTEMPTS) return null;
    const exponential = BASE_BACKOFF_SECONDS * 2 ** (attempts - 1);
    const jittered = Math.floor(Math.random() * exponential);
    return new Date(Date.now() + jittered * 1_000);
  }
}
