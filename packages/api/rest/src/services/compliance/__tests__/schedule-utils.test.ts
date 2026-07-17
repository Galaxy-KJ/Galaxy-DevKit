import {
  computeClosedPeriod,
  computeNextRunAt,
  isScheduleDue,
} from '../schedule-utils';

describe('schedule utils', () => {
  const now = new Date('2026-07-17T15:30:00.000Z');

  it('computes daily closed period as previous UTC day', () => {
    const period = computeClosedPeriod('daily', now);
    expect(period.from.toISOString()).toBe('2026-07-16T00:00:00.000Z');
    expect(period.to.toISOString()).toBe('2026-07-16T23:59:59.999Z');
  });

  it('computes weekly closed period', () => {
    const period = computeClosedPeriod('weekly', now);
    expect(period.from.toISOString()).toBe('2026-07-10T00:00:00.000Z');
    expect(period.to.toISOString()).toBe('2026-07-16T23:59:59.999Z');
  });

  it('computes monthly closed period', () => {
    const period = computeClosedPeriod('monthly', now);
    expect(period.from.toISOString()).toBe('2026-06-17T00:00:00.000Z');
    expect(period.to.toISOString()).toBe('2026-07-16T23:59:59.999Z');
  });

  it('computes next run at utc midnight boundaries', () => {
    expect(computeNextRunAt('daily', now).toISOString()).toBe('2026-07-18T00:00:00.000Z');
    expect(computeNextRunAt('weekly', now).toISOString()).toBe('2026-07-24T00:00:00.000Z');
    expect(computeNextRunAt('monthly', now).toISOString()).toBe('2026-08-17T00:00:00.000Z');
  });

  it('detects due schedules', () => {
    expect(isScheduleDue(new Date('2026-07-17T00:00:00.000Z'), now)).toBe(true);
    expect(isScheduleDue(new Date('2026-07-18T00:00:00.000Z'), now)).toBe(false);
  });
});
