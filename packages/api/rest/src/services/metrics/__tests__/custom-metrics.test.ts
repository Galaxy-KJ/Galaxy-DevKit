import { validateMetric } from '../../../validators/custom-metrics';
import { CustomMetricsService, MetricCache } from '../custom-metrics.service';
import { MetricRepository } from '../metric-repository';
import { MetricSourceReader } from '../metric-source-reader';
import { MetricDefinition } from '../../../types/custom-metrics';

const id = '11111111-1111-4111-8111-111111111111';
const input = { name: 'Count', source: 'transactions', aggregation: 'count', window: '1h', field: 'id' };
const definition: MetricDefinition = { ...validateMetric(input), id, userId: 'alice', revision: 'one' };
function harness(definitions = [definition]) {
  const repo = { list: jest.fn(async () => definitions), save: jest.fn(async (_owner: string, batch: MetricDefinition[]) => batch), snapshot: jest.fn(async () => null), materialize: jest.fn(async () => undefined) };
  const reader = { estimate: jest.fn().mockResolvedValue(undefined), read: jest.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]) };
  const entries = new Map<string, unknown>();
  const cache: MetricCache = { getOrFetch: async <T>(_type: 'static-data', key: string, callback: () => Promise<T>) => {
    if (!entries.has(key)) entries.set(key, await callback());
    return entries.get(key) as T;
  } };
  const service = new CustomMetricsService(repo as unknown as MetricRepository, reader as unknown as MetricSourceReader, cache, () => Date.parse('2026-11-25T12:00:00Z'));
  return { repo, reader, service, definitions };
}

describe('persisted metric validation', () => {
  test.each(['api_request_logs', 'wallet_events', 'defi_positions'])('rejects unrecorded source %s', source => {
    expect(() => validateMetric({ ...input, source })).toThrow();
  });
  test('requires asset separation and does not invent USD', () => {
    expect(() => validateMetric({ ...input, aggregation: 'sum', field: 'amount' })).toThrow('asset');
    expect(() => validateMetric({ ...input, aggregation: 'sum', field: 'amount', filters: { asset: 'XLM' }, unit: 'USD' })).toThrow('USD');
    expect(validateMetric({ ...input, aggregation: 'sum', field: 'amount', dimensions: ['asset'] }).dimensions).toEqual(['asset']);
  });
  test('rejects unavailable dimensions, columns and expression syntax', () => {
    for (const patch of [{ dimensions: ['team'] }, { field: 'amount_usd' }, { filters: { endpoint: '/' } }, { source: 'derived', expression: 'process.exit()', references: { x: id } }]) expect(() => validateMetric({ ...input, ...patch })).toThrow();
  });
});

describe('metric service boundaries', () => {
  test('isolates cache by owner and definition revision', async () => {
    const { service, reader, definitions, repo } = harness();
    await service.value('alice', id);
    await service.value('alice', id);
    expect(reader.read).toHaveBeenCalledTimes(2);
    await service.value('bob', id);
    expect(reader.read).toHaveBeenCalledTimes(4);
    expect(reader.read.mock.calls[2][0]).toBe('bob');
    definitions[0] = { ...definition, revision: 'two' };
    await service.value('alice', id);
    expect(reader.read).toHaveBeenCalledTimes(6);
    expect(repo.list).toHaveBeenCalledWith('alice');
  });
  test('preview computes current/previous without storing or materializing', async () => {
    const { service, repo } = harness();
    const result = await service.preview('alice', { ...input, target: 1, direction: 'higher_is_better' });
    expect(result.groups[0]).toMatchObject({ value: 2, previous: 2, delta: 0, trend: 'flat', targetMet: true });
    expect(repo.save).not.toHaveBeenCalled();
    expect(repo.materialize).not.toHaveBeenCalled();
  });
  test('missing and foreign references fail before writes or source reads', async () => {
    const { service, repo, reader } = harness([]);
    await expect(service.value('alice', id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.save('alice', { ...input, source: 'derived', expression: 'x+1', references: { x: id } })).rejects.toMatchObject({ code: 'INVALID_METRIC_GRAPH' });
    expect(repo.save).not.toHaveBeenCalled();
    expect(reader.read).not.toHaveBeenCalled();
  });
  test('rejects self cycles on update', async () => {
    const { service, repo } = harness();
    await expect(service.save('alice', { ...input, source: 'derived', expression: 'x', references: { x: id } }, id)).rejects.toThrow('Cyclic');
    expect(repo.save).not.toHaveBeenCalled();
  });
  test('derived ratio and zero denominators preserve missing values', async () => {
    const { service } = harness();
    const result = await service.preview('alice', { ...input, source: 'derived', expression: 'x / (x - 2)', references: { x: id } });
    expect(result.groups[0].value).toBeNull();
  });
  test('import remaps IDs and references atomically', async () => {
    const { service, repo } = harness([]);
    const derivedId = '22222222-2222-4222-8222-222222222222';
    await service.import('alice', { schemaVersion: 1, definitions: [{ ...input, id }, { ...input, id: derivedId, source: 'derived', expression: 'x*2', references: { x: id } }] });
    const batch = repo.save.mock.calls[0][1];
    expect(batch[0].id).not.toBe(id);
    expect(batch[1].references?.x).toBe(batch[0].id);
    expect(repo.save).toHaveBeenCalledTimes(1);
  });
  test('series rejects oversized ranges before querying', async () => {
    const { service, reader } = harness();
    await expect(service.series('alice', id, 0, 10000000000, 60000)).rejects.toMatchObject({ code: 'INVALID_SERIES' });
    expect(reader.read).not.toHaveBeenCalled();
  });
});


test('rejects estimated scan before persisting a definition', async () => {
  const { service, reader, repo } = harness();
  reader.estimate.mockRejectedValue(new Error('Estimated scan exceeds limit'));
  await expect(service.save('alice', input)).rejects.toThrow('Estimated scan');
  expect(repo.save).not.toHaveBeenCalled();
});
test('PATCH merges fields while preserving owner-scoped definition identity', async () => {
  const { service, repo } = harness();
  await service.patch('alice', id, { name: 'Renamed' });
  expect(repo.save).toHaveBeenCalledWith('alice', [expect.objectContaining({ name: 'Renamed', id, source: 'transactions' })]);
});
