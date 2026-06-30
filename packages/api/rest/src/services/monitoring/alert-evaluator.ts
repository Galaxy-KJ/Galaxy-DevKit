/**
 * @fileoverview Pure decision logic: should this alert trigger right now?
 * @description Separated from the worker so the same rule is testable in
 *              isolation and reusable by future endpoints (e.g. a "test alert"
 *              endpoint that simulates an observed value).
 * @author Galaxy DevKit Team
 * @since 2026-06-29
 */

import { MonitoringAlert } from '../../types/monitoring-types';

export interface EvaluationContext {
  observedValue: number | null;
  now: Date;
}

export interface EvaluationDecision {
  shouldTrigger: boolean;
  reason: 'condition_met' | 'condition_not_met' | 'observation_unavailable' | 'cooldown_active';
}

export class AlertEvaluator {
  evaluate(alert: MonitoringAlert, ctx: EvaluationContext): EvaluationDecision {
    if (ctx.observedValue === null) {
      return { shouldTrigger: false, reason: 'observation_unavailable' };
    }

    const conditionMet = this.matchesCondition(alert, ctx.observedValue);
    if (!conditionMet) {
      return { shouldTrigger: false, reason: 'condition_not_met' };
    }

    if (this.isWithinCooldown(alert, ctx.now)) {
      return { shouldTrigger: false, reason: 'cooldown_active' };
    }

    return { shouldTrigger: true, reason: 'condition_met' };
  }

  private matchesCondition(alert: MonitoringAlert, observedValue: number): boolean {
    switch (alert.alertType) {
      case 'health_factor_below':
        return observedValue < alert.threshold;
      default:
        return false;
    }
  }

  private isWithinCooldown(alert: MonitoringAlert, now: Date): boolean {
    if (!alert.lastTriggeredAt) return false;
    const elapsedMs = now.getTime() - alert.lastTriggeredAt.getTime();
    return elapsedMs < alert.cooldownSeconds * 1_000;
  }
}
