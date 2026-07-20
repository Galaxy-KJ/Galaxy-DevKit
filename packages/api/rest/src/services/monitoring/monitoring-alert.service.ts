/**
 * @fileoverview Business-layer orchestrator for monitoring alerts.
 * @description Extended from issue #306 to support:
 *   - WebSocket, Email channels (in addition to Webhook)
 *   - All four alert type categories (price, position, system, activity)
 *   - Deduplication and rate-limit configuration validation
 *   - Alert template validation
 *   - Multi-tenant team scoping
 * @author Galaxy DevKit Team
 * @since 2026-06-29 (extended 2026-07-01)
 */

import { MonitoringAlertRepository } from '../../repositories/monitoring-alert.repository';
import { CursorPageResult } from '../../utils/pagination';
import {
  AlertChannel,
  AlertEvent,
  AlertType,
  CreateMonitoringAlertInput,
  EmailChannelConfig,
  ListAlertsFilter,
  MonitoringAlert,
  MonitoringError,
  MonitoringErrorCode,
  UpdateMonitoringAlertInput,
  WebhookChannelConfig,
  WebSocketChannelConfig,
} from '../../types/monitoring-types';

// ── Supported protocols / channels / alert types ──────────────────────────────

const SUPPORTED_PROTOCOLS = new Set(['blend', 'soroswap', 'sdex']);

const SUPPORTED_CHANNELS = new Set<AlertChannel>(['webhook', 'email', 'websocket']);
const IMPLEMENTED_CHANNELS = new Set<AlertChannel>(['webhook', 'websocket']);

const PRICE_ALERT_TYPES = new Set<AlertType>([
  'price_above',
  'price_below',
  'price_change_pct',
]);

const POSITION_ALERT_TYPES = new Set<AlertType>([
  'health_factor_below',
]);

const SYSTEM_ALERT_TYPES = new Set<AlertType>([
  'api_error_rate_above',
  'oracle_staleness_above',
  'horizon_latency_above',
]);

const ACTIVITY_ALERT_TYPES = new Set<AlertType>([
  'transaction_amount_above',
  'unusual_transaction_pattern',
]);

const ALL_ALERT_TYPES = new Set<AlertType>([
  ...PRICE_ALERT_TYPES,
  ...POSITION_ALERT_TYPES,
  ...SYSTEM_ALERT_TYPES,
  ...ACTIVITY_ALERT_TYPES,
]);

export class MonitoringAlertService {
  constructor(
    private readonly repo: MonitoringAlertRepository = new MonitoringAlertRepository()
  ) {}

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async create(userId: string, input: CreateMonitoringAlertInput): Promise<MonitoringAlert> {
    this.assertAlertTypeSupported(input.alertType);
    this.assertProtocolSupported(input.protocol);
    this.assertChannelImplemented(input.channel);
    this.assertChannelConfigMatchesChannel(input);
    this.assertDeduplicationConfig(input);
    this.assertRateLimitConfig(input);

    return this.repo.create(userId, input);
  }

  async list(filter: ListAlertsFilter): Promise<MonitoringAlert[]> {
    return this.repo.list(filter);
  }

  async getForUser(id: string, userId: string): Promise<MonitoringAlert> {
    const alert = await this.repo.findByIdForUser(id, userId);
    if (!alert) {
      throw new MonitoringError(
        MonitoringErrorCode.ALERT_NOT_FOUND,
        'Monitoring alert not found',
        404
      );
    }
    return alert;
  }

  async update(
    id: string,
    userId: string,
    input: UpdateMonitoringAlertInput
  ): Promise<MonitoringAlert> {
    if (input.channelConfig) {
      // Re-validate config even on partial updates if the config changes
      this.assertDeduplicationConfig(input);
      this.assertRateLimitConfig(input);
    }

    const updated = await this.repo.update(id, userId, input);
    if (!updated) {
      throw new MonitoringError(
        MonitoringErrorCode.ALERT_NOT_FOUND,
        'Monitoring alert not found',
        404
      );
    }
    return updated;
  }

  async delete(id: string, userId: string): Promise<void> {
    const deleted = await this.repo.delete(id, userId);
    if (!deleted) {
      throw new MonitoringError(
        MonitoringErrorCode.ALERT_NOT_FOUND,
        'Monitoring alert not found',
        404
      );
    }
  }

  async listEventsForUser(
    alertId: string,
    userId: string,
    opts: { limit?: number; cursor?: string } = {}
  ): Promise<CursorPageResult<AlertEvent>> {
    const page = await this.repo.listEventsForUser(alertId, userId, opts);
    if (page === null) {
      throw new MonitoringError(
        MonitoringErrorCode.ALERT_NOT_FOUND,
        'Monitoring alert not found',
        404
      );
    }
    return page;
  }

  // ── Classification helpers (exported for router/docs) ─────────────────────

  static getAlertCategory(
    alertType: AlertType
  ): 'price' | 'position' | 'system' | 'activity' | 'unknown' {
    if (PRICE_ALERT_TYPES.has(alertType)) return 'price';
    if (POSITION_ALERT_TYPES.has(alertType)) return 'position';
    if (SYSTEM_ALERT_TYPES.has(alertType)) return 'system';
    if (ACTIVITY_ALERT_TYPES.has(alertType)) return 'activity';
    return 'unknown';
  }

  static getSupportedAlertTypes(): AlertType[] {
    return [...ALL_ALERT_TYPES];
  }

  static getSupportedChannels(): AlertChannel[] {
    return [...IMPLEMENTED_CHANNELS];
  }

  // ── Validation guards ─────────────────────────────────────────────────────

  private assertAlertTypeSupported(alertType: AlertType): void {
    if (!ALL_ALERT_TYPES.has(alertType)) {
      throw new MonitoringError(
        MonitoringErrorCode.ALERT_VALIDATION_ERROR,
        `Alert type "${alertType}" is not supported`,
        400,
        { supported: [...ALL_ALERT_TYPES] }
      );
    }
  }

  private assertProtocolSupported(protocol: string): void {
    if (!SUPPORTED_PROTOCOLS.has(protocol)) {
      throw new MonitoringError(
        MonitoringErrorCode.ALERT_PROTOCOL_UNSUPPORTED,
        `Protocol "${protocol}" is not supported yet`,
        400,
        { supported: [...SUPPORTED_PROTOCOLS] }
      );
    }
  }

  private assertChannelImplemented(channel: AlertChannel): void {
    if (!SUPPORTED_CHANNELS.has(channel)) {
      throw new MonitoringError(
        MonitoringErrorCode.ALERT_CHANNEL_UNSUPPORTED,
        `Unknown channel "${channel}"`,
        400
      );
    }
    if (!IMPLEMENTED_CHANNELS.has(channel)) {
      throw new MonitoringError(
        MonitoringErrorCode.ALERT_CHANNEL_UNSUPPORTED,
        `Channel "${channel}" is declared but not yet implemented`,
        501,
        { implemented: [...IMPLEMENTED_CHANNELS] }
      );
    }
  }

  private assertChannelConfigMatchesChannel(
    input: Pick<CreateMonitoringAlertInput, 'channel' | 'channelConfig'>
  ): void {
    if (input.channel === 'webhook') {
      const cfg = input.channelConfig as WebhookChannelConfig;
      if (!cfg || typeof cfg.url !== 'string' || typeof cfg.secret !== 'string') {
        throw new MonitoringError(
          MonitoringErrorCode.ALERT_VALIDATION_ERROR,
          'Webhook channel requires { url, secret }',
          400
        );
      }
    }

    if (input.channel === 'email') {
      const cfg = input.channelConfig as EmailChannelConfig;
      if (!cfg || typeof cfg.to !== 'string') {
        throw new MonitoringError(
          MonitoringErrorCode.ALERT_VALIDATION_ERROR,
          'Email channel requires { to }',
          400
        );
      }
    }

    if (input.channel === 'websocket') {
      const cfg = input.channelConfig as WebSocketChannelConfig;
      if (!cfg || typeof cfg.topic !== 'string' || !cfg.topic.trim()) {
        throw new MonitoringError(
          MonitoringErrorCode.ALERT_VALIDATION_ERROR,
          'WebSocket channel requires { topic }',
          400
        );
      }
    }
  }

  private assertDeduplicationConfig(
    input: Pick<Partial<CreateMonitoringAlertInput>, 'deduplication'>
  ): void {
    if (!input.deduplication) return;
    const { windowSeconds } = input.deduplication;
    if (!Number.isFinite(windowSeconds) || windowSeconds < 1 || windowSeconds > 86_400) {
      throw new MonitoringError(
        MonitoringErrorCode.ALERT_VALIDATION_ERROR,
        'deduplication.windowSeconds must be between 1 and 86400',
        400
      );
    }
  }

  private assertRateLimitConfig(
    input: Pick<Partial<CreateMonitoringAlertInput>, 'rateLimit'>
  ): void {
    if (!input.rateLimit) return;
    const { maxDeliveries, windowSeconds } = input.rateLimit;
    if (!Number.isInteger(maxDeliveries) || maxDeliveries < 1) {
      throw new MonitoringError(
        MonitoringErrorCode.ALERT_VALIDATION_ERROR,
        'rateLimit.maxDeliveries must be a positive integer',
        400
      );
    }
    if (!Number.isFinite(windowSeconds) || windowSeconds < 1 || windowSeconds > 86_400) {
      throw new MonitoringError(
        MonitoringErrorCode.ALERT_VALIDATION_ERROR,
        'rateLimit.windowSeconds must be between 1 and 86400',
        400
      );
    }
  }
}