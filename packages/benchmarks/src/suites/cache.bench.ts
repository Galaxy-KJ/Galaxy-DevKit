import { Bench } from 'tinybench';
import { CacheManager } from '../../../core/stellar-sdk/src/cache/cache-manager.ts';

export async function cacheBench(): Promise<Bench> {
  const manager = new CacheManager({
    'horizon-response': { ttlMs: 60_000, maxSize: 32, staleWhileRevalidate: false, swrTtlMs: 0 },
  });

  let fetchCount = 0;
  const fetchFn = async () => {
    fetchCount += 1;
    return { n: fetchCount };
  };

  await manager.getOrFetch('horizon-response', 'warm', fetchFn);

  const injectMiss = process.env.BENCH_INJECT_CACHE_MISS === '1';

  const bench = new Bench({ time: 300, warmupTime: 50 });

  bench
    .add('cache hit', async () => {
      if (injectMiss) {
        await manager.getOrFetch('horizon-response', `miss-${Math.random()}`, fetchFn);
      } else {
        await manager.getOrFetch('horizon-response', 'warm', fetchFn);
      }
    })
    .add('cache miss', async () => {
      await manager.getOrFetch('horizon-response', `miss-${Math.random()}`, fetchFn);
    })
    .add('cache eviction', async () => {
      const tiny = new CacheManager({
        'static-data': { ttlMs: 60_000, maxSize: 8, staleWhileRevalidate: false, swrTtlMs: 0 },
      });
      for (let i = 0; i < 16; i += 1) {
        await tiny.set('static-data', `k-${i}`, i);
      }
    })
    .add('cache dedup', async () => {
      let calls = 0;
      const slow = async () => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 5));
        return calls;
      };
      const key = `dedup-${Math.random()}`;
      await Promise.all([
        manager.getOrFetch('horizon-response', key, slow),
        manager.getOrFetch('horizon-response', key, slow),
        manager.getOrFetch('horizon-response', key, slow),
      ]);
    });

  return bench;
}
