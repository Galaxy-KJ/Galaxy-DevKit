/**
 * @fileoverview Type definitions for real-time position monitoring & alerts
 * @description Domain types for monitoring_alerts and alert_events.
 *              Backs Issue #306 / Roadmap #53.
 * @author Galaxy DevKit Team
 * @since 2026-06-29
 */

export type AlertStatus = 'active' | 'paused' | 'archived';
export type AlertType = 'health_factor_below';
export type AlertChannel = 'webhook' | 'email';
export type AlertDeliveryStatus = 'pending' | 'delivered' | 'failed' | 'retrying';
export type StellarNetworkName = 'testnet' | 'mainnet';

/**
 * Webhook channel configuration persisted in `monitoring_alerts.channel_config`.
 * The `secret` is shared with the receiver to verify the HMAC signature header.
 */
export interface WebhookChannelConfig {
  url: string;
  secret: string;
  headers?: Record<string, string>;
}

/**
 * Email channel configuration. The current MVP only emits the structure;
 * dispatch is implemented by a future EmailChannel.
 */
export interface EmailChannelConfig {
  to: string;
  subject?: string;
}

export type ChannelConfig = WebhookChannelConfig | EmailChannelConfig;

export interface MonitoringAlert {
  id: string;
  userId: string;
  name: string;
  protocol: string;
  accountAddress: string;
  network: StellarNetworkName;
  alertType: AlertType;
  threshold: number;
  channel: AlertChannel;
  channelConfig: ChannelConfig;
  cooldownSeconds: number;
  status: AlertStatus;
  lastTriggeredAt: Date | null;
  lastEvaluatedAt: Date | null;
  lastHealthFactor: number | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMonitoringAlertInput {
  name: string;
  protocol: string;
  accountAddress: string;
  network?: StellarNetworkName;
  alertType: AlertType;
  threshold: number;
  channel: AlertChannel;
  channelConfig: ChannelConfig;
  cooldownSeconds?: number;
  metadata?: Record<string, unknown>;
}

export interface UpdateMonitoringAlertInput {
  name?: string;
  threshold?: number;
  channelConfig?: ChannelConfig;
  cooldownSeconds?: number;
  status?: AlertStatus;
  metadata?: Record<string, unknown>;
}

export interface ListAlertsFilter {
  userId: string;
  status?: AlertStatus;
  protocol?: string;
  limit?: number;
  offset?: number;
}

export interface AlertEvent {
  id: string;
  alertId: string;
  triggeredAt: Date;
  healthFactorValue: number | null;
  payload: AlertEventPayload;
  deliveryStatus: AlertDeliveryStatus;
  deliveryAttempts: number;
  lastAttemptAt: Date | null;
  nextRetryAt: Date | null;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Canonical payload sent to notification channels. Receivers should treat
 * `eventId` as the idempotency key.
 */
export interface AlertEventPayload {
  eventId: string;
  alertId: string;
  alertName: string;
  protocol: string;
  accountAddress: string;
  network: StellarNetworkName;
  alertType: AlertType;
  threshold: number;
  observedValue: number | null;
  triggeredAt: string;
}

/**
 * Result returned by a notification channel after attempting delivery.
 * Drives retry / dead-letter logic in the worker.
 */
export interface ChannelDeliveryResult {
  success: boolean;
  statusCode?: number;
  durationMs: number;
  error?: string;
  retryable: boolean;
}

export enum MonitoringErrorCode {
  ALERT_NOT_FOUND = 'ALERT_NOT_FOUND',
  ALERT_FORBIDDEN = 'ALERT_FORBIDDEN',
  ALERT_VALIDATION_ERROR = 'ALERT_VALIDATION_ERROR',
  ALERT_CHANNEL_UNSUPPORTED = 'ALERT_CHANNEL_UNSUPPORTED',
  ALERT_PROTOCOL_UNSUPPORTED = 'ALERT_PROTOCOL_UNSUPPORTED',
}

export class MonitoringError extends Error {
  constructor(
    public code: MonitoringErrorCode,
    message: string,
    public statusCode: number = 400,
    public details: Record<string, unknown> = {}
  ) {
    super(message);
    this.name = 'MonitoringError';
  }
}
