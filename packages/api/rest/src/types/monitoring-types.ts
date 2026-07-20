/**
 * @fileoverview Type definitions for real-time monitoring & configurable alerting
 * @description Domain types for monitoring_alerts and alert_events.
 *              Issue #341 extends #306/#53 with: price alerts, position alerts,
 *              system alerts, activity alerts, WebSocket channel, deduplication,
 *              rate limiting, and alert templates with variable interpolation.
 * @author Galaxy DevKit Team
 * @since 2026-07-01
 */

// ── Core enums ────────────────────────────────────────────────────────────────

export type AlertStatus = 'active' | 'paused' | 'archived';

/**
 * All supported alert types across the four categories from issue #341:
 * - Price:    asset price crosses a threshold
 * - Position: health factor / liquidation risk
 * - System:   API errors, oracle staleness, Horizon connectivity
 * - Activity: large transactions, unusual patterns
 */
export type AlertType =
  // Position (existing)
  | 'health_factor_below'
  // Price
  | 'price_above'
  | 'price_below'
  | 'price_change_pct'
  // System
  | 'api_error_rate_above'
  | 'oracle_staleness_above'
  | 'horizon_latency_above'
  // Activity
  | 'transaction_amount_above'
  | 'unusual_transaction_pattern';

export type AlertChannel = 'webhook' | 'email' | 'websocket';
export type AlertDeliveryStatus = 'pending' | 'delivered' | 'failed' | 'retrying';
export type StellarNetworkName = 'testnet' | 'mainnet';

// ── Channel config shapes ─────────────────────────────────────────────────────

export interface WebhookChannelConfig {
  url: string;
  secret: string;
  headers?: Record<string, string>;
}

export interface EmailChannelConfig {
  to: string;
  subject?: string;
}

/**
 * WebSocket channel delivers alerts to connected clients subscribed to a
 * particular room/topic. `topic` is the room key the client subscribes to
 * (e.g. `alert:{alertId}` or `user:{userId}`).
 */
export interface WebSocketChannelConfig {
  topic: string;
}

export type ChannelConfig =
  | WebhookChannelConfig
  | EmailChannelConfig
  | WebSocketChannelConfig;

// ── Deduplication ─────────────────────────────────────────────────────────────

/**
 * Deduplication window configuration.
 * When set, the evaluator suppresses repeat triggers for the same alert
 * within `windowSeconds` even if the cooldown has expired.
 * `fingerprintFields` controls which payload fields are hashed to build
 * the dedup key — defaults to ['alertId', 'alertType', 'observedValue'].
 */
export interface DeduplicationConfig {
  windowSeconds: number;
  fingerprintFields?: string[];
}

// ── Rate limiting ─────────────────────────────────────────────────────────────

/**
 * Prevents notification storms by capping the number of deliveries
 * within a rolling `windowSeconds` window.
 */
export interface RateLimitConfig {
  maxDeliveries: number;
  windowSeconds: number;
}

// ── Alert templates ───────────────────────────────────────────────────────────

/**
 * Mustache-style variable interpolation for notification messages.
 * Variables: {{alertName}}, {{protocol}}, {{accountAddress}},
 *            {{alertType}}, {{threshold}}, {{observedValue}}, {{triggeredAt}}
 */
export interface AlertTemplate {
  titleTemplate: string;
  bodyTemplate: string;
}

// ── Core domain types ─────────────────────────────────────────────────────────

export interface MonitoringAlert {
  id: string;
  userId: string;
  teamId?: string;             // multi-tenant: team account scope
  name: string;
  protocol: string;
  accountAddress: string;
  network: StellarNetworkName;
  alertType: AlertType;
  threshold: number;
  channel: AlertChannel;
  channelConfig: ChannelConfig;
  cooldownSeconds: number;
  deduplication?: DeduplicationConfig;
  rateLimit?: RateLimitConfig;
  template?: AlertTemplate;
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
  deduplication?: DeduplicationConfig;
  rateLimit?: RateLimitConfig;
  template?: AlertTemplate;
  teamId?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateMonitoringAlertInput {
  name?: string;
  threshold?: number;
  channelConfig?: ChannelConfig;
  cooldownSeconds?: number;
  deduplication?: DeduplicationConfig;
  rateLimit?: RateLimitConfig;
  template?: AlertTemplate;
  status?: AlertStatus;
  metadata?: Record<string, unknown>;
}

export interface ListAlertsFilter {
  userId: string;
  teamId?: string;
  status?: AlertStatus;
  protocol?: string;
  alertType?: AlertType;
  channel?: AlertChannel;
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
 * Canonical payload sent to all notification channels.
 * `eventId` is the idempotency key; receivers must deduplicate on it.
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
  /** Rendered title from template (if configured) */
  title?: string;
  /** Rendered body from template (if configured) */
  body?: string;
  /** Extra context set by the evaluator (e.g. asset code for price alerts) */
  context?: Record<string, unknown>;
}

export interface ChannelDeliveryResult {
  success: boolean;
  statusCode?: number;
  durationMs: number;
  error?: string;
  retryable: boolean;
}

// ── Error types ───────────────────────────────────────────────────────────────

export enum MonitoringErrorCode {
  ALERT_NOT_FOUND = 'ALERT_NOT_FOUND',
  ALERT_FORBIDDEN = 'ALERT_FORBIDDEN',
  ALERT_VALIDATION_ERROR = 'ALERT_VALIDATION_ERROR',
  ALERT_CHANNEL_UNSUPPORTED = 'ALERT_CHANNEL_UNSUPPORTED',
  ALERT_PROTOCOL_UNSUPPORTED = 'ALERT_PROTOCOL_UNSUPPORTED',
  ALERT_RATE_LIMITED = 'ALERT_RATE_LIMITED',
  ALERT_DEDUPLICATED = 'ALERT_DEDUPLICATED',
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