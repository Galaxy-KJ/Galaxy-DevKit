import { Bench } from 'tinybench';
import { SmartRouter } from '../../../core/defi-protocols/src/services/smart-router.ts';
import type { AggregatorQuote } from '../../../core/defi-protocols/src/aggregator/types.ts';
import type { Asset } from '../../../core/defi-protocols/src/types/defi-types.ts';

const xlm: Asset = { code: 'XLM', type: 'native' };
const usdc: Asset = {
  code: 'USDC',
  issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  type: 'credit_alphanum4',
};
const aqua: Asset = {
  code: 'AQUA',
  issuer: 'GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA',
  type: 'credit_alphanum4',
};

function quote(assetIn: Asset, assetOut: Asset, amount: string): AggregatorQuote {
  const out = String(Number(amount) * 0.997);
  return {
    assetIn,
    assetOut,
    amountIn: amount,
    totalAmountOut: out,
    effectivePrice: 0.997,
    savingsVsBestSingle: 0,
    totalPriceImpact: 0.1,
    routes: [
      {
        venue: 'soroswap',
        amountIn: amount,
        amountOut: out,
        priceImpact: 0.1,
        path: [assetIn.code, assetOut.code],
      },
    ],
  };
}

export async function smartRouterBench(): Promise<Bench> {
  const router = new SmartRouter(
    {
      async getBestQuote(assetIn, assetOut, amountIn) {
        return quote(assetIn, assetOut, amountIn);
      },
    },
    { transitAssets: [xlm, usdc, aqua], maxCandidatePaths: 50 }
  );

  const bench = new Bench({ time: 300, warmupTime: 50 });
  bench.add('smart router 3 pools', async () => {
    await router.findOptimalRoute(xlm, usdc, '100');
  });
  return bench;
}
