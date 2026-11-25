import { aggregate, AGGREGATIONS, assertAcyclic, evaluateExpression, groupSamples, metricPeriods } from '../metric-engine';

const period = { start: 0, end: 2_000 };

describe('custom metric aggregations', () => {
  test.each([
    ['count', 4], ['sum', 10], ['avg', 2.5], ['min', 1], ['max', 4],
    ['p50', 2.5], ['p95', 3.85], ['p99', 3.97], ['rate', 2], ['distinct_count', 4],
  ] as const)('%s returns the expected value', (aggregation, expected) => {
    expect(aggregate(aggregation, [4, 1, 3, 2], period)).toBeCloseTo(expected);
  });
  test.each(AGGREGATIONS)('%s handles an empty window', aggregation => {
    expect(aggregate(aggregation, [], period)).toBe(
      ['count', 'rate', 'distinct_count'].includes(aggregation) ? 0 : null,
    );
  });
  test('numeric aggregates ignore missing samples without coercion', () => {
    expect(aggregate('avg', [null, undefined, '', '12', NaN, Infinity, 4], period)).toBe(4);
    expect(aggregate('count', [null, 4], period)).toBe(2);
    expect(aggregate('distinct_count', ['a', 'a', 1, '1', null], period)).toBe(3);
    expect(aggregate('rate', [], { start: 0, end: 0 })).toBeNull();
    expect(aggregate('sum', [Number.MAX_VALUE, Number.MAX_VALUE], period)).toBeNull();
  });
  test('invalid inputs are rejected, even with no samples', () => {
    expect(() => aggregate('unsafe' as never, [], period)).toThrow('Unsupported');
    expect(() => aggregate('avg', [], { start: NaN, end: 1 })).toThrow('Invalid');
  });
});

describe('UTC windows', () => {
  const now = Date.parse('2026-03-18T12:00:00Z');
  test.each([
    ['5m', 300_000], ['1h', 3_600_000], ['24h', 86_400_000],
    ['7d', 604_800_000], ['30d', 2_592_000_000],
  ] as const)('%s has two adjacent equal-length periods', (window, size) => {
    expect(metricPeriods(window, now)).toEqual({
      current: { start: now - size, end: now }, previous: { start: now - 2 * size, end: now - size },
    });
  });
  test.each([
    ['day_to_date', '2026-03-18T00:00:00Z', '2026-03-17T00:00:00Z', '2026-03-17T12:00:00Z'],
    ['week_to_date', '2026-03-16T00:00:00Z', '2026-03-09T00:00:00Z', '2026-03-11T12:00:00Z'],
    ['month_to_date', '2026-03-01T00:00:00Z', '2026-02-01T00:00:00Z', '2026-02-18T12:00:00Z'],
  ] as const)('%s compares matching elapsed calendar periods', (window, start, previous, end) => {
    expect(metricPeriods(window, now)).toEqual({
      current: { start: Date.parse(start), end: now }, previous: { start: Date.parse(previous), end: Date.parse(end) },
    });
  });
  test('shorter months and leap years cap previous periods correctly', () => {
    const result = metricPeriods('month_to_date', Date.parse('2024-03-31T12:00:00Z'));
    expect(result.previous).toEqual({ start: Date.parse('2024-02-01Z'), end: Date.parse('2024-03-01Z') });
  });
  test('Sunday belongs to the preceding Monday-based week', () => {
    expect(metricPeriods('week_to_date', Date.parse('2026-03-22T12:00:00Z')).current.start).toBe(Date.parse('2026-03-16Z'));
  });
});

test('grouping preserves tuple boundaries, missing dimensions and global aggregation', () => {
  const rows = [
    { protocol: 'a|b', asset: 'c', amount: 10 },
    { protocol: 'a', asset: 'b|c', amount: 20 },
    { protocol: 'a|b', asset: 'c', amount: 30 },
    { protocol: null, amount: 5 },
  ];
  const groups = groupSamples(rows, ['protocol', 'asset'], 'amount');
  expect(groups).toHaveLength(3);
  expect(groups[0].samples).toEqual([10, 30]);
  expect(groups[2].dimensions).toEqual({ protocol: null, asset: null });
  expect(groupSamples(rows, [], 'amount')[0].samples).toEqual([10, 20, 30, 5]);
});

describe('derived metrics', () => {
  test('arithmetic obeys precedence, parentheses and unary signs', () => {
    expect(evaluateExpression('failed_tx / total_tx * 100', { failed_tx: 2, total_tx: 8 })).toBe(25);
    expect(evaluateExpression('-(a + 2) * +3', { a: 4 })).toBe(-18);
  });
  test.each(['1/0', 'empty + 1'])('undefined numerical result is null: %s', expression => {
    expect(evaluateExpression(expression, { empty: null })).toBeNull();
  });
  test.each(['process.exit()', 'a.constructor', '1; 2', '2 ** 3', 'missing', '(1', '1 2', '', '1 +'])('rejects invalid expression %s', expression => {
    expect(() => evaluateExpression(expression, {})).toThrow();
  });
  test('bounds nesting and expression size', () => {
    expect(() => evaluateExpression('('.repeat(17) + '1' + ')'.repeat(17), {})).toThrow();
    expect(() => evaluateExpression('1+'.repeat(100) + '1', {})).toThrow();
  });
  test('DAGs work while self/indirect cycles and missing references fail', () => {
    expect(() => assertAcyclic(new Map([['a', []], ['b', ['a']], ['c', ['a', 'b']]]))).not.toThrow();
    expect(() => assertAcyclic(new Map([['a', ['a']]]))).toThrow('Cyclic');
    expect(() => assertAcyclic(new Map([['a', ['b']], ['b', ['a']]]))).toThrow('Cyclic');
    expect(() => assertAcyclic(new Map([['a', ['missing']]]))).toThrow('Unknown');
  });
});
