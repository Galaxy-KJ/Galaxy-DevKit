/**
 * @fileoverview Schedule period and next-run helpers for compliance reports.
 * @author Galaxy DevKit Team
 * @since 2026-07-17
 */

import { ScheduleCadence } from '../../types/compliance-types';

export interface ClosedPeriod {
  from: Date;
  to: Date;
}

/**
 * Compute the closed reporting period that just ended for a cadence, relative
 * to `now`. Periods are UTC calendar boundaries for determinism.
 */
export function computeClosedPeriod(cadence: ScheduleCadence, now: Date = new Date()): ClosedPeriod {
  const end = new Date(now);
  end.setUTCMilliseconds(0);
  end.setUTCSeconds(0);
  end.setUTCMinutes(0);
  end.setUTCHours(0);

  const start = new Date(end);

  switch (cadence) {
    case 'daily':
      start.setUTCDate(start.getUTCDate() - 1);
      break;
    case 'weekly':
      start.setUTCDate(start.getUTCDate() - 7);
      break;
    case 'monthly':
      start.setUTCMonth(start.getUTCMonth() - 1);
      break;
    default: {
      const _exhaustive: never = cadence;
      throw new Error(`Unknown cadence: ${_exhaustive}`);
    }
  }

  // period end is exclusive at midnight; store inclusive last microsecond of previous day
  const to = new Date(end.getTime() - 1);
  return { from: start, to };
}

/**
 * Next run after a successful generation. Anchored to UTC midnight.
 */
export function computeNextRunAt(cadence: ScheduleCadence, from: Date = new Date()): Date {
  const next = new Date(from);
  next.setUTCMilliseconds(0);
  next.setUTCSeconds(0);
  next.setUTCMinutes(0);
  next.setUTCHours(0);

  switch (cadence) {
    case 'daily':
      next.setUTCDate(next.getUTCDate() + 1);
      break;
    case 'weekly':
      next.setUTCDate(next.getUTCDate() + 7);
      break;
    case 'monthly':
      next.setUTCMonth(next.getUTCMonth() + 1);
      break;
    default: {
      const _exhaustive: never = cadence;
      throw new Error(`Unknown cadence: ${_exhaustive}`);
    }
  }

  return next;
}

export function isScheduleDue(nextRunAt: Date, now: Date = new Date()): boolean {
  return nextRunAt.getTime() <= now.getTime();
}
