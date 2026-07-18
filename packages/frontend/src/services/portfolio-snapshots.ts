export type SnapshotSeries = 'portfolio' | 'price';

export interface Snapshot {
  ts: number;
  series: SnapshotSeries;
  value: number;
}

export interface SeriesDelta {
  base: number;
  latest: number;
  absolute: number;
  percent: number;
}

type Listener = (snapshots: Snapshot[]) => void;

export const SNAPSHOT_STORAGE_KEY = 'galaxy_portfolio_snapshots_v1';
export const MAX_SNAPSHOTS = 500;

function hasStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readSnapshots(): Snapshot[] {
  if (!hasStorage()) return [];
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Snapshot[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeSnapshots(snapshots: Snapshot[]): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify(snapshots));
  } catch {
    // Persistence is best-effort; a full quota must not break in-memory tracking.
  }
}

function toDelta(base: number, latest: number): SeriesDelta {
  const absolute = latest - base;
  return {
    base,
    latest,
    absolute,
    percent: base !== 0 ? (absolute / base) * 100 : 0,
  };
}

export class PortfolioSnapshotStore {
  private snapshots: Snapshot[];
  private listeners: Set<Listener>;

  constructor() {
    this.snapshots = readSnapshots();
    this.listeners = new Set();
  }

  append(series: SnapshotSeries, value: number, ts: number = Date.now()): Snapshot {
    const snapshot: Snapshot = { ts, series, value };
    const next = [...this.snapshots, snapshot];
    this.snapshots = next.slice(Math.max(0, next.length - MAX_SNAPSHOTS));
    this.persistAndNotify();
    return snapshot;
  }

  series(series: SnapshotSeries): Snapshot[] {
    return this.snapshots
      .filter((snapshot) => snapshot.series === series)
      .sort((a, b) => a.ts - b.ts);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener([...this.snapshots]);
    return () => this.listeners.delete(listener);
  }

  delta(series: SnapshotSeries): SeriesDelta | null {
    const points = this.series(series);
    if (points.length === 0) return null;
    return toDelta(points[0].value, points[points.length - 1].value);
  }

  deltaSince(series: SnapshotSeries, windowMs: number, now: number = Date.now()): SeriesDelta | null {
    const points = this.series(series);
    if (points.length === 0) return null;

    const cutoff = now - windowMs;
    const withinWindow = [...points].reverse().find((point) => point.ts <= cutoff);
    const base = withinWindow ?? points[0];
    return toDelta(base.value, points[points.length - 1].value);
  }

  clear(): void {
    this.snapshots = [];
    this.persistAndNotify();
  }

  private persistAndNotify(): void {
    writeSnapshots(this.snapshots);
    const snapshot = [...this.snapshots];
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
