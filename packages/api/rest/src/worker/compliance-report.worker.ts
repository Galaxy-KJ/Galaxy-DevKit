/**
 * @fileoverview Worker that runs due compliance report schedules.
 * @description Separate process from the REST API so schedule ticks do not
 *              duplicate under horizontal scaling of the API.
 * @author Galaxy DevKit Team
 * @since 2026-07-17
 */

import { ComplianceReportRepository } from '../repositories/compliance-report.repository';
import { ComplianceReportEngine } from '../services/compliance/report-engine';
import {
  computeClosedPeriod,
  computeNextRunAt,
} from '../services/compliance/schedule-utils';

export interface ComplianceReportWorkerOptions {
  pollIntervalMs?: number;
  batchSize?: number;
}

export class ComplianceReportWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private readonly pollIntervalMs: number;
  private readonly batchSize: number;

  constructor(
    private readonly engine: ComplianceReportEngine = new ComplianceReportEngine(),
    private readonly repository: ComplianceReportRepository = new ComplianceReportRepository(),
    options: ComplianceReportWorkerOptions = {}
  ) {
    this.pollIntervalMs = options.pollIntervalMs ?? 60_000;
    this.batchSize = options.batchSize ?? 50;
  }

  start(): void {
    if (this.timer) return;
    console.log(
      `[compliance] worker started (interval=${this.pollIntervalMs}ms batch=${this.batchSize})`
    );
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, this.pollIntervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('[compliance] worker stopped');
  }

  async tick(now: Date = new Date()): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let processed = 0;

    try {
      const due = await this.repository.listDueSchedules(now, this.batchSize);
      for (const schedule of due) {
        try {
          const period = computeClosedPeriod(schedule.cadence, now);
          await this.engine.generate(
            schedule.userId,
            {
              reportType: schedule.reportType,
              format: schedule.format,
              from: period.from,
              to: period.to,
              redactPii: schedule.redactPii,
            },
            { scheduleId: schedule.id }
          );

          const nextRunAt = computeNextRunAt(schedule.cadence, now);
          await this.repository.markScheduleRun(schedule.id, nextRunAt, now);
          processed += 1;
        } catch (err) {
          console.warn(
            `[compliance] failed schedule ${schedule.id}:`,
            err instanceof Error ? err.message : err
          );
          // Still advance next_run_at to avoid hot-looping a permanently broken schedule
          try {
            const nextRunAt = computeNextRunAt(schedule.cadence, now);
            await this.repository.markScheduleRun(schedule.id, nextRunAt, now);
          } catch (advanceErr) {
            console.warn(
              `[compliance] failed to advance schedule ${schedule.id}:`,
              advanceErr instanceof Error ? advanceErr.message : advanceErr
            );
          }
        }
      }
    } finally {
      this.running = false;
    }

    return processed;
  }
}
