import { Bench } from 'tinybench';
import { PriceHistoryStore } from '../../../core/oracles/src/twap/price-history-store.ts';
import { TWAPCalculator } from '../../../core/oracles/src/twap/twap-calculator.ts';

export async function oracleTwapBench(): Promise<Bench> {
  const store = new PriceHistoryStore();
  const calc = new TWAPCalculator(store);
  const now = Date.now();
  for (let i = 0; i < 64; i += 1) {
    await calc.recordPrice('XLM/USD', 0.1 + i * 0.001, now - (64 - i) * 1000);
  }

  const bench = new Bench({ time: 300, warmupTime: 50 });
  bench.add('oracle twap 64 samples', async () => {
    await calc.getTWAP('XLM/USD', { windowMs: 120_000, minDataPoints: 8 });
  });
  return bench;
}
