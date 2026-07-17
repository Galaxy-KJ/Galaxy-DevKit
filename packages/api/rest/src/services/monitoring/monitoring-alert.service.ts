/**
 * @fileoverview Business-layer orchestrator for monitoring alerts.
 * @description Sits between Express handlers and the repository. Enforces
 *              protocol/channel invariants and translates repo errors into
 *              typed MonitoringError instances so route handlers can map them
 *              to HTTP status codes consistently.
 * @author Galaxy DevKit Team
 * @since 2026-06-29
 */

import { MonitoringAlertRepository } from '../../repositories/monitoring-alert.repository';
import { CursorPageResult } from '../../utils/pagination';
import {
  AlertEvent,
  CreateMonitoringAlertInput,
  ListAlertsFilter,
  MonitoringAlert,
  MonitoringError,
  MonitoringErrorCode,
  UpdateMonitoringAlertInput,
  WebhookChannelConfig,
} from '../../types/monitoring-types';

const SUPPORTED_PROTOCOLS = new Set(['blend']);
const SUPPORTED_CHANNELS = new Set(['webhook', 'email']);
const IMPLEMENTED_CHANNELS = new Set(['webhook']);

export class MonitoringAlertService {
  constructor(private readonly repo: MonitoringAlertRepository = new MonitoringAlertRepository()) {}

  async create(userId: string, input: CreateMonitoringAlertInput): Promise<MonitoringAlert> {
    this.assertProtocolSupported(input.protocol);
    this.assertChannelImplemented(input.channel);
    this.assertChannelConfigMatchesChannel(input);

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

  private assertChannelImplemented(channel: string): void {
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

  private assertChannelConfigMatchesChannel(input: CreateMonitoringAlertInput): void {
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
  }
}
