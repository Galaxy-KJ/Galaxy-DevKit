/**
 * split-executor + liquidity-depth tests (#275).
 */

import {
  executeSplitTrade,
  LiquidityDepthAnalyzer,
  type AggregatorQuote,
  type AggregatorRoute,
} from '../../src/aggregator';

const XLM = { code: 'XLM', type: 'native' as const };
const USDC = {
  code: 'USDC',
  issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  type: 'credit_alphanum4' as const,
};

function route(venue: AggregatorRoute['venue'], amountIn: string, amountOut: string): AggregatorRoute {
  return { venue, amountIn, amountOut, priceImpact: 0, path: [] };
}

function quote(routes: AggregatorRoute[]): AggregatorQuote {
  return {
    assetIn: XLM,
    assetOut: USDC,
    amountIn: routes.reduce((s, r) => s + Number(r.amountIn), 0).toString(),
    routes,
    totalAmountOut: routes.reduce((s, r) => s + Number(r.amountOut), 0).toString(),
    effectivePrice: 0,
    savingsVsBestSingle: 0,
  };
}

describe('executeSplitTrade (#275)', () => {
  it('submits every route in parallel and aggregates the fill', async () => {
    const q = quote([
      route('soroswap', '600', '610'),
      route('sdex', '400', '405'),
    ]);
    const submit = jest
      .fn()
      .mockResolvedValueOnce({ outputAmount: '610', txId: 't1', feePaid: '1' })
      .mockResolvedValueOnce({ outputAmount: '405', txId: 't2', feePaid: '0.5' });
    const out = await executeSplitTrade(q, submit);

    expect(out.allSucceeded).toBe(true);
    expect(out.splits).toHaveLength(2);
    expect(out.splits[0]).toMatchObject({ source: 'soroswap', txId: 't1', ok: true });
    expect(out.splits[1]).toMatchObject({ source: 'sdex', txId: 't2', ok: true });
    expect(out.totalOutput).toBe('1015.0000000');
    expect(out.totalFees).toBe('1.5000000');
    expect(out.averagePrice).toBeCloseTo(1015 / 1000);
  });

  it('skips routes below minSplitInput to avoid dust trades', async () => {
    const q = quote([
      route('soroswap', '900', '910'),
      // Dust route — should be filtered out before submission.
      route('sdex', '5', '5'),
    ]);
    const submit = jest.fn().mockResolvedValue({ outputAmount: '910' });
    const out = await executeSplitTrade(q, submit, { minSplitInput: '10' });

    expect(submit).toHaveBeenCalledTimes(1);
    expect(out.splits).toHaveLength(1);
    expect(out.splits[0].source).toBe('soroswap');
  });

  it('aborts the split when a submitter rejects (abortOnError default true)', async () => {
    const q = quote([route('soroswap', '500', '510'), route('sdex', '500', '505')]);
    const submit = jest
      .fn()
      .mockResolvedValueOnce({ outputAmount: '510' })
      .mockRejectedValueOnce(new Error('sdex submit timeout'));
    await expect(executeSplitTrade(q, submit)).rejects.toThrow(/sdex submit timeout/);
  });

  it('returns partial fill when abortOnError=false', async () => {
    const q = quote([route('soroswap', '500', '510'), route('sdex', '500', '505')]);
    const submit = jest
      .fn()
      .mockResolvedValueOnce({ outputAmount: '510' })
      .mockRejectedValueOnce(new Error('sdex unavailable'));
    const out = await executeSplitTrade(q, submit, { abortOnError: false });

    expect(out.allSucceeded).toBe(false);
    expect(out.splits[0].ok).toBe(true);
    expect(out.splits[1]).toMatchObject({ ok: false, error: 'sdex unavailable' });
    expect(out.totalOutput).toBe('510.0000000');
  });
});

describe('LiquidityDepthAnalyzer (#275)', () => {
  const analyzer = new LiquidityDepthAnalyzer();

  it('splits proportionally to depth', () => {
    const split = analyzer.optimalSplit(
      {
        entries: [
          { venue: 'soroswap', depthIn: '6000' },
          { venue: 'sdex', depthIn: '4000' },
        ],
      },
      { amountIn: '1000' },
    );
    expect(split.map((s) => s.venue)).toEqual(['soroswap', 'sdex']);
    expect(split[0].percentage).toBeCloseTo(60);
    expect(split[1].percentage).toBeCloseTo(40);
  });

  it('drops venues below minVenueShare and renormalises', () => {
    const split = analyzer.optimalSplit(
      {
        entries: [
          { venue: 'soroswap', depthIn: '9700' },
          { venue: 'sdex', depthIn: '200' },
          { venue: 'aquarius', depthIn: '100' },
        ],
      },
      { amountIn: '1000', minVenueShare: 0.05 },
    );
    expect(split).toHaveLength(1);
    expect(split[0].venue).toBe('soroswap');
    expect(split[0].percentage).toBeCloseTo(100);
  });

  it('falls back to an even split when the snapshot has zero depth', () => {
    const split = analyzer.optimalSplit(
      { entries: [{ venue: 'soroswap', depthIn: '0' }, { venue: 'sdex', depthIn: '0' }] },
      { amountIn: '1000' },
    );
    expect(split[0].percentage).toBeCloseTo(50);
    expect(split[1].percentage).toBeCloseTo(50);
  });
});
