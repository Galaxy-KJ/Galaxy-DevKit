/**
 * @jest-environment jest-environment-jsdom
 */

import {
  PortfolioSnapshotStore,
  SNAPSHOT_STORAGE_KEY,
  MAX_SNAPSHOTS,
} from '../services/portfolio-snapshots';

describe('PortfolioSnapshotStore', () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  it('appends snapshots and returns each series in chronological order', () => {
    const store = new PortfolioSnapshotStore();
    store.append('portfolio', 100, 3);
    store.append('portfolio', 90, 1);
    store.append('price', 0.5, 2);

    expect(store.series('portfolio').map((s) => s.value)).toEqual([90, 100]);
    expect(store.series('price').map((s) => s.value)).toEqual([0.5]);
  });

  it('persists under a versioned key and reloads in a new instance', () => {
    const store = new PortfolioSnapshotStore();
    store.append('portfolio', 100, 1);

    expect(localStorage.getItem(SNAPSHOT_STORAGE_KEY)).not.toBeNull();
    expect(new PortfolioSnapshotStore().series('portfolio')).toHaveLength(1);
  });

  it('caps total entries and drops the oldest', () => {
    const store = new PortfolioSnapshotStore();
    for (let i = 0; i < MAX_SNAPSHOTS + 5; i++) {
      store.append('portfolio', i, i);
    }

    const values = store.series('portfolio');
    expect(values).toHaveLength(MAX_SNAPSHOTS);
    expect(values[0].value).toBe(5);
  });

  it('does not throw when the write fails', () => {
    const store = new PortfolioSnapshotStore();
    jest
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('quota exceeded');
      });

    expect(() => store.append('portfolio', 100, 1)).not.toThrow();
    expect(store.series('portfolio')).toHaveLength(1);
  });

  it('notifies subscribers immediately and on append', () => {
    const store = new PortfolioSnapshotStore();
    const listener = jest.fn();
    store.subscribe(listener);
    expect(listener).toHaveBeenCalledTimes(1);

    store.append('portfolio', 100, 1);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('stops notifying after unsubscribe', () => {
    const store = new PortfolioSnapshotStore();
    const listener = jest.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();

    store.append('portfolio', 100, 1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('derives the delta against the first snapshot of a series', () => {
    const store = new PortfolioSnapshotStore();
    store.append('portfolio', 200, 1);
    store.append('portfolio', 260, 2);

    expect(store.delta('portfolio')).toEqual({
      base: 200,
      latest: 260,
      absolute: 60,
      percent: 30,
    });
  });

  it('returns a zero percent when the first snapshot value is zero', () => {
    const store = new PortfolioSnapshotStore();
    store.append('portfolio', 0, 1);
    store.append('portfolio', 50, 2);

    expect(store.delta('portfolio')?.percent).toBe(0);
  });

  it('returns null delta when a series has no snapshots', () => {
    const store = new PortfolioSnapshotStore();
    expect(store.delta('price')).toBeNull();
  });

  it('measures the windowed delta against the snapshot before the cutoff', () => {
    const store = new PortfolioSnapshotStore();
    const hour = 60 * 60 * 1000;
    const now = 100 * hour;
    store.append('portfolio', 100, now - 30 * hour);
    store.append('portfolio', 150, now - 10 * hour);
    store.append('portfolio', 180, now);

    const delta = store.deltaSince('portfolio', 24 * hour, now);
    expect(delta).toEqual({ base: 100, latest: 180, absolute: 80, percent: 80 });
  });

  it('falls back to the first snapshot when history is younger than the window', () => {
    const store = new PortfolioSnapshotStore();
    const hour = 60 * 60 * 1000;
    const now = 100 * hour;
    store.append('portfolio', 120, now - 2 * hour);
    store.append('portfolio', 132, now);

    const delta = store.deltaSince('portfolio', 24 * hour, now);
    expect(delta).toEqual({ base: 120, latest: 132, absolute: 12, percent: 10 });
  });

  it('recovers from a corrupted payload', () => {
    localStorage.setItem(SNAPSHOT_STORAGE_KEY, '{not-json');
    expect(new PortfolioSnapshotStore().series('portfolio')).toEqual([]);
  });

  it('ignores a non-array payload', () => {
    localStorage.setItem(SNAPSHOT_STORAGE_KEY, JSON.stringify({ bad: true }));
    expect(new PortfolioSnapshotStore().series('portfolio')).toEqual([]);
  });

  it('clears all snapshots', () => {
    const store = new PortfolioSnapshotStore();
    store.append('portfolio', 100, 1);
    store.clear();
    expect(store.series('portfolio')).toEqual([]);
  });
});
