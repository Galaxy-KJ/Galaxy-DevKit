/**
 * JSON report + baseline comparison for micro-benchmarks.
 *
 * A suite fails the compare when its p95 is worse than baseline * p95Slack
 * or its throughput (hz) is below baseline * hzFloor.
 */

export interface BenchRow {
  name: string;
  hz: number;
  meanMs: number;
  p95Ms: number;
  samples: number;
}

export interface BenchReport {
  generatedAt: string;
  machine: string;
  rows: BenchRow[];
}

export interface SuiteThreshold {
  p95Slack: number;
  hzFloor: number;
}

export const DEFAULT_THRESHOLD: SuiteThreshold = { p95Slack: 1.2, hzFloor: 0.8 };

/** Argon2 is hardware-sensitive; allow more slack than cache/TWAP. */
export const SUITE_THRESHOLDS: Record<string, SuiteThreshold> = {
  // Cache p95 is sensitive to host scheduling and GC pauses in short CI runs;
  // retain the throughput and hit-vs-miss guards while allowing normal jitter.
  'cache hit': { p95Slack: 1.5, hzFloor: 0.8 },
  'cache miss': { p95Slack: 1.5, hzFloor: 0.8 },
  'encrypt v1 pbkdf2': { p95Slack: 3.0, hzFloor: 0.3 },
  'decrypt v1 pbkdf2': { p95Slack: 3.0, hzFloor: 0.3 },
  'encrypt v2 argon2id': { p95Slack: 3.0, hzFloor: 0.3 },
  'decrypt v2 argon2id': { p95Slack: 3.0, hzFloor: 0.3 },
  // Cache operations run at nanosecond scale, so p99 jitter on shared CI
  // runners can spike well past the default 20% slack without any code
  // change. Keep the throughput floor at 80% (real regressions still fail),
  // but tolerate a 50% p95 swing for these metrics.
  'cache hit': { p95Slack: 1.5, hzFloor: 0.8 },
  'cache miss': { p95Slack: 1.5, hzFloor: 0.8 },
  'cache eviction': { p95Slack: 1.5, hzFloor: 0.8 },
};

export interface CompareFailure {
  name: string;
  metric: 'p95' | 'hz';
  baseline: number;
  observed: number;
  limit: number;
}

export function thresholdFor(name: string): SuiteThreshold {
  const base = SUITE_THRESHOLDS[name] ?? DEFAULT_THRESHOLD;
  const slackMul = Number(process.env.BENCH_SLACK || 1);
  const mul = Number.isFinite(slackMul) && slackMul > 0 ? slackMul : 1;
  return { p95Slack: base.p95Slack * mul, hzFloor: base.hzFloor / mul };
}

export function compareReports(
  baseline: BenchReport,
  observed: BenchReport
): CompareFailure[] {
  const failures: CompareFailure[] = [];
  const observedByName = new Map(observed.rows.map((row) => [row.name, row]));

  for (const base of baseline.rows) {
    const current = observedByName.get(base.name);
    if (!current) continue;
    const t = thresholdFor(base.name);
    const p95Limit = base.p95Ms * t.p95Slack;
    if (current.p95Ms > p95Limit) {
      failures.push({
        name: base.name,
        metric: 'p95',
        baseline: base.p95Ms,
        observed: current.p95Ms,
        limit: p95Limit,
      });
    }
    const hzLimit = base.hz * t.hzFloor;
    if (current.hz < hzLimit) {
      failures.push({
        name: base.name,
        metric: 'hz',
        baseline: base.hz,
        observed: current.hz,
        limit: hzLimit,
      });
    }
  }

  return failures;
}

export function formatFailures(failures: CompareFailure[]): string {
  return failures
    .map(
      (f) =>
        `${f.name} ${f.metric}: observed ${f.observed.toFixed(4)} vs baseline ${f.baseline.toFixed(4)} (limit ${f.limit.toFixed(4)})`
    )
    .join('\n');
}

function hzOf(report: BenchReport, name: string): number | undefined {
  return report.rows.find((row) => row.name === name)?.hz;
}

/** Hardware-independent checks. Catch "cache disabled" without a laptop baseline. */
export function ratioFailures(observed: BenchReport): CompareFailure[] {
  const failures: CompareFailure[] = [];
  const hit = hzOf(observed, 'cache hit');
  const miss = hzOf(observed, 'cache miss');
  if (hit !== undefined && miss !== undefined && hit <= miss) {
    failures.push({
      name: 'cache hit vs miss',
      metric: 'hz',
      baseline: miss,
      observed: hit,
      limit: miss,
    });
  }

  const v2 = hzOf(observed, 'encrypt v2 argon2id');
  const v1 = hzOf(observed, 'encrypt v1 pbkdf2');
  if (v2 !== undefined && v1 !== undefined && v2 >= v1) {
    failures.push({
      name: 'encrypt v2 vs v1',
      metric: 'hz',
      baseline: v1,
      observed: v2,
      limit: v1,
    });
  }

  return failures;
}
