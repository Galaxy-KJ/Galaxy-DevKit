import { logger } from '@galaxy-kj/api-logger';
import { CustomMetricsService } from '../services/metrics/custom-metrics.service';

/** Run one instance with the existing worker process; bounded batches never overlap. */
export class MetricMaterializationWorker {
  private timer?: NodeJS.Timeout;
  private busy = false;
  private cursor = '00000000-0000-0000-0000-000000000000';
  constructor(private readonly service = new CustomMetricsService(), private readonly intervalMs = 60_000) {}
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => { void this.tick().catch(error => logger.error({ err: error }, 'Metric materialization failed')); }, this.intervalMs);
  }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = undefined; }
  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const definitions = await this.service.repository.scheduled(this.cursor, 10);
      for (const definition of definitions) {
        try { await this.service.value(definition.user_id, definition.id, {}, true); }
        catch (error) { logger.warn({ err: error, metricId: definition.id }, 'Metric could not be materialized'); }
        this.cursor = definition.id;
      }
      if (definitions.length < 10) this.cursor = '00000000-0000-0000-0000-000000000000';
    } finally { this.busy = false; }
  }
}
