/**
 * @fileoverview Scheduler for periodic oracle aggregation cycles
 */

export type ScheduledTask = () => void | Promise<void>;

export interface SchedulerOptions {
  intervalMs: number;
  runImmediately?: boolean;
  onError?: (error: unknown) => void;
}

/**
 * Lightweight interval scheduler with graceful stop/restart semantics.
 */
export class AggregatorScheduler {
  private handle: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly task: ScheduledTask;
  private readonly options: Required<SchedulerOptions>;

  constructor(task: ScheduledTask, options: SchedulerOptions) {
    this.task = task;
    this.options = {
      runImmediately: true,
      onError: (err) => console.error('[AggregatorScheduler] task failed:', err),
      ...options,
    };
  }

  get isRunning(): boolean {
    return this.running;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    if (this.options.runImmediately) {
      await this.safeRun();
    }

    this.handle = setInterval(() => {
      void this.safeRun();
    }, this.options.intervalMs);
  }

  stop(): void {
    if (this.handle) {
      clearInterval(this.handle);
      this.handle = null;
    }
    this.running = false;
  }

  async restart(): Promise<void> {
    this.stop();
    await this.start();
  }

  private async safeRun(): Promise<void> {
    try {
      await this.task();
    } catch (error) {
      this.options.onError(error);
    }
  }
}
