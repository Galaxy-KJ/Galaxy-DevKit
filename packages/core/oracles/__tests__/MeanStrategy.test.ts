/**
 * @fileoverview Tests for MeanStrategy
 */

import { MeanStrategy } from '../../src/aggregator/strategies/MeanStrategy';
import { PriceData } from '../../src/types/oracle-types';

describe('MeanStrategy', () => {
    let strategy: MeanStrategy;

    beforeEach(() => {
        strategy = new MeanStrategy();
    });

    it('returns correct name', () => {
        expect(strategy.getName()).toBe('mean');
    });

    it('returns single price when only one price provided', () => {
        const prices: PriceData[] = [
            { symbol: 'XLM/USD', price: 0.12, timestamp: new Date(), source: 'test' },
        ];
        expect(strategy.aggregate(prices)).toBe(0.12);
    });

    it('calculates arithmetic mean of two prices', () => {
        const prices: PriceData[] = [
            { symbol: 'XLM/USD', price: 0.10, timestamp: new Date(), source: 'a' },
            { symbol: 'XLM/USD', price: 0.20, timestamp: new Date(), source: 'b' },
        ];
        expect(strategy.aggregate(prices)).toBe(0.15);
    });

    it('calculates arithmetic mean of multiple prices', () => {
        const prices: PriceData[] = [
            { symbol: 'XLM/USD', price: 0.10, timestamp: new Date(), source: 'a' },
            { symbol: 'XLM/USD', price: 0.20, timestamp: new Date(), source: 'b' },
            { symbol: 'XLM/USD', price: 0.30, timestamp: new Date(), source: 'c' },
        ];
        expect(strategy.aggregate(prices)).toBe(0.20);
    });

    it('throws error for empty price array', () => {
        expect(() => strategy.aggregate([])).toThrow('Cannot aggregate empty price array');
    });

    it('ignores weights parameter', () => {
        const prices: PriceData[] = [
            { symbol: 'XLM/USD', price: 0.10, timestamp: new Date(), source: 'a' },
            { symbol: 'XLM/USD', price: 0.20, timestamp: new Date(), source: 'b' },
        ];
        const weights = new Map([['a', 10], ['b', 1]]);
        // Mean should not be affected by weights
        expect(strategy.aggregate(prices, weights)).toBe(0.15);
    });

    it('handles very small price differences', () => {
        const prices: PriceData[] = [
            { symbol: 'XLM/USD', price: 0.123456789, timestamp: new Date(), source: 'a' },
            { symbol: 'XLM/USD', price: 0.123456790, timestamp: new Date(), source: 'b' },
        ];
        const result = strategy.aggregate(prices);
        expect(result).toBeCloseTo(0.1234567895, 9);
    });

    it('handles large price values', () => {
        const prices: PriceData[] = [
            { symbol: 'BTC/USD', price: 60000, timestamp: new Date(), source: 'a' },
            { symbol: 'BTC/USD', price: 70000, timestamp: new Date(), source: 'b' },
        ];
        expect(strategy.aggregate(prices)).toBe(65000);
    });
});
