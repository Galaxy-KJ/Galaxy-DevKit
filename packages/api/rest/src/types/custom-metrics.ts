import type { Aggregation, MetricWindow } from '../services/metrics/metric-engine';

export type MetricSource = 'transactions' | 'oracle_prices' | 'automation_executions';
export type Dimension = 'asset' | 'protocol' | 'network' | 'wallet' | 'user' | 'team' | 'endpoint';
export interface MetricInput {
  name: string;
  description: string;
  source: MetricSource | 'derived';
  aggregation: Aggregation;
  window: MetricWindow;
  dimensions: Dimension[];
  filters: Record<string, string>;
  field: string;
  unit: string;
  enabled: boolean;
  expression?: string;
  references?: Record<string, string>;
  target?: number;
  direction?: 'higher_is_better' | 'lower_is_better';
}
export interface MetricDefinition extends MetricInput { id: string; userId: string; revision: string }
export interface MetricGroup {
  dimensions: Record<string, string | number | null>;
  value: number | null;
  previous: number | null;
  delta: number | null;
  trend: 'improving' | 'worsening' | 'flat' | 'unknown';
  target: number | null;
  targetMet: boolean | null;
}
export interface MetricValue { id: string; evaluatedAt: string; expiresAt: string; groups: MetricGroup[] }
export class MetricsError extends Error {
  constructor(public readonly statusCode: number, public readonly code: string, message: string) { super(message); }
}
