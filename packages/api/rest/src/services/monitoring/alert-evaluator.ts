/**
 * @fileoverview Pure decision logic: should this alert trigger right now?
 * @description Extended from issue #306 to support all four alert categories
 *              (price, position, system, activity), deduplication via fingerprint
 *              hashing, rate limiting, and Mustache-style template rendering.
 *
 *              Separated from the worker so the same rule is testable in
 *              isolation and reusable by a future "test alert" endpoint.
 *
 * @author Galaxy DevKit Team
 * @since 2026-06-29 (extended 2026-07-01)
 */

import { createHash } from 'crypto';
import {
  AlertEventPayload,
  AlertTemplate,
  AlertType,
  MonitoringAlert,
} from '../../types/monitoring-types';

// ── Evaluation context ────────────────────────────────────────────────────────

export interface EvaluationContext {
  observedValue: number | null;
  now: Date;
  /** Recent delivery count within the rate-limit window (caller supplies). */
  recentDeliveryCount?: number;
  /** Fingerprint of the last deduplicated event for this alert (caller supplies). */
  lastDedupeFingerprint?: string | null;
}

export interface EvaluationDecision {
  shouldTrigger: boolean;
  reason:
    | 'condition_met'
    | 'condition_not_met'
    | 'observation_unavailable'
    | 'cooldown_active'
    | 'deduplicated'
    | 'rate_limited';
  /** Fingerprint of this evaluation (set when condition is met). */
  fingerprint?: string;
}

// ── Template renderer ─────────────────────────────────────────────────────────

const TEMPLATE_VAR_RE = /\{\{(\w+)\}\}/g;

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(TEMPLATE_VAR_RE, (_, key) => vars[key] ?? `{{${key}}}`);
}

function buildTemplateVars(
  alert: MonitoringAlert,
  observedValue: number | null,
  triggeredAt: string
): Record<string, string> {
  return {
    alertName: alert.name,
    protocol: alert.protocol,
    accountAddress: alert.accountAddress,
    alertType: alert.alertType,
    threshold: String(alert.threshold),
    observedValue: observedValue !== null ? String(observedValue) : 'N/A',
    triggeredAt,
  };
}

// ── Condition matchers per alert type ─────────────────────────────────────────

const CONDITION_MATCHERS: Partial<Record<AlertType, (value: number, threshold: number) => boolean>> = {
  // Position
  health_factor_below: (v, t) => v < t,

  // Price
  price_above:      (v, t) => v > t,
  price_below:      (v, t) => v < t,
  price_change_pct: (v, t) => Math.abs(v) >= t,  // observed = % change

  // System
  api_error_rate_above:   (v, t) => v > t,
  oracle_staleness_above: (v, t) => v > t,  // seconds since last update
  horizon_latency_above:  (v, t) => v > t,  // ms

  // Activity
  transaction_amount_above:    (v, t) => v > t,
  unusual_transaction_pattern: (v, t) => v >= t,  // anomaly score
};

// ── AlertEvaluator ────────────────────────────────────────────────────────────

export class AlertEvaluator {
  /**
   * Evaluate whether the alert should fire given the current context.
   * Pure function — no I/O, no side effects.
   */
  evaluate(alert: MonitoringAlert, ctx: EvaluationContext): EvaluationDecision {
    // 1. Observation guard
    if (ctx.observedValue === null) {
      return { shouldTrigger: false, reason: 'observation_unavailable' };
    }

    // 2. Condition check
    const matcher = CONDITION_MATCHERS[alert.alertType];
    const conditionMet = matcher ? matcher(ctx.observedValue, alert.threshold) : false;

    if (!conditionMet) {
      return { shouldTrigger: false, reason: 'condition_not_met' };
    }

    // 3. Cooldown check
    if (this.isWithinCooldown(alert, ctx.now)) {
      return { shouldTrigger: false, reason: 'cooldown_active' };
    }

    // 4. Rate limit check
    if (this.isRateLimited(alert, ctx.recentDeliveryCount ?? 0)) {
      return { shouldTrigger: false, reason: 'rate_limited' };
    }

    // 5. Deduplication check
    const fingerprint = this.buildFingerprint(alert, ctx.observedValue, ctx.now);
    if (this.isDeduplicated(alert, fingerprint, ctx.lastDedupeFingerprint ?? null)) {
      return { shouldTrigger: false, reason: 'deduplicated' };
    }

    return { shouldTrigger: true, reason: 'condition_met', fingerprint };
  }

  /**
   * Build the canonical `AlertEventPayload` to send to channels.
   * Renders title/body from the template if one is configured.
   */
  buildPayload(
    alert: MonitoringAlert,
    observedValue: number | null,
    eventId: string,
    now: Date
  ): AlertEventPayload {
    const triggeredAt = now.toISOString();
    const vars = buildTemplateVars(alert, observedValue, triggeredAt);

    const rendered = alert.template
      ? this.renderAlertTemplate(alert.template, vars)
      : undefined;

    return {
      eventId,
      alertId: alert.id,
      alertName: alert.name,
      protocol: alert.protocol,
      accountAddress: alert.accountAddress,
      network: alert.network,
      alertType: alert.alertType,
      threshold: alert.threshold,
      observedValue,
      triggeredAt,
      ...(rendered ?? {}),
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private isWithinCooldown(alert: MonitoringAlert, now: Date): boolean {
    if (!alert.lastTriggeredAt) return false;
    const elapsedMs = now.getTime() - alert.lastTriggeredAt.getTime();
    return elapsedMs < alert.cooldownSeconds * 1_000;
  }

  private isRateLimited(alert: MonitoringAlert, recentCount: number): boolean {
    if (!alert.rateLimit) return false;
    return recentCount >= alert.rateLimit.maxDeliveries;
  }

  private buildFingerprint(
    alert: MonitoringAlert,
    observedValue: number,
    now: Date
  ): string {
    const fields = alert.deduplication?.fingerprintFields ?? [
      'alertId',
      'alertType',
      'observedValue',
    ];

    const fieldValues: Record<string, string> = {
      alertId: alert.id,
      alertType: alert.alertType,
      observedValue: String(observedValue),
      threshold: String(alert.threshold),
      protocol: alert.protocol,
      accountAddress: alert.accountAddress,
      // Bucket into the dedup window so the same value in the same window deduplicates
      windowBucket: alert.deduplication
        ? String(Math.floor(now.getTime() / (alert.deduplication.windowSeconds * 1_000)))
        : '0',
    };

    const raw = fields.map((f) => fieldValues[f] ?? '').join(':');
    return createHash('sha256').update(raw).digest('hex').slice(0, 16);
  }

  private isDeduplicated(
    alert: MonitoringAlert,
    fingerprint: string,
    lastFingerprint: string | null
  ): boolean {
    if (!alert.deduplication) return false;
    return fingerprint === lastFingerprint;
  }

  private renderAlertTemplate(
    template: AlertTemplate,
    vars: Record<string, string>
  ): { title: string; body: string } {
    return {
      title: renderTemplate(template.titleTemplate, vars),
      body: renderTemplate(template.bodyTemplate, vars),
    };
  }
}