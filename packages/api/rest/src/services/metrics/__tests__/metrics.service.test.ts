/**
 * @fileoverview Unit tests for MetricsService.
 * @description Covers all aggregations, window types, dimension grouping,
 *              derived metrics, cycle detection, KPI targets, caching, and guardrails.
 * @author Galaxy DevKit Team
 * @since 2026-09-01
 */

import {
  calculatePreviousPeriodRange,
  calculateWindowRange,
  getTtlForWindow,
  MetricsError,
  MetricsService,
} from '../metrics.service';
import {
  CreateMetricDefinitionInput,
  MetricAggregation,
  MetricDefinition,
  MetricWindow,
} from '../../../types/custom-metrics-types';
import { globalCache } from '@galaxy-kj/core-stellar-sdk';

describe('MetricsService Unit Tests', () => {
  let service: MetricsService;
  let mockRepo: any;
  let mockSupabase: any;

  beforeEach(async () => {
    await globalCache.clear();

    mockRepo = {
      create: jest.fn(),
      findById: jest.fn(),
      findByName: jest.fn(),
      list: jest.fn().mockResolvedValue([]),
      countForUser: jest.fn().mockResolvedValue(0),
      update: jest.fn(),
      delete: jest.fn().mockResolvedValue(true),
      saveMaterialization: jest.fn(),
      getLatestMaterialization: jest.fn().mockResolvedValue(null),
    };

    mockSupabase = {
      from: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      gte: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      neq: jest.fn().mockReturnThis(),
      gt: jest.fn().mockReturnThis(),
      lt: jest.fn().mockReturnThis(),
      in: jest.fn().mockReturnThis(),
      ilike: jest.fn().mockReturnThis(),
      then: jest.fn((callback) => callback({ data: [], error: null })),
    };

    service = new MetricsService(mockRepo, mockSupabase as any);
  });

  describe('Aggregations', () => {
    const start = new Date('2026-09-01T00:00:00Z');
    const end = new Date('2026-09-01T01:00:00Z'); // 3600 seconds
    const sampleValues = [10, 20, 30, 40, 50];

    it.each<[MetricAggregation, number]>([
      ['count', 5],
      ['sum', 150],
      ['avg', 30],
      ['min', 10],
      ['max', 50],
      ['p50', 30],
      ['p95', 48],
      ['p99', 49.6],
      ['rate', 5 / 3600],
      ['distinct_count', 5],
    ])('computes %s aggregation correctly', (agg, expected) => {
      const result = service.aggregate(agg, sampleValues, start, end);
      expect(result).toBeCloseTo(expected, 4);
    });

    it('handles distinct_count with duplicates', () => {
      const valuesWithDups = [10, 20, 20, 30, 10];
      const result = service.aggregate('distinct_count', valuesWithDups, start, end);
      expect(result).toBe(3);
    });

    it('handles empty values array gracefully', () => {
      expect(service.aggregate('count', [], start, end)).toBe(0);
      expect(service.aggregate('sum', [], start, end)).toBe(0);
      expect(service.aggregate('avg', [], start, end)).toBe(0);
      expect(service.aggregate('min', [], start, end)).toBe(0);
      expect(service.aggregate('max', [], start, end)).toBe(0);
      expect(service.aggregate('p50', [], start, end)).toBe(0);
      expect(service.aggregate('rate', [], start, end)).toBe(0);
    });
  });

  describe('Window Types & Ranges', () => {
    const fixedNow = new Date('2026-09-15T12:00:00.000Z');

    it.each<[MetricWindow, number]>([
      ['5m', 5 * 60 * 1000],
      ['1h', 60 * 60 * 1000],
      ['24h', 24 * 60 * 60 * 1000],
      ['7d', 7 * 24 * 60 * 60 * 1000],
      ['30d', 30 * 24 * 60 * 60 * 1000],
    ])('calculates rolling window %s range correctly', (window, expectedDuration) => {
      const range = calculateWindowRange(window, fixedNow);
      expect(range.end.getTime()).toBe(fixedNow.getTime());
      expect(range.durationMs).toBe(expectedDuration);
      expect(range.end.getTime() - range.start.getTime()).toBe(expectedDuration);
    });

    it('calculates day_to_date calendar window', () => {
      const range = calculateWindowRange('day_to_date', fixedNow);
      expect(range.start.toISOString()).toBe('2026-09-15T00:00:00.000Z');
      expect(range.end.toISOString()).toBe(fixedNow.toISOString());
    });

    it('calculates week_to_date calendar window', () => {
      // 2026-09-15 is Tuesday. Monday is 2026-09-14.
      const range = calculateWindowRange('week_to_date', fixedNow);
      expect(range.start.toISOString()).toBe('2026-09-14T00:00:00.000Z');
    });

    it('calculates month_to_date calendar window', () => {
      const range = calculateWindowRange('month_to_date', fixedNow);
      expect(range.start.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    });

    it('calculates previous period for rolling 24h window', () => {
      const current = calculateWindowRange('24h', fixedNow);
      const prev = calculatePreviousPeriodRange(current.start, current.end, '24h');
      expect(prev.end.getTime()).toBe(current.start.getTime());
      expect(prev.end.getTime() - prev.start.getTime()).toBe(current.durationMs);
    });

    it('derives appropriate cache TTL for windows', () => {
      expect(getTtlForWindow('5m')).toBe(30 * 1000);
      expect(getTtlForWindow('1h')).toBe(2 * 60 * 1000);
      expect(getTtlForWindow('24h')).toBe(15 * 60 * 1000);
      expect(getTtlForWindow('7d')).toBe(60 * 60 * 1000);
      expect(getTtlForWindow('30d')).toBe(6 * 60 * 60 * 1000);
      expect(getTtlForWindow('day_to_date')).toBe(5 * 60 * 1000);
    });
  });

  describe('Derived Metrics & Cycle Detection', () => {
    it('evaluates safe arithmetic expressions', () => {
      const res1 = service.evaluateArithmeticExpression('failed_tx / total_tx', {
        failed_tx: 5,
        total_tx: 100,
      });
      expect(res1).toBe(0.05);

      const res2 = service.evaluateArithmeticExpression('(a + b) * c', {
        a: 10,
        b: 20,
        c: 3,
      });
      expect(res2).toBe(90);

      const res3 = service.evaluateArithmeticExpression('val / 0', { val: 50 });
      expect(res3).toBe(0);
    });

    it('rejects direct self-cycle at save time', async () => {
      await expect(
        service.validateFormulaAndDetectCycles('user-1', 'swap_rate', 'swap_rate * 1.05')
      ).rejects.toThrow(MetricsError);
    });

    it('rejects 2-step cycle A -> B -> A', async () => {
      const defB: MetricDefinition = {
        id: 'metric-b',
        userId: 'user-1',
        name: 'metric_b',
        source: 'transactions',
        aggregation: 'sum',
        window: '24h',
        dimensions: [],
        filters: [],
        unit: '',
        enabled: true,
        formula: 'metric_a + 10',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepo.list.mockResolvedValue([defB]);

      await expect(
        service.validateFormulaAndDetectCycles('user-1', 'metric_a', 'metric_b * 2')
      ).rejects.toThrow(/Cycle detected in derived metric definition/);
    });

    it('rejects multi-step deep cycle A -> B -> C -> A', async () => {
      const defB: MetricDefinition = {
        id: 'metric-b',
        userId: 'user-1',
        name: 'metric_b',
        source: 'transactions',
        aggregation: 'sum',
        window: '24h',
        dimensions: [],
        filters: [],
        unit: '',
        enabled: true,
        formula: 'metric_c * 2',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const defC: MetricDefinition = {
        id: 'metric-c',
        userId: 'user-1',
        name: 'metric_c',
        source: 'transactions',
        aggregation: 'sum',
        window: '24h',
        dimensions: [],
        filters: [],
        unit: '',
        enabled: true,
        formula: 'metric_a - 5',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepo.list.mockResolvedValue([defB, defC]);

      await expect(
        service.validateFormulaAndDetectCycles('user-1', 'metric_a', 'metric_b + 1')
      ).rejects.toThrow(/Cycle detected/);
    });

    it('allows valid DAG without cycles', async () => {
      const defBase1: MetricDefinition = {
        id: 'base-1',
        userId: 'user-1',
        name: 'base_1',
        source: 'transactions',
        aggregation: 'count',
        window: '24h',
        dimensions: [],
        filters: [],
        unit: '',
        enabled: true,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const defBase2: MetricDefinition = {
        id: 'base-2',
        userId: 'user-1',
        name: 'base_2',
        source: 'transactions',
        aggregation: 'sum',
        window: '24h',
        dimensions: [],
        filters: [],
        unit: '',
        enabled: true,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepo.list.mockResolvedValue([defBase1, defBase2]);

      await expect(
        service.validateFormulaAndDetectCycles('user-1', 'derived_kpi', 'base_2 / base_1')
      ).resolves.not.toThrow();
    });
  });

  describe('KPI Targets & Trends', () => {
    it('evaluates improving trend when higher_is_better and value increases', async () => {
      const def: MetricDefinition = {
        id: 'def-1',
        userId: 'user-1',
        name: 'swap_volume',
        source: 'transactions',
        aggregation: 'sum',
        targetField: 'amount',
        window: '24h',
        dimensions: [],
        filters: [],
        unit: 'USD',
        enabled: true,
        target: 1000,
        direction: 'higher_is_better',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepo.findById.mockResolvedValue(def);

      // First query (current window) returns amount 1200
      // Second query (previous window) returns amount 800
      let callCount = 0;
      mockSupabase.then = jest.fn((callback) => {
        callCount++;
        const amount = callCount === 1 ? 1200 : 800;
        return callback({ data: [{ amount }], error: null });
      });

      const res = await service.getValue('def-1', 'user-1');

      expect(res.currentValue).toBe(1200);
      expect(res.previousValue).toBe(800);
      expect(res.delta).toBe(400);
      expect(res.deltaPct).toBe(50);
      expect(res.trend).toBe('improving');
      expect(res.targetMet).toBe(true);
    });

    it('evaluates improving trend when lower_is_better and value decreases', async () => {
      const def: MetricDefinition = {
        id: 'def-2',
        userId: 'user-1',
        name: 'failed_tx_count',
        source: 'transactions',
        aggregation: 'count',
        window: '24h',
        dimensions: [],
        filters: [],
        unit: 'count',
        enabled: true,
        target: 10,
        direction: 'lower_is_better',
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepo.findById.mockResolvedValue(def);

      let callCount = 0;
      mockSupabase.then = jest.fn((callback) => {
        callCount++;
        // current: 5 rows, previous: 20 rows
        const rows = callCount === 1 ? Array(5).fill({ amount: 1 }) : Array(20).fill({ amount: 1 });
        return callback({ data: rows, error: null });
      });

      const res = await service.getValue('def-2', 'user-1');

      expect(res.currentValue).toBe(5);
      expect(res.previousValue).toBe(20);
      expect(res.delta).toBe(-15);
      expect(res.trend).toBe('improving');
      expect(res.targetMet).toBe(true);
    });
  });

  describe('Caching with Window-derived TTL', () => {
    it('serves repeated reads inside the TTL from cache', async () => {
      const def: MetricDefinition = {
        id: 'def-cached',
        userId: 'user-1',
        name: 'tx_count_30d',
        source: 'transactions',
        aggregation: 'count',
        window: '30d',
        dimensions: [],
        filters: [],
        unit: 'count',
        enabled: true,
        metadata: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockRepo.findById.mockResolvedValue(def);

      let queryCalls = 0;
      mockSupabase.then = jest.fn((callback) => {
        queryCalls++;
        return callback({ data: [{ amount: 100 }], error: null });
      });

      // First read: queries DB
      const res1 = await service.getValue('def-cached', 'user-1');
      expect(res1.cached).toBe(false);
      expect(queryCalls).toBeGreaterThan(0);

      const dbCallsAfterFirst = queryCalls;

      // Second read: served from cache
      const res2 = await service.getValue('def-cached', 'user-1');
      expect(res2.cached).toBe(true);
      expect(res2.currentValue).toBe(res1.currentValue);
      // DB was NOT queried again
      expect(queryCalls).toBe(dbCallsAfterFirst);
    });
  });

  describe('Guardrails & Validation', () => {
    it('enforces per-user definition cap', async () => {
      mockRepo.countForUser.mockResolvedValue(50);

      const input: CreateMetricDefinitionInput = {
        name: 'over_limit',
        source: 'transactions',
        aggregation: 'count',
        window: '24h',
      };

      await expect(service.createDefinition('user-1', input)).rejects.toThrow(
        /Per-user metric definition limit reached/
      );
    });

    it('rejects unsupported source with clear validation error', async () => {
      const input = {
        name: 'bad_source',
        source: 'invalid_source' as any,
        aggregation: 'count' as any,
        window: '24h' as any,
      };

      await expect(service.createDefinition('user-1', input)).rejects.toThrow(
        /Source "invalid_source" is not supported/
      );
    });

    it('rejects unsupported aggregation with clear validation error', async () => {
      const input = {
        name: 'bad_agg',
        source: 'transactions' as any,
        aggregation: 'magic_formula' as any,
        window: '24h' as any,
      };

      await expect(service.createDefinition('user-1', input)).rejects.toThrow(
        /Aggregation "magic_formula" is not supported/
      );
    });
  });
});
