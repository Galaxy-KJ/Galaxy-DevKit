/**
 * @fileoverview Unit tests for Liquidity Pool Calculations
 * @description Tests for AMM formulas, precision handling, and edge cases
 */

import BigNumber from 'bignumber.js';
import { Asset } from '@stellar/stellar-sdk';
import {
  calculateConstantProduct,
  calculateSpotPrice,
  calculateDepositShares,
  calculateWithdrawAmounts,
  calculatePriceImpact,
  calculateSwapOutput,
  estimateDeposit,
  estimateWithdraw,
  calculateMinimumAmounts,
  calculatePriceBounds,
} from '../liquidity-pools/calculations.js';
import { LiquidityPool } from '../liquidity-pools/types.js';

describe('Liquidity Pool Calculations', () => {
  // Valid Stellar testnet public key for issuer
  const VALID_ISSUER = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';

  // Mock pool for testing
  const mockPool: LiquidityPool = {
    id: '0000000000000000000000000000000000000000000000000000000000000000',
    assetA: Asset.native(),
    assetB: new Asset('USDC', VALID_ISSUER),
    reserveA: '10000.0000000',
    reserveB: '50000.0000000',
    totalShares: '22360.6797750',
    totalTrustlines: 100,
    fee: 30,
  };

  describe('calculateConstantProduct', () => {
    it('should calculate constant product correctly', () => {
      const product = calculateConstantProduct('1000', '5000');
      expect(product).toBe('5000000.00000000000000');
    });

    it('should handle large numbers', () => {
      const product = calculateConstantProduct('1000000', '1000000');
      expect(product).toBe('1000000000000.00000000000000');
    });

    it('should handle small numbers', () => {
      const product = calculateConstantProduct('0.0000001', '0.0000001');
      // 0.0000001 * 0.0000001 = 10^-7 * 10^-7 = 10^-14
      expect(new BigNumber(product).toFixed(20)).toBe('0.00000000000001000000');
    });

    it('should handle zero reserve A', () => {
      const product = calculateConstantProduct('0', '1000');
      expect(product).toBe('0.00000000000000');
    });

    it('should handle zero reserve B', () => {
      const product = calculateConstantProduct('1000', '0');
      expect(product).toBe('0.00000000000000');
    });
  });

  describe('calculateSpotPrice', () => {
    it('should calculate spot price correctly', () => {
      const price = calculateSpotPrice('1000', '5000');
      expect(price).toBe('5.0000000');
    });

    it('should calculate inverse price correctly', () => {
      const price = calculateSpotPrice('5000', '1000');
      expect(price).toBe('0.2000000');
    });

    it('should handle equal reserves', () => {
      const price = calculateSpotPrice('1000', '1000');
      expect(price).toBe('1.0000000');
    });

    it('should handle very small reserves', () => {
      const price = calculateSpotPrice('0.0001', '0.0005');
      expect(price).toBe('5.0000000');
    });

    it('should handle large price ratios', () => {
      const price = calculateSpotPrice('1', '1000000');
      expect(price).toBe('1000000.0000000');
    });

    it('should maintain 7 decimal precision', () => {
      const price = calculateSpotPrice('1000', '3333.3333333');
      expect(price.split('.')[1].length).toBe(7);
    });

    it('should throw error for zero reserve A', () => {
      expect(() => calculateSpotPrice('0', '1000')).toThrow(
        'Reserve A cannot be zero'
      );
    });
  });

  describe('calculateDepositShares - First Deposit', () => {
    const emptyPool: LiquidityPool = {
      ...mockPool,
      reserveA: '0',
      reserveB: '0',
      totalShares: '0',
    };

    it('should calculate shares using geometric mean for first deposit', () => {
      const result = calculateDepositShares('1000', '5000', emptyPool);

      // Geometric mean: sqrt(1000 * 5000) = sqrt(5000000) ≈ 2236.0679775
      expect(result.shares).toBe('2236.0679774');
      // First deposit uses exact amounts
      expect(result.actualAmountA).toBe('1000');
      expect(result.actualAmountB).toBe('5000');
    });

    it('should handle small first deposit', () => {
      const result = calculateDepositShares('1', '1', emptyPool);

      // sqrt(1 * 1) = 1
      expect(result.shares).toBe('1.0000000');
      expect(result.actualAmountA).toBe('1');
      expect(result.actualAmountB).toBe('1');
    });

    it('should handle unbalanced first deposit', () => {
      const result = calculateDepositShares('100', '10000', emptyPool);

      // sqrt(100 * 10000) = sqrt(1000000) = 1000
      expect(result.shares).toBe('1000.0000000');
      expect(result.actualAmountA).toBe('100');
      expect(result.actualAmountB).toBe('10000');
    });

    it('should round down shares for first deposit', () => {
      const result = calculateDepositShares('3', '7', emptyPool);

      // sqrt(3 * 7) = sqrt(21) ≈ 4.5825757
      const shares = new BigNumber(result.shares);
      expect(shares.decimalPlaces()).toBeLessThanOrEqual(7);
    });
  });

  describe('calculateDepositShares - Subsequent Deposits', () => {
    it('should calculate proportional shares for balanced deposit', () => {
      // Pool has ratio 1:5 (10000:50000)
      const result = calculateDepositShares('1000', '5000', mockPool);

      // Ratio: min(1000/10000, 5000/50000) = min(0.1, 0.1) = 0.1
      // Shares: 0.1 * 22360.6797750 = 2236.06797750
      expect(result.shares).toBe('2236.0679775');

      // Actual amounts based on ratio
      expect(result.actualAmountA).toBe('1000.0000001');
      expect(result.actualAmountB).toBe('5000.0000001');
    });

    it('should use minimum ratio for unbalanced deposit', () => {
      // User provides too much A relative to B
      const result = calculateDepositShares('2000', '5000', mockPool);

      // Ratio A: 2000/10000 = 0.2
      // Ratio B: 5000/50000 = 0.1
      // Min ratio: 0.1 (limited by B)
      expect(result.shares).toBe('2236.0679775');

      // Should only use 1000 A to match the 0.1 ratio
      expect(result.actualAmountA).toBe('1000.0000001');
      expect(result.actualAmountB).toBe('5000.0000001');
    });

    it('should handle deposit limited by asset A', () => {
      // User provides too much B relative to A
      const result = calculateDepositShares('1000', '10000', mockPool);

      // Ratio A: 1000/10000 = 0.1
      // Ratio B: 10000/50000 = 0.2
      // Min ratio: 0.1 (limited by A)
      expect(result.shares).toBe('2236.0679775');

      expect(result.actualAmountA).toBe('1000.0000001');
      // Should only use 5000 B to match the 0.1 ratio
      expect(result.actualAmountB).toBe('5000.0000001');
    });

    it('should round down shares for subsequent deposits', () => {
      const result = calculateDepositShares('333.3333333', '1666.6666665', mockPool);

      const shares = new BigNumber(result.shares);
      expect(shares.decimalPlaces()).toBeLessThanOrEqual(7);
    });

    it('should round up actual amounts for safety', () => {
      const result = calculateDepositShares('1000', '5000', mockPool);

      // Actual amounts should be rounded up to protect user
      const actualA = new BigNumber(result.actualAmountA);
      const actualB = new BigNumber(result.actualAmountB);

      expect(actualA.isGreaterThanOrEqualTo('1000')).toBe(true);
      expect(actualB.isGreaterThanOrEqualTo('5000')).toBe(true);
    });

    it('should maintain precision for very small deposits', () => {
      const result = calculateDepositShares('0.0001', '0.0005', mockPool);

      // Should still calculate shares correctly
      expect(result.shares).toBeDefined();
      expect(new BigNumber(result.shares).isGreaterThanOrEqualTo(0)).toBe(true);
    });
  });

  describe('calculateWithdrawAmounts', () => {
    it('should calculate withdrawal amounts proportionally', () => {
      // Withdraw 10% of pool (2236.06797750 shares)
      const result = calculateWithdrawAmounts('2236.0679775', mockPool);

      // 10% of reserves
      expect(result.amountA).toBe('1000.0000000');
      expect(result.amountB).toBe('5000.0000000');
    });

    it('should handle full withdrawal', () => {
      const result = calculateWithdrawAmounts(mockPool.totalShares, mockPool);

      // Should get all reserves
      expect(result.amountA).toBe(mockPool.reserveA);
      expect(result.amountB).toBe(mockPool.reserveB);
    });

    it('should handle small withdrawal', () => {
      // Withdraw 1 share
      const result = calculateWithdrawAmounts('1', mockPool);

      // Share of reserves
      const expectedA = new BigNumber('1')
        .dividedBy(mockPool.totalShares)
        .multipliedBy(mockPool.reserveA)
        .toFixed(7, BigNumber.ROUND_DOWN);

      expect(result.amountA).toBe(expectedA);
    });

    it('should round down withdrawal amounts', () => {
      const result = calculateWithdrawAmounts('100.1234567', mockPool);

      const amountA = new BigNumber(result.amountA);
      const amountB = new BigNumber(result.amountB);

      expect(amountA.decimalPlaces()).toBeLessThanOrEqual(7);
      expect(amountB.decimalPlaces()).toBeLessThanOrEqual(7);
    });

    it('should handle withdrawal of all shares', () => {
      const result = calculateWithdrawAmounts('22360.6797750', mockPool);

      // Should get exactly the pool reserves
      expect(result.amountA).toBe('10000.0000000');
      expect(result.amountB).toBe('50000.0000000');
    });

    it('should maintain precision for very small share amounts', () => {
      const result = calculateWithdrawAmounts('0.0000001', mockPool);

      expect(result.amountA).toBeDefined();
      expect(result.amountB).toBeDefined();
    });
  });

  describe('calculatePriceImpact', () => {
    it('should calculate price impact for swap', () => {
      const result = calculatePriceImpact('1000', '4545.4545455', '10000', '50000');

      // Spot price: 50000/10000 = 5
      // Effective price: 4545.4545455/1000 = 4.5454545455
      // Impact: (5 - 4.5454545455) / 5 = 0.0909090909 = 9.09%
      expect(parseFloat(result.priceImpact)).toBeCloseTo(9.09, 1);
      expect(result.isHighImpact).toBe(true); // >5%
    });

    it('should identify high impact trades', () => {
      const result = calculatePriceImpact('5000', '16666.6666667', '10000', '50000');

      // Large trade should have high impact
      expect(result.isHighImpact).toBe(true);
      expect(parseFloat(result.priceImpact)).toBeGreaterThan(5);
    });

    it('should identify low impact trades', () => {
      const result = calculatePriceImpact('10', '49.9500000', '10000', '50000');

      // Small trade should have low impact
      expect(result.isHighImpact).toBe(false);
      expect(parseFloat(result.priceImpact)).toBeLessThan(5);
    });

    it('should calculate effective price', () => {
      const result = calculatePriceImpact('1000', '4545.4545455', '10000', '50000');

      expect(result.effectivePrice).toBe('4.5454545');
    });

    it('should return correct input and output amounts', () => {
      const result = calculatePriceImpact('1000', '4545.4545455', '10000', '50000');

      expect(result.inputAmount).toBe('1000');
      expect(result.outputAmount).toBe('4545.4545455');
      expect(result.minimumReceived).toBe('4545.4545455');
    });

    it('should handle zero impact trades', () => {
      // Infinitesimally small trade
      const result = calculatePriceImpact('0.0001', '0.0005', '10000', '50000');

      expect(parseFloat(result.priceImpact)).toBeCloseTo(0, 2);
      expect(result.isHighImpact).toBe(false);
    });
  });

  describe('calculateSwapOutput', () => {
    it('should calculate swap output with fee', () => {
      const result = calculateSwapOutput('1000', mockPool.reserveA, mockPool.reserveB, mockPool.fee);

      // x * y = k
      // Fee: 30 basis points = 0.3%
      // Input after fee: 1000 * (1 - 0.003) = 997
      // New reserve A: 10000 + 997 = 10997
      // k = 10000 * 50000 = 500000000
      // New reserve B: k / new reserve A = 500000000 / 10997 ≈ 45467.13129653
      // Output: 50000 - 45467.13129653 ≈ 4532.86870347
      expect(new BigNumber(result).toFixed(7)).toBe('4533.0544694');
    });

    it('should calculate swap with zero fee', () => {
      const result = calculateSwapOutput('1000', '10000', '50000', 0);

      // No fee, so input is fully used
      // New reserve A: 11000
      // New reserve B: 500000000 / 11000 ≈ 45454.5454545
      // Output: 50000 - 45454.5454545 ≈ 4545.4545455
      expect(new BigNumber(result).toFixed(7)).toBe('4545.4545454');
    });

    it('should handle small swaps', () => {
      const result = calculateSwapOutput('1', mockPool.reserveA, mockPool.reserveB, mockPool.fee);

      // Small input should give proportional output
      expect(new BigNumber(result).isGreaterThan(0)).toBe(true);
      expect(new BigNumber(result).isLessThan(mockPool.reserveB)).toBe(true);
    });

    it('should handle large swaps', () => {
      const result = calculateSwapOutput('5000', mockPool.reserveA, mockPool.reserveB, mockPool.fee);

      // Large input should have diminishing returns
      const smallSwap = calculateSwapOutput('1000', mockPool.reserveA, mockPool.reserveB, mockPool.fee);

      // 5x input should give less than 5x output due to slippage
      expect(new BigNumber(result).isLessThan(new BigNumber(smallSwap).multipliedBy(5))).toBe(true);
    });

    it('should apply fee correctly', () => {
      const resultWithFee = calculateSwapOutput('1000', '10000', '50000', 30);
      const resultNoFee = calculateSwapOutput('1000', '10000', '50000', 0);

      // Swap with fee should give less output
      expect(new BigNumber(resultWithFee).isLessThan(resultNoFee)).toBe(true);
    });

    it('should throw error for zero reserves', () => {
      expect(() => calculateSwapOutput('1000', '0', '50000', 30)).toThrow(
        'Reserves must be greater than zero'
      );
    });
  });

  describe('estimateDeposit', () => {
    it('should estimate deposit correctly', () => {
      const result = estimateDeposit('1000', '5000', mockPool);

      expect(result.shares).toBe('2236.0679775');
      expect(result.actualAmountA).toBe('1000.0000001');
      expect(result.actualAmountB).toBe('5000.0000001');
      expect(result.sharePrice).toBeDefined();
      expect(result.priceImpact).toBeDefined();
      expect(result.poolShare).toBeDefined();
    });

    it('should calculate pool share percentage', () => {
      const result = estimateDeposit('1000', '5000', mockPool);

      // New total shares: 22360.6797750 + 2236.0679774 = 24596.7477524
      // Share: 2236.0679774 / 24596.7477524 ≈ 9.09%
      expect(parseFloat(result.poolShare)).toBeCloseTo(9.09, 1);
    });

    it('should calculate share price', () => {
      const result = estimateDeposit('1000', '5000', mockPool);

      // Share price should be defined and positive
      expect(parseFloat(result.sharePrice)).toBeGreaterThan(0);
    });

    it('should calculate price impact', () => {
      const result = estimateDeposit('1000', '5000', mockPool);

      // Price impact should be minimal for balanced deposit
      expect(parseFloat(result.priceImpact)).toBeCloseTo(0, 1);
    });

    it('should handle first deposit estimation', () => {
      const emptyPool: LiquidityPool = {
        ...mockPool,
        reserveA: '0',
        reserveB: '0',
        totalShares: '0',
      };

      const result = estimateDeposit('1000', '5000', emptyPool);

      expect(result.poolShare).toBe('100.0000'); // 100% of empty pool
      expect(result.shares).toBe('2236.0679774');
    });
  });

  describe('estimateWithdraw', () => {
    it('should estimate withdrawal correctly', () => {
      const result = estimateWithdraw('2236.0679775', mockPool);

      expect(result.amountA).toBe('1000.0000000');
      expect(result.amountB).toBe('5000.0000000');
      expect(result.sharePrice).toBeDefined();
      expect(result.priceImpact).toBeDefined();
    });

    it('should calculate share price', () => {
      const result = estimateWithdraw('2236.0679775', mockPool);

      // Share price = reserveA / totalShares
      expect(parseFloat(result.sharePrice)).toBeCloseTo(0.447, 2);
    });

    it('should calculate price impact', () => {
      const result = estimateWithdraw('2236.0679775', mockPool);

      // Price impact should be minimal for 10% withdrawal
      expect(parseFloat(result.priceImpact)).toBeLessThan(5);
    });

    it('should handle full pool withdrawal', () => {
      const result = estimateWithdraw(mockPool.totalShares, mockPool);

      expect(result.amountA).toBe(mockPool.reserveA);
      expect(result.amountB).toBe(mockPool.reserveB);
    });

    it('should handle small withdrawals', () => {
      const result = estimateWithdraw('100', mockPool);

      expect(parseFloat(result.amountA)).toBeGreaterThan(0);
      expect(parseFloat(result.amountB)).toBeGreaterThan(0);
    });
  });

  describe('calculateMinimumAmounts', () => {
    it('should apply slippage tolerance correctly', () => {
      const result = calculateMinimumAmounts('1000', '5000', '0.01');

      // 1% slippage: amounts * 0.99
      expect(result.minAmountA).toBe('990.0000000');
      expect(result.minAmountB).toBe('4950.0000000');
    });

    it('should handle zero slippage', () => {
      const result = calculateMinimumAmounts('1000', '5000', '0');

      expect(result.minAmountA).toBe('1000.0000000');
      expect(result.minAmountB).toBe('5000.0000000');
    });

    it('should handle high slippage', () => {
      const result = calculateMinimumAmounts('1000', '5000', '0.1');

      // 10% slippage: amounts * 0.9
      expect(result.minAmountA).toBe('900.0000000');
      expect(result.minAmountB).toBe('4500.0000000');
    });

    it('should maintain 7 decimal precision', () => {
      const result = calculateMinimumAmounts('1234.5678901', '9876.5432109', '0.015');

      expect(result.minAmountA.split('.')[1].length).toBe(7);
      expect(result.minAmountB.split('.')[1].length).toBe(7);
    });

    it('should handle very small amounts', () => {
      const result = calculateMinimumAmounts('0.0000001', '0.0000005', '0.01');

      expect(result.minAmountA).toBe('0.0000000');
      expect(result.minAmountB).toBe('0.0000004');
    });
  });

  describe('calculatePriceBounds', () => {
    it('should calculate price bounds with slippage', () => {
      const result = calculatePriceBounds('5', '0.01');

      // Spot price: 5
      // 1% slippage
      // Min price: 5 * 0.99 = 4.95
      // Max price: 5 * 1.01 = 5.05
      expect(result.minPrice).toBe('4.9500000');
      expect(result.maxPrice).toBe('5.0500000');
      expect(result.spotPrice).toBe('5');
    });

    it('should handle zero slippage', () => {
      const result = calculatePriceBounds('5', '0');

      expect(result.minPrice).toBe('5.0000000');
      expect(result.maxPrice).toBe('5.0000000');
    });

    it('should handle high slippage', () => {
      const result = calculatePriceBounds('100', '0.1');

      // 10% slippage
      expect(result.minPrice).toBe('90.0000000');
      expect(result.maxPrice).toBe('110.0000000');
    });

    it('should calculate tolerance percentage', () => {
      const result = calculatePriceBounds('5', '0.01');

      expect(result.tolerancePercent).toBe('1.00');
    });

    it('should maintain 7 decimal precision', () => {
      const result = calculatePriceBounds('3.3333333', '0.015');

      expect(result.minPrice.split('.')[1].length).toBe(7);
      expect(result.maxPrice.split('.')[1].length).toBe(7);
    });

    it('should handle very large prices', () => {
      const result = calculatePriceBounds('1000000', '0.05');

      expect(result.minPrice).toBe('950000.0000000');
      expect(result.maxPrice).toBe('1050000.0000000');
    });

    it('should handle very small prices', () => {
      const result = calculatePriceBounds('0.0001', '0.05');

      expect(new BigNumber(result.minPrice).isGreaterThan(0)).toBe(true);
      expect(new BigNumber(result.maxPrice).isGreaterThan(result.minPrice)).toBe(true);
    });
  });

  describe('Precision and Rounding', () => {
    it('should maintain 7 decimal places across all calculations', () => {
      const depositResult = calculateDepositShares('1000.1234567', '5000.9876543', mockPool);
      const withdrawResult = calculateWithdrawAmounts('100.3456789', mockPool);
      const minAmounts = calculateMinimumAmounts('1000.1111111', '5000.2222222', '0.01');

      expect(depositResult.shares.split('.')[1]?.length || 0).toBeLessThanOrEqual(7);
      expect(withdrawResult.amountA.split('.')[1]?.length || 0).toBeLessThanOrEqual(7);
      expect(minAmounts.minAmountA.split('.')[1]?.length || 0).toBeLessThanOrEqual(7);
    });

    it('should round conservatively for user protection', () => {
      // Deposits should round up amounts (user pays slightly more)
      const depositResult = calculateDepositShares('1000', '5000', mockPool);

      const actualA = new BigNumber(depositResult.actualAmountA);
      const actualB = new BigNumber(depositResult.actualAmountB);

      // Actual amounts should be >= requested amounts (rounded up)
      expect(actualA.isGreaterThanOrEqualTo('1000')).toBe(true);
      expect(actualB.isGreaterThanOrEqualTo('5000')).toBe(true);

      // Shares should be rounded down (user gets slightly less)
      const shares = new BigNumber(depositResult.shares);
      expect(shares.decimalPlaces()).toBeLessThanOrEqual(7);
    });

    it('should handle edge case numbers without loss of precision', () => {
      // Test with numbers that might cause floating point issues
      const testCases = [
        { a: '0.1', b: '0.2' },
        { a: '999999999.9999999', b: '1.0000001' },
        { a: '0.0000001', b: '0.0000001' },
      ];

      testCases.forEach(({ a, b }) => {
        const product = calculateConstantProduct(a, b);
        expect(product).toBeDefined();
        expect(new BigNumber(product).isFinite()).toBe(true);
      });
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle maximum Stellar amounts', () => {
      const maxAmount = '922337203685.4775807';
      const result = calculateSpotPrice(maxAmount, '1');

      expect(result).toBe('0.0000000');
    });

    it('should handle minimum Stellar amounts', () => {
      const minAmount = '0.0000001';
      const result = calculateSpotPrice('1', minAmount);

      expect(new BigNumber(result).isFinite()).toBe(true);
    });

    it('should throw error for invalid operations', () => {
      expect(() => calculateSpotPrice('0', '1000')).toThrow();
      expect(() => calculateSwapOutput('1000', '0', '50000', 30)).toThrow();
    });

    it('should handle deposits that would create dust', () => {
      const result = calculateDepositShares('0.0000001', '0.0000005', mockPool);

      // Should still calculate, even if amounts are tiny
      expect(result.shares).toBeDefined();
      expect(new BigNumber(result.shares).isGreaterThanOrEqualTo(0)).toBe(true);
    });
  });
});
