import { parsePair } from '../../src/aggregator/soroban-pusher.js';

describe('parsePair', () => {
  it('normalizes explicit base/quote pairs', () => {
    expect(parsePair('xlm/usdc')).toEqual({ base: 'XLM', quote: 'USDC' });
  });

  it('defaults single-asset symbols to USD quote', () => {
    expect(parsePair('btc')).toEqual({ base: 'BTC', quote: 'USD' });
  });

  it('rejects malformed pairs', () => {
    expect(() => parsePair('/USD')).toThrow('Invalid oracle symbol pair');
  });
});
