/**
 * @fileoverview PositionMonitorWorker — background loop that evaluates
 *               active alerts and dispatches notifications.
 * @description Runs as a separate process from the REST API server (see
 *              npm scripts `worker` / `worker:dev`). Two interval loops:
 *                1. evaluation tick → fetch alerts, query protocol, decide
 *                2. retry tick      → re-dispatch failed deliveries
 *              Designed for a single instance per network. Horizontal scaling
 *              would need a per-row pessimistic lock (FOR UPDATE SKIP LOCKED).
 * @author Galaxy DevKit Team
 * @since 2026-06-29
 */

import { randomUUID } from 'crypto';
import { MonitoringAlertRepository } from '../repositories/monitoring-alert.repository';
import { AlertEvaluator } from '../services/monitoring/alert-evaluator';
import { ChannelDispatcher, MAX_DELIVERY_ATTEMPTS } from '../services/monitoring/channels/channel-dispatcher';
import { ProtocolPool } from '../services/monitoring/protocol-pool';
import {
  AlertEvent,
  AlertEventPayload,
  MonitoringAlert,
  StellarNetworkName,
} from '../types/monitoring-types';

export interface WorkerConfig {
  network: StellarNetworkName;
  evaluationIntervalMs: number;
  retryIntervalMs: number;
  batchSize: number;
}

export interface WorkerDeps {
  repo?: MonitoringAlertRepository;
  evaluator?: AlertEvaluator;
  dispatcher?: ChannelDispatcher;
  protocolPool?: ProtocolPool;
  logger?: Pick<Console, 'log' | 'warn' | 'error'>;
  now?: () => Date;
}

export class PositionMonitorWorker {
  private readonly repo: MonitoringAlertRepository;
  private readonly evaluator: AlertEvaluator;
  private readonly dispatcher: ChannelDispatcher;
  private readonly protocolPool: ProtocolPool;
  private readonly logger: Pick<Console, 'log' | 'warn' | 'error'>;
  private readonly now: () => Date;
  private evaluationTimer?: NodeJS.Timeout;
  private retryTimer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly config: WorkerConfig,
    deps: WorkerDeps = {}
  ) {
    this.repo = deps.repo ?? new MonitoringAlertRepository();
    this.evaluator = deps.evaluator ?? new AlertEvaluator();
    this.dispatcher = deps.dispatcher ?? new ChannelDispatcher();
    this.protocolPool = deps.protocolPool ?? new ProtocolPool();
    this.logger = deps.logger ?? console;
    this.now = deps.now ?? (() => new Date());
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.logger.log(
      `[monitor] starting on ${this.config.network} (eval=${this.config.evaluationIntervalMs}ms, retry=${this.config.retryIntervalMs}ms, batch=${this.config.batchSize})`
    );

    this.evaluationTimer = setInterval(() => {
      this.evaluationTick().catch((err) => this.logger.error('[monitor] evaluation tick failed', err));
    }, this.config.evaluationIntervalMs);

    this.retryTimer = setInterval(() => {
      this.retryTick().catch((err) => this.logger.error('[monitor] retry tick failed', err));
    }, this.config.retryIntervalMs);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    if (this.evaluationTimer) clearInterval(this.evaluationTimer);
    if (this.retryTimer) clearInterval(this.retryTimer);
    this.logger.log('[monitor] stopped');
  }

  async evaluationTick(): Promise<void> {
    const alerts = await this.repo.listActiveForEvaluation(this.config.network, this.config.batchSize);
    if (alerts.length === 0) return;

    await Promise.all(alerts.map((alert) => this.evaluateOne(alert)));
  }

  async retryTick(): Promise<void> {
    // Retry queue is read directly from alert_events. Future work: pull events
    // due for retry and resend; intentionally lean for the first iteration so
    // we don't ship untested retry-fanout logic before we observe real traffic.
  }

  private async evaluateOne(alert: MonitoringAlert): Promise<void> {
    let observedValue: number | null = null;
    try {
      const protocol = this.protocolPool.get(alert.protocol, alert.network);
      const hf = await protocol.getHealthFactor(alert.accountAddress);
      observedValue = this.parseHealthFactor(hf.value);
    } catch (err) {
      this.logger.warn(
        `[monitor] alert=${alert.id} failed to fetch health factor: ${(err as Error).message}`
      );
    }

    const decision = this.evaluator.evaluate(alert, { observedValue, now: this.now() });

    try {
      await this.repo.markEvaluated(alert.id, observedValue, decision.shouldTrigger);
    } catch (err) {
      this.logger.error(`[monitor] alert=${alert.id} failed to record evaluation`, err);
      return;
    }

    if (!decision.shouldTrigger) return;

    await this.triggerAlert(alert, observedValue);
  }

  private async triggerAlert(alert: MonitoringAlert, observedValue: number | null): Promise<void> {
    const payload: AlertEventPayload = {
      eventId: randomUUID(),
      alertId: alert.id,
      alertName: alert.name,
      protocol: alert.protocol,
      accountAddress: alert.accountAddress,
      network: alert.network,
      alertType: alert.alertType,
      threshold: alert.threshold,
      observedValue,
      triggeredAt: this.now().toISOString(),
    };

    let event: AlertEvent;
    try {
      event = await this.repo.createEvent(alert.id, payload, observedValue);
    } catch (err) {
      this.logger.error(`[monitor] alert=${alert.id} failed to persist event`, err);
      return;
    }

    const result = await this.dispatcher.dispatch(alert, payload);
    const attempts = event.deliveryAttempts + 1;
    const nextRetryAt =
      !result.success && result.retryable ? this.dispatcher.computeNextRetry(attempts) : null;

    const status = result.success
      ? 'delivered'
      : nextRetryAt
      ? 'retrying'
      : 'failed';

    try {
      await this.repo.updateEventDelivery(event.id, {
        deliveryStatus: status,
        deliveryAttempts: attempts,
        lastError: result.success ? null : result.error ?? 'unknown error',
        nextRetryAt,
      });
    } catch (err) {
      this.logger.error(`[monitor] event=${event.id} failed to update delivery`, err);
    }

    if (!result.success && attempts >= MAX_DELIVERY_ATTEMPTS) {
      this.logger.warn(
        `[monitor] event=${event.id} permanently failed after ${attempts} attempts: ${result.error}`
      );
    }
  }

  /**
   * BlendProtocol returns "∞" when the position has no debt. Map that to
   * +Infinity so the comparison `observedValue < threshold` is never truthy.
   */
  private parseHealthFactor(raw: string): number | null {
    if (!raw) return null;
    if (raw === '∞' || raw.toLowerCase() === 'infinity') return Number.POSITIVE_INFINITY;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
}
