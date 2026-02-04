import cron, { ScheduledTask } from 'node-cron';
import { CronJob } from '../types/automation-types.js';

export class CronManager {
  private jobs: Map<string, ScheduledTask> = new Map();
  private jobMetadata: Map<string, CronJob> = new Map();

  /**
   * Schedule a new cron job
   */
  scheduleJob(
    ruleId: string,
    expression: string,
    callback: () => Promise<void>
  ): CronJob {
    if (!cron.validate(expression)) {
      throw new Error(`Invalid cron expression: ${expression}`);
    }

    this.removeJob(ruleId);

    const jobId = `cron_${ruleId}_${Date.now()}`;

    const task = cron.schedule(expression, async () => {
      const metadata = this.jobMetadata.get(ruleId);
      if (!metadata) return;

      metadata.isRunning = true;
      metadata.lastRun = new Date();
      this.jobMetadata.set(ruleId, metadata);

      try {
        await callback();
      } catch (error) {
        console.error(`Error executing cron job ${ruleId}:`, error);
      } finally {
        metadata.isRunning = false;
        this.jobMetadata.set(ruleId, metadata);
      }
    });

    this.jobs.set(ruleId, task);

    const cronJob: CronJob = {
      id: jobId,
      ruleId,
      expression,
      nextRun: this.calculateNextRun(expression),
      isRunning: false,
    };

    this.jobMetadata.set(ruleId, cronJob);

    return cronJob;
  }

  /**
   * Start a scheduled job
   */
  startJob(ruleId: string): boolean {
    const task = this.jobs.get(ruleId);
    if (!task) {
      return false;
    }

    task.start();
    return true;
  }

  /**
   * Stop a scheduled job
   */
  stopJob(ruleId: string): boolean {
    const task = this.jobs.get(ruleId);
    if (!task) {
      return false;
    }

    task.stop();
    return true;
  }

  /**
   * Remove a scheduled job
   */
  removeJob(ruleId: string): boolean {
    const task = this.jobs.get(ruleId);
    if (!task) {
      return false;
    }

    task.stop();
    this.jobs.delete(ruleId);
    this.jobMetadata.delete(ruleId);
    return true;
  }

  /**
   * Get job metadata
   */
  getJob(ruleId: string): CronJob | undefined {
    return this.jobMetadata.get(ruleId);
  }

  /**
   * Get all jobs
   */
  getAllJobs(): CronJob[] {
    return Array.from(this.jobMetadata.values());
  }

  /**
   * Check if a job exists
   */
  hasJob(ruleId: string): boolean {
    return this.jobs.has(ruleId);
  }

  /**
   * Get job status
   */
  getJobStatus(ruleId: string): {
    exists: boolean;
    isRunning: boolean;
    nextRun?: Date;
    lastRun?: Date;
  } {
    const metadata = this.jobMetadata.get(ruleId);

    if (!metadata) {
      return { exists: false, isRunning: false };
    }

    return {
      exists: true,
      isRunning: metadata.isRunning,
      nextRun: metadata.nextRun,
      lastRun: metadata.lastRun,
    };
  }

  /**
   * Update job schedule
   */
  updateJobSchedule(
    ruleId: string,
    expression: string,
    callback: () => Promise<void>
  ): CronJob {
    this.removeJob(ruleId);
    return this.scheduleJob(ruleId, expression, callback);
  }

  /**
   * Calculate next run time for a cron expression
   */
  private calculateNextRun(expression: string): Date {

    const parts = expression.split(' ');

    if (parts.length !== 5 && parts.length !== 6) {
      throw new Error('Invalid cron expression format');
    }


    const nextRun = new Date();
    nextRun.setMinutes(nextRun.getMinutes() + 1);

    return nextRun;
  }

  /**
   * Validate cron expression
   */
  validateExpression(expression: string): boolean {
    return cron.validate(expression);
  }

  /**
   * Stop all jobs
   */
  stopAll(): void {
    this.jobs.forEach(task => task.stop());
  }

  /**
   * Clean up all jobs
   */
  destroy(): void {
    this.jobs.forEach(task => task.stop());
    this.jobs.clear();
    this.jobMetadata.clear();
  }
}

export default CronManager;
