/**
 * @fileoverview Tests for price validation
 * @description Unit tests for price validation utilities
 */

import {
  validatePrice,
  checkStaleness,
  requireMinimumSources,
  checkDeviation,
  filterByDeviation,
  validatePrices,
} from '../../src/validation/price-validator.js';
import { PriceData } from '../../src/types/oracle-types.js';

describe('price-validator', () => {
  const createPrice = (
    price: number,
    source: string,
    ageMs: number = 0
  ): PriceData => ({
    symbol: 'XLM',
    price,
    timestamp: new Date(Date.now() - ageMs),
    source,
  });

  describe('checkStaleness', () => {
    it('should identify stale prices', () => {
      const price = createPrice(100, 'source1', 70000); // 70 seconds old
      expect(checkStaleness(price, 60000)).toBe(true);
    });

    it('should not identify fresh prices as stale', () => {
      const price = createPrice(100, 'source1', 30000); // 30 seconds old
      expect(checkStaleness(price, 60000)).toBe(false);
    });
  });

  describe('validatePrice', () => {
    it('should validate valid price', () => {
      const price = createPrice(100, 'source1');
      expect(validatePrice(price)).toBe(true);
    });

    it('should reject invalid price (negative)', () => {
      const price = createPrice(-100, 'source1');
      expect(validatePrice(price)).toBe(false);
    });

    it('should reject invalid price (zero)', () => {
      const price = createPrice(0, 'source1');
      expect(validatePrice(price)).toBe(false);
    });

    it('should reject invalid price (NaN)', () => {
      const price = createPrice(NaN as any, 'source1');
      expect(validatePrice(price)).toBe(false);
    });

    it('should reject invalid price (Infinity)', () => {
      const price = createPrice(Infinity as any, 'source1');
      expect(validatePrice(price)).toBe(false);
    });

    it('should reject stale price', () => {
      const price = createPrice(100, 'source1', 70000);
      expect(validatePrice(price, { maxStalenessMs: 60000 })).toBe(false);
    });

    it('should reject price with invalid symbol', () => {
      const price = { ...createPrice(100, 'source1'), symbol: '' };
      expect(validatePrice(price)).toBe(false);
    });

    it('should reject price with invalid timestamp', () => {
      const price = {
        ...createPrice(100, 'source1'),
        timestamp: new Date('invalid'),
      };
      expect(validatePrice(price)).toBe(false);
    });
  });

  describe('requireMinimumSources', () => {
    it('should pass when enough sources', () => {
      const prices = [
        createPrice(100, 'source1'),
        createPrice(101, 'source2'),
        createPrice(102, 'source3'),
      ];
      expect(requireMinimumSources(prices, 2)).toBe(true);
    });

    it('should fail when insufficient sources', () => {
      const prices = [createPrice(100, 'source1')];
      expect(requireMinimumSources(prices, 2)).toBe(false);
    });

    it('should check unique sources', () => {
      const prices = [
        createPrice(100, 'source1'),
        createPrice(101, 'source1'), // Same source
      ];
      expect(requireMinimumSources(prices, 2)).toBe(false);
    });
  });

  describe('checkDeviation', () => {
    it('should detect high deviation', () => {
      const prices = [
        createPrice(100, 'source1'),
        createPrice(101, 'source2'),
        createPrice(200, 'source3'), // High deviation
      ];
      expect(checkDeviation(prices, 10)).toBe(true);
    });

    it('should not detect low deviation', () => {
      const prices = [
        createPrice(100, 'source1'),
        createPrice(101, 'source2'),
        createPrice(102, 'source3'),
      ];
      expect(checkDeviation(prices, 10)).toBe(false);
    });
  });

  describe('filterByDeviation', () => {
    it('should filter prices with high deviation', () => {
      const prices = [
        createPrice(100, 'source1'),
        createPrice(101, 'source2'),
        createPrice(200, 'source3'), // High deviation
      ];
      const filtered = filterByDeviation(prices, 10);
      expect(filtered.length).toBeLessThan(prices.length);
      expect(filtered.some((p) => p.source === 'source3')).toBe(false);
    });

    it('should keep prices within deviation', () => {
      const prices = [
        createPrice(100, 'source1'),
        createPrice(101, 'source2'),
        createPrice(102, 'source3'),
      ];
      const filtered = filterByDeviation(prices, 10);
      expect(filtered.length).toBe(prices.length);
    });
  });

  describe('validatePrices', () => {
    it('should separate valid and invalid prices', () => {
      const prices = [
        createPrice(100, 'source1'),
        createPrice(-100, 'source2'), // Invalid
        createPrice(102, 'source3'),
        createPrice(0, 'source4'), // Invalid
      ];
      const result = validatePrices(prices);
      expect(result.valid.length).toBe(2);
      expect(result.invalid.length).toBe(2);
    });

    it('should filter stale prices', () => {
      const prices = [
        createPrice(100, 'source1'),
        createPrice(101, 'source2', 70000), // Stale
        createPrice(102, 'source3'),
      ];
      const result = validatePrices(prices, { maxStalenessMs: 60000 });
      expect(result.valid.length).toBe(2);
      expect(result.invalid.length).toBe(1);
    });
  });
});
