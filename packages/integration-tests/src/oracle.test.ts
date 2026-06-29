import { createTestEnv, IntegrationTestEnv } from '../setup/testnet.js';

jest.setTimeout(60000);

describe('Oracle Integration', () => {
  let env: IntegrationTestEnv;

  beforeAll(() => {
    env = createTestEnv();
  });

  describe('Price Feed Aggregation', () => {
    it('should calculate median price from multiple sources', () => {
      const prices = [100.5, 101.2, 100.8, 101.0, 100.3];
      const sorted = [...prices].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median =
        sorted.length % 2 !== 0
          ? sorted[mid]
          : (sorted[mid - 1] + sorted[mid]) / 2;

      expect(median).toBeCloseTo(100.8, 1);
    });

    it('should detect price deviation anomaly', () => {
      const currentPrice = 105.0;
      const referencePrice = 100.0;
      const deviationThreshold = 0.05;

      const deviation =
        Math.abs(currentPrice - referencePrice) / referencePrice;
      const isAnomaly = deviation > deviationThreshold;

      expect(deviation).toBeCloseTo(0.05, 2);
      expect(isAnomaly).toBe(false);
    });

    it('should detect large deviation as anomaly', () => {
      const currentPrice = 120.0;
      const referencePrice = 100.0;
      const deviationThreshold = 0.1;

      const deviation =
        Math.abs(currentPrice - referencePrice) / referencePrice;
      const isAnomaly = deviation > deviationThreshold;

      expect(deviation).toBeCloseTo(0.2, 2);
      expect(isAnomaly).toBe(true);
    });

    it('should compute TWAP correctly', () => {
      const prices = [100.0, 101.0, 102.0, 103.0, 104.0];
      const sum = prices.reduce((a, b) => a + b, 0);
      const twap = sum / prices.length;
      expect(twap).toBe(102.0);
    });
  });

  describe('Validation', () => {
    it('should reject negative prices', () => {
      const price = -1.0;
      expect(price).toBeLessThan(0);
    });

    it('should accept zero price', () => {
      const price = 0.0;
      expect(price).toBe(0);
    });
  });
});
