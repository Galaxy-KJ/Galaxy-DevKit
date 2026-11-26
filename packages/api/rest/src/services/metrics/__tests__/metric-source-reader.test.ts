import { MetricSourceReader } from '../metric-source-reader';
import { validateMetric } from '../../../validators/custom-metrics';
import type { SupabaseClient } from '@supabase/supabase-js';
const period = { start: 0, end: 1000 };
function harness(pages: unknown[][], error: unknown = null) {
  const calls: Array<[string, ...unknown[]]> = [];
  const query: Record<string, jest.Mock> = {};
  for (const method of ['select', 'gte', 'lt', 'order', 'range', 'eq']) query[method] = jest.fn((...args) => { calls.push([method, ...args]); return query; });
  query.abortSignal = jest.fn(async () => ({ data: pages.shift() ?? [], error }));
  const db = { from: jest.fn(() => query) };
  return { reader: new MetricSourceReader(db as unknown as SupabaseClient), calls, db, query };
}
const input = { name: 'Count', source: 'transactions', aggregation: 'count', window: '1h', field: 'id' };
const budget = () => ({ remaining: 20000, signal: new AbortController().signal });
test('transaction query always scopes owner, time and bound filters', async () => {
  const { reader, calls, db } = harness([[{ id: 'x', amount: '12.5', asset: 'XLM' }]]);
  const rows = await reader.read('alice', validateMetric({ ...input, filters: { asset: "XLM' OR true--" } }), period, budget());
  expect(db.from).toHaveBeenCalledWith('transactions');
  expect(calls).toContainEqual(['eq', 'user_id', 'alice']);
  expect(calls).toContainEqual(['eq', 'asset', "XLM' OR true--"]);
  expect(calls).toContainEqual(['gte', 'created_at', '1970-01-01T00:00:00.000Z']);
  expect(calls).toContainEqual(['lt', 'created_at', '1970-01-01T00:00:01.000Z']);
  expect(rows[0].amount).toBe(12.5);
});
test('automation executions scope owner through inner relation', async () => {
  const { reader, calls } = harness([[{ id: 'x', automations: { user_id: 'alice', wallet_id: 'wallet' } }]]);
  const rows = await reader.read('alice', validateMetric({ ...input, source: 'automation_executions' }), period, budget());
  expect(calls).toContainEqual(['eq', 'automations.user_id', 'alice']);
  expect(rows[0]).toMatchObject({ user: 'alice', wallet: 'wallet' });
});
test('oracle readings are shared market data with source mapping', async () => {
  const { reader, calls } = harness([[{ id: 'x', symbol: 'XLM', source: 'oracle', price: '0.12' }]]);
  const rows = await reader.read('alice', validateMetric({ ...input, source: 'oracle_prices', field: 'price' }), period, budget());
  expect(calls.some(call => call[1] === 'user_id')).toBe(false);
  expect(rows[0]).toMatchObject({ asset: 'XLM', protocol: 'oracle', price: 0.12 });
});
test('rejects over-budget results instead of returning a partial total', async () => {
  const { reader } = harness([[{ id: 1 }, { id: 2 }]]);
  await expect(reader.read('alice', validateMetric(input), period, { ...budget(), remaining: 1 })).rejects.toMatchObject({ code: 'METRIC_COST_LIMIT' });
});
test('enforces per-source row limit across pages', async () => {
  const { reader } = harness(Array.from({ length: 11 }, () => Array.from({ length: 500 }, () => ({ id: 'x' }))));
  await expect(reader.read('alice', validateMetric(input), period, budget())).rejects.toMatchObject({ code: 'METRIC_COST_LIMIT' });
});
test('aborted and failed queries never look like zero activity', async () => {
  const { reader } = harness([], { message: 'private database details' });
  await expect(reader.read('alice', validateMetric(input), period, budget())).rejects.toMatchObject({ code: 'METRIC_QUERY_FAILED', message: 'Metric source query failed' });
  const controller = new AbortController(); controller.abort();
  await expect(reader.read('alice', validateMetric(input), period, { remaining: 20, signal: controller.signal })).rejects.toMatchObject({ code: 'METRIC_TIMEOUT' });
});
