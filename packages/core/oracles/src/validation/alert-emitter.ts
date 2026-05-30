import { PriceAnomaly, PriceAnomalyReport } from './anomaly-detector.js';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AlertEvent {
  severity: AlertSeverity;
  symbol: string;
  message: string;
  timestamp: Date;
  anomalyType: 'stale' | 'outlier' | 'flash_crash' | 'source_disagreement';
  details: PriceAnomaly;
  fullReport?: PriceAnomalyReport;
  source?: string;
}

export type AlertCallback = (event: AlertEvent) => void | Promise<void>;

export interface AlertEmitterConfig {
  logToConsole: boolean;
  logLevel: AlertSeverity;
  callbacks: AlertCallback[];
}

const DEFAULT_CONFIG: AlertEmitterConfig = {
  logToConsole: true,
  logLevel: 'warning',
  callbacks: [],
};

function severityWeight(s: AlertSeverity): number {
  switch (s) {
    case 'info': return 0;
    case 'warning': return 1;
    case 'critical': return 2;
  }
}

export class AlertEmitter {
  private config: AlertEmitterConfig;
  private history: AlertEvent[] = [];
  private readonly maxHistory = 1000;

  constructor(config: Partial<AlertEmitterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  onAnomaly(
    symbol: string,
    anomaly: PriceAnomaly,
    fullReport?: PriceAnomalyReport
  ): AlertEvent {
    const severity = this.classifySeverity(anomaly.type);

    const event: AlertEvent = {
      severity,
      symbol,
      message: anomaly.message,
      timestamp: new Date(),
      anomalyType: anomaly.type,
      details: anomaly,
      fullReport,
      source: anomaly.source,
    };

    this.emit(event);
    return event;
  }

  onReport(symbol: string, report: PriceAnomalyReport): AlertEvent[] {
    const events: AlertEvent[] = [];

    for (const stale of report.stale) {
      events.push(this.onAnomaly(symbol, stale, report));
    }

    for (const outlier of report.outliers) {
      events.push(this.onAnomaly(symbol, outlier, report));
    }

    if (report.flashCrash) {
      events.push(this.onAnomaly(symbol, report.flashCrash, report));
    }

    if (report.sourceDisagreement) {
      events.push(this.onAnomaly(symbol, report.sourceDisagreement, report));
    }

    return events;
  }

  private emit(event: AlertEvent): void {
    if (
      this.config.logToConsole &&
      severityWeight(event.severity) >= severityWeight(this.config.logLevel)
    ) {
      this.consoleLog(event);
    }

    for (const cb of this.config.callbacks) {
      try {
        const result = cb(event);
        if (result && typeof result.then === 'function') {
          result.catch((err) =>
            console.error('[AlertEmitter] callback error:', err)
          );
        }
      } catch (err) {
        console.error('[AlertEmitter] callback error:', err);
      }
    }

    this.history.push(event);
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
  }

  private consoleLog(event: AlertEvent): void {
    const prefix = `[${event.severity.toUpperCase()}]`;
    const symbol = `[${event.symbol}]`;
    console.warn(`${prefix} ${symbol} ${event.message}`, {
      anomalyType: event.anomalyType,
      source: event.source,
      timestamp: event.timestamp.toISOString(),
    });
  }

  getHistory(): ReadonlyArray<AlertEvent> {
    return this.history;
  }

  getRecentHistory(count: number = 10): AlertEvent[] {
    return this.history.slice(-count);
  }

  clearHistory(): void {
    this.history = [];
  }

  updateConfig(config: Partial<AlertEmitterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  private classifySeverity(type: string): AlertSeverity {
    switch (type) {
      case 'flash_crash':
        return 'critical';
      case 'source_disagreement':
        return 'warning';
      case 'stale':
        return 'warning';
      case 'outlier':
        return 'info';
      default:
        return 'info';
    }
  }
}
