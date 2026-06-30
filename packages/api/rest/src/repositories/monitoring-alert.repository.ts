/**
 * @fileoverview Persistence for monitoring_alerts and alert_events.
 * @description All ownership checks are enforced here when a userId is provided;
 *              worker queries (no userId) intentionally bypass that filter so the
 *              background process can scan every active alert.
 * @author Galaxy DevKit Team
 * @since 2026-06-29
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../utils/supabase';
import {
  AlertChannel,
  AlertDeliveryStatus,
  AlertEvent,
  AlertEventPayload,
  AlertStatus,
  AlertType,
  CreateMonitoringAlertInput,
  ListAlertsFilter,
  MonitoringAlert,
  StellarNetworkName,
  UpdateMonitoringAlertInput,
} from '../types/monitoring-types';

interface MonitoringAlertRow {
  id: string;
  user_id: string;
  name: string;
  protocol: string;
  account_address: string;
  network: StellarNetworkName;
  alert_type: AlertType;
  threshold: string | number;
  channel: AlertChannel;
  channel_config: Record<string, unknown>;
  cooldown_seconds: number;
  status: AlertStatus;
  last_triggered_at: string | null;
  last_evaluated_at: string | null;
  last_health_factor: string | number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

interface AlertEventRow {
  id: string;
  alert_id: string;
  triggered_at: string;
  health_factor_value: string | number | null;
  payload: AlertEventPayload;
  delivery_status: AlertDeliveryStatus;
  delivery_attempts: number;
  last_attempt_at: string | null;
  next_retry_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

function toNumber(value: string | number | null): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function rowToAlert(row: MonitoringAlertRow): MonitoringAlert {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    protocol: row.protocol,
    accountAddress: row.account_address,
    network: row.network,
    alertType: row.alert_type,
    threshold: toNumber(row.threshold) ?? 0,
    channel: row.channel,
    channelConfig: row.channel_config as MonitoringAlert['channelConfig'],
    cooldownSeconds: row.cooldown_seconds,
    status: row.status,
    lastTriggeredAt: row.last_triggered_at ? new Date(row.last_triggered_at) : null,
    lastEvaluatedAt: row.last_evaluated_at ? new Date(row.last_evaluated_at) : null,
    lastHealthFactor: toNumber(row.last_health_factor),
    metadata: row.metadata ?? {},
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

function rowToEvent(row: AlertEventRow): AlertEvent {
  return {
    id: row.id,
    alertId: row.alert_id,
    triggeredAt: new Date(row.triggered_at),
    healthFactorValue: toNumber(row.health_factor_value),
    payload: row.payload,
    deliveryStatus: row.delivery_status,
    deliveryAttempts: row.delivery_attempts,
    lastAttemptAt: row.last_attempt_at ? new Date(row.last_attempt_at) : null,
    nextRetryAt: row.next_retry_at ? new Date(row.next_retry_at) : null,
    lastError: row.last_error,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

const ALERTS_TABLE = 'monitoring_alerts';
const EVENTS_TABLE = 'alert_events';

export class MonitoringAlertRepository {
  private client: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.client = client ?? getSupabaseClient();
  }

  async create(userId: string, input: CreateMonitoringAlertInput): Promise<MonitoringAlert> {
    const { data, error } = await this.client
      .from(ALERTS_TABLE)
      .insert({
        user_id: userId,
        name: input.name,
        protocol: input.protocol,
        account_address: input.accountAddress,
        network: input.network ?? 'testnet',
        alert_type: input.alertType,
        threshold: input.threshold,
        channel: input.channel,
        channel_config: input.channelConfig,
        cooldown_seconds: input.cooldownSeconds ?? 300,
        metadata: input.metadata ?? {},
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create monitoring alert: ${error?.message ?? 'unknown error'}`);
    }

    return rowToAlert(data as MonitoringAlertRow);
  }

  async findByIdForUser(id: string, userId: string): Promise<MonitoringAlert | null> {
    const { data, error } = await this.client
      .from(ALERTS_TABLE)
      .select('*')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return data ? rowToAlert(data as MonitoringAlertRow) : null;
  }

  async list(filter: ListAlertsFilter): Promise<MonitoringAlert[]> {
    let query = this.client.from(ALERTS_TABLE).select('*').eq('user_id', filter.userId);

    if (filter.status) query = query.eq('status', filter.status);
    if (filter.protocol) query = query.eq('protocol', filter.protocol);

    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return (data ?? []).map((row) => rowToAlert(row as MonitoringAlertRow));
  }

  async update(
    id: string,
    userId: string,
    input: UpdateMonitoringAlertInput
  ): Promise<MonitoringAlert | null> {
    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.threshold !== undefined) patch.threshold = input.threshold;
    if (input.channelConfig !== undefined) patch.channel_config = input.channelConfig;
    if (input.cooldownSeconds !== undefined) patch.cooldown_seconds = input.cooldownSeconds;
    if (input.status !== undefined) patch.status = input.status;
    if (input.metadata !== undefined) patch.metadata = input.metadata;

    if (Object.keys(patch).length === 0) {
      return this.findByIdForUser(id, userId);
    }

    const { data, error } = await this.client
      .from(ALERTS_TABLE)
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId)
      .select('*')
      .maybeSingle();

    if (error) throw error;
    return data ? rowToAlert(data as MonitoringAlertRow) : null;
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const { error, count } = await this.client
      .from(ALERTS_TABLE)
      .delete({ count: 'exact' })
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;
    return (count ?? 0) > 0;
  }

  /**
   * Worker-only: fetch the next batch of active alerts to evaluate. Ordered by
   * last_evaluated_at NULLS FIRST so brand-new alerts are picked up immediately.
   * The matching partial index `idx_monitoring_alerts_worker_scan` drives this query.
   */
  async listActiveForEvaluation(
    network: StellarNetworkName,
    batchSize: number
  ): Promise<MonitoringAlert[]> {
    const { data, error } = await this.client
      .from(ALERTS_TABLE)
      .select('*')
      .eq('status', 'active')
      .eq('network', network)
      .order('last_evaluated_at', { ascending: true, nullsFirst: true })
      .limit(batchSize);

    if (error) throw error;
    return (data ?? []).map((row) => rowToAlert(row as MonitoringAlertRow));
  }

  /**
   * Worker-only: record that this alert was evaluated, optionally bumping
   * `last_triggered_at` when the alert condition was matched.
   */
  async markEvaluated(
    id: string,
    healthFactor: number | null,
    didTrigger: boolean
  ): Promise<void> {
    const patch: Record<string, unknown> = {
      last_evaluated_at: new Date().toISOString(),
      last_health_factor: healthFactor,
    };
    if (didTrigger) patch.last_triggered_at = new Date().toISOString();

    const { error } = await this.client.from(ALERTS_TABLE).update(patch).eq('id', id);
    if (error) throw error;
  }

  async createEvent(
    alertId: string,
    payload: AlertEventPayload,
    healthFactorValue: number | null
  ): Promise<AlertEvent> {
    const { data, error } = await this.client
      .from(EVENTS_TABLE)
      .insert({
        alert_id: alertId,
        triggered_at: payload.triggeredAt,
        health_factor_value: healthFactorValue,
        payload,
        delivery_status: 'pending',
      })
      .select('*')
      .single();

    if (error || !data) {
      throw new Error(`Failed to persist alert event: ${error?.message ?? 'unknown error'}`);
    }
    return rowToEvent(data as AlertEventRow);
  }

  async updateEventDelivery(
    id: string,
    patch: {
      deliveryStatus: AlertDeliveryStatus;
      deliveryAttempts: number;
      lastError: string | null;
      nextRetryAt: Date | null;
    }
  ): Promise<void> {
    const { error } = await this.client
      .from(EVENTS_TABLE)
      .update({
        delivery_status: patch.deliveryStatus,
        delivery_attempts: patch.deliveryAttempts,
        last_attempt_at: new Date().toISOString(),
        last_error: patch.lastError,
        next_retry_at: patch.nextRetryAt ? patch.nextRetryAt.toISOString() : null,
      })
      .eq('id', id);

    if (error) throw error;
  }

  async listEventsForUser(
    alertId: string,
    userId: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<AlertEvent[] | null> {
    const owner = await this.findByIdForUser(alertId, userId);
    if (!owner) return null;

    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;

    const { data, error } = await this.client
      .from(EVENTS_TABLE)
      .select('*')
      .eq('alert_id', alertId)
      .order('triggered_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return (data ?? []).map((row) => rowToEvent(row as AlertEventRow));
  }
}
