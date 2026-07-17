import { ComplianceReportWorker } from '../../../worker/compliance-report.worker';
import { ComplianceSchedule } from '../../../types/compliance-types';

describe('ComplianceReportWorker', () => {
  const schedule: ComplianceSchedule = {
    id: 'sched-1',
    userId: 'user-1',
    reportType: 'user_activity',
    format: 'json',
    cadence: 'daily',
    redactPii: true,
    enabled: true,
    nextRunAt: new Date('2026-07-17T00:00:00.000Z'),
    lastRunAt: null,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
  };

  it('processes due schedules and advances next_run_at', async () => {
    const engine = {
      generate: jest.fn().mockResolvedValue({ id: 'rep-1', status: 'completed' }),
    };
    const repository = {
      listDueSchedules: jest.fn().mockResolvedValue([schedule]),
      markScheduleRun: jest.fn().mockResolvedValue(undefined),
    };

    const worker = new ComplianceReportWorker(engine as never, repository as never, {
      pollIntervalMs: 60_000,
      batchSize: 10,
    });

    const now = new Date('2026-07-17T15:00:00.000Z');
    const processed = await worker.tick(now);

    expect(processed).toBe(1);
    expect(engine.generate).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        reportType: 'user_activity',
        format: 'json',
        redactPii: true,
      }),
      { scheduleId: 'sched-1' }
    );
    expect(repository.markScheduleRun).toHaveBeenCalledWith(
      'sched-1',
      expect.any(Date),
      now
    );
  });

  it('still advances schedule when generation fails', async () => {
    const engine = {
      generate: jest.fn().mockRejectedValue(new Error('boom')),
    };
    const repository = {
      listDueSchedules: jest.fn().mockResolvedValue([schedule]),
      markScheduleRun: jest.fn().mockResolvedValue(undefined),
    };

    const worker = new ComplianceReportWorker(engine as never, repository as never);
    const processed = await worker.tick(new Date('2026-07-17T15:00:00.000Z'));

    expect(processed).toBe(0);
    expect(repository.markScheduleRun).toHaveBeenCalled();
  });
});
