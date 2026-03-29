/**
 * @fileoverview Unit tests for Liquidity Pool Helper Functions
 * @description Tests for utility functions and common liquidity pool patterns
 */

import BigNumber from 'bignumber.js';
import { Asset } from '@stellar/stellar-sdk';
import {
  calculateOptimalDeposit,
  formatPoolAssets,
  calculateShareValue,
  wouldImpactPrice,
  calculateBreakEvenPrice,
  calculateImpermanentLoss,
  hasSufficientLiquidity,
  calculateAPRFromFees,
  toStellarPrecision,
  assetsEqual,
  sortAssets,
} from '../liquidity-pools/helpers.js';
import { LiquidityPool } from '../liquidity-pools/types.js';

describe('Liquidity Pool Helpers', () => {
  // Valid Stellar testnet public keys for issuers
  const VALID_ISSUER_1 = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';
  const VALID_ISSUER_2 = 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGSNFHEYVXM3XOJMDS674JZ';
  const VALID_ISSUER_3 = 'GB6NVEN5HSUBKMYCE5ZOWSK5K23TBWRUQLZY3KNMXUZ3AQ2ESC4MY4AQ';

  // Mock assets
  const xlm = Asset.native();
  const usdc = new Asset('USDC', VALID_ISSUER_1);
  const usdt = new Asset('USDT', VALID_ISSUER_2);
  const btc = new Asset('BTC', VALID_ISSUER_3);

  // Mock pool
  const mockPool: LiquidityPool = {
    id: '0000000000000000000000000000000000000000000000000000000000000000',
    assetA: xlm,
    assetB: usdc,
    reserveA: '10000.0000000',
    reserveB: '50000.0000000',
    totalShares: '22360.6797750',
    totalTrustlines: 100,
    fee: 30,
  };

  describe('calculateOptimalDeposit', () => {
    it('should calculate optimal deposit when A is limiting', () => {
      // Pool ratio is 1:5 (XLM:USDC)
      // User wants to deposit max 1000 XLM and 10000 USDC
      // Optimal: use all 1000 XLM and 5000 USDC (1:5 ratio)
      const result = calculateOptimalDeposit('1000', '10000', mockPool);

      expect(result.amountA).toBe('1000.0000000');
      expect(result.amountB).toBe('5000.0000000');
    });

    it('should calculate optimal deposit when B is limiting', () => {
      // User wants to deposit max 5000 XLM and 5000 USDC
      // Optimal: use 1000 XLM and all 5000 USDC (1:5 ratio)
      const result = calculateOptimalDeposit('5000', '5000', mockPool);

      expect(result.amountA).toBe('1000.0000000');
      expect(result.amountB).toBe('5000.0000000');
    });

    it('should calculate correct ratio for balanced deposit', () => {
      const result = calculateOptimalDeposit('1000', '5000', mockPool);

      const ratioA = new BigNumber(result.amountA).dividedBy(mockPool.reserveA);
      const ratioB = new BigNumber(result.amountB).dividedBy(mockPool.reserveB);

      // Ratios should be equal
      expect(ratioA.toFixed(7)).toBe(ratioB.toFixed(7));
    });

    it('should apply slippage protection to minimum amounts', () => {
      const slippage = '0.01'; // 1%
      const result = calculateOptimalDeposit('1000', '5000', mockPool, slippage);

      // Min amounts should be 99% of optimal amounts
      expect(result.minAmountA).toBe('990.0000000');
      expect(result.minAmountB).toBe('4950.0000000');
    });

    it('should handle custom slippage tolerance', () => {
      const slippage = '0.05'; // 5%
      const result = calculateOptimalDeposit('1000', '5000', mockPool, slippage);

      // Min amounts should be 95% of optimal amounts
      expect(result.minAmountA).toBe('950.0000000');
      expect(result.minAmountB).toBe('4750.0000000');
    });

    it('should handle zero slippage', () => {
      const result = calculateOptimalDeposit('1000', '5000', mockPool, '0');

      expect(result.minAmountA).toBe(result.amountA);
      expect(result.minAmountB).toBe(result.amountB);
    });

    it('should handle very small deposits', () => {
      const result = calculateOptimalDeposit('0.0001', '0.0005', mockPool);

      expect(result.amountA).toBe('0.0001000');
      expect(result.amountB).toBe('0.0005000');
    });

    it('should maintain 7 decimal precision', () => {
      const result = calculateOptimalDeposit('1234.5678901', '9876.5432109', mockPool);

      expect(result.amountA.split('.')[1].length).toBe(7);
      expect(result.amountB.split('.')[1].length).toBe(7);
    });
  });

  describe('formatPoolAssets', () => {
    it('should format native asset correctly', () => {
      const formatted = formatPoolAssets(mockPool);
      expect(formatted).toBe('XLM/USDC');
    });

    it('should format two custom assets', () => {
      const pool: LiquidityPool = {
        ...mockPool,
        assetA: usdc,
        assetB: usdt,
      };

      const formatted = formatPoolAssets(pool);
      expect(formatted).toBe('USDC/USDT');
    });

    it('should format BTC/XLM pool', () => {
      const pool: LiquidityPool = {
        ...mockPool,
        assetA: btc,
        assetB: xlm,
      };

      const formatted = formatPoolAssets(pool);
      expect(formatted).toBe('BTC/XLM');
    });

    it('should handle same asset code with different issuers', () => {
      const usdc2 = new Asset('USDC', VALID_ISSUER_2);
      const pool: LiquidityPool = {
        ...mockPool,
        assetA: usdc,
        assetB: usdc2,
      };

      const formatted = formatPoolAssets(pool);
      expect(formatted).toBe('USDC/USDC');
    });
  });

  describe('calculateShareValue', () => {
    it('should calculate share value correctly', () => {
      // User has 2236.06797750 shares (10% of pool)
      const result = calculateShareValue('2236.0679775', mockPool);

      expect(result.valueA).toBe('1000.0000000');
      expect(result.valueB).toBe('5000.0000000');
    });

    it('should calculate value for full pool shares', () => {
      const result = calculateShareValue(mockPool.totalShares, mockPool);

      expect(result.valueA).toBe(mockPool.reserveA);
      expect(result.valueB).toBe(mockPool.reserveB);
    });

    it('should calculate value for small share amounts', () => {
      const result = calculateShareValue('1', mockPool);

      const expectedA = new BigNumber('1')
        .dividedBy(mockPool.totalShares)
        .multipliedBy(mockPool.reserveA)
        .toFixed(7);

      expect(result.valueA).toBe(expectedA);
    });

    it('should return zero for zero shares', () => {
      const result = calculateShareValue('0', mockPool);

      expect(result.valueA).toBe('0.0000000');
      expect(result.valueB).toBe('0.0000000');
    });

    it('should return zero for empty pool', () => {
      const emptyPool: LiquidityPool = {
        ...mockPool,
        reserveA: '0',
        reserveB: '0',
        totalShares: '0',
      };

      const result = calculateShareValue('1000', emptyPool);

      expect(result.valueA).toBe('0');
      expect(result.valueB).toBe('0');
    });

    it('should maintain 7 decimal precision', () => {
      const result = calculateShareValue('123.4567890', mockPool);

      expect(result.valueA.split('.')[1].length).toBe(7);
      expect(result.valueB.split('.')[1].length).toBe(7);
    });
  });

  describe('wouldImpactPrice', () => {
    it('should detect high price impact', () => {
      // Large unbalanced deposit
      const impact = wouldImpactPrice('5000', '10000', mockPool, '0.01');

      // This would change the ratio significantly
      expect(impact).toBe(true);
    });

    it('should not detect impact for balanced deposit', () => {
      // Balanced deposit maintaining 1:5 ratio
      const impact = wouldImpactPrice('1000', '5000', mockPool, '0.01');

      expect(impact).toBe(false);
    });

    it('should detect impact based on custom threshold', () => {
      // Small imbalance with strict threshold
      const impact = wouldImpactPrice('1000', '4900', mockPool, '0.001');

      expect(impact).toBe(true);
    });

    it('should handle very small deposits', () => {
      const impact = wouldImpactPrice('0.1', '0.5', mockPool, '0.01');

      expect(impact).toBe(false);
    });

    it('should detect impact when ratio changes significantly', () => {
      // Deposit that would change ratio from 1:5 to something different
      const impact = wouldImpactPrice('1000', '6000', mockPool, '0.01');

      expect(impact).toBe(true);
    });

    it('should use default threshold if not provided', () => {
      const impact = wouldImpactPrice('1000', '5100', mockPool);

      // Default threshold is 1%
      expect(typeof impact).toBe('boolean');
    });
  });

  describe('calculateBreakEvenPrice', () => {
    it('should calculate initial average price', () => {
      const price = calculateBreakEvenPrice('1000', '5000', '10000', '50000');

      // Initial price: 5000 / 1000 = 5
      expect(price).toBe('5.0000000');
    });

    it('should handle different ratios', () => {
      const price = calculateBreakEvenPrice('100', '1000', '10000', '50000');

      // Initial price: 1000 / 100 = 10
      expect(price).toBe('10.0000000');
    });

    it('should calculate price for small amounts', () => {
      const price = calculateBreakEvenPrice('1', '10', '10000', '50000');

      expect(price).toBe('10.0000000');
    });

    it('should maintain 7 decimal precision', () => {
      const price = calculateBreakEvenPrice('333.3333333', '1666.6666665', '10000', '50000');

      expect(price.split('.')[1].length).toBe(7);
    });

    it('should calculate price regardless of current reserves', () => {
      // Break-even price depends only on initial amounts
      const price1 = calculateBreakEvenPrice('1000', '5000', '10000', '50000');
      const price2 = calculateBreakEvenPrice('1000', '5000', '20000', '100000');

      expect(price1).toBe(price2);
    });
  });

  describe('calculateImpermanentLoss', () => {
    it('should calculate zero loss for no price change', () => {
      const il = calculateImpermanentLoss('5', '5');

      expect(il).toBe('0.00');
    });

    it('should calculate loss for 2x price increase', () => {
      // When price doubles, IL is approximately 5.72%
      const il = calculateImpermanentLoss('5', '10');

      expect(parseFloat(il)).toBeCloseTo(5.72, 1);
    });

    it('should calculate loss for 0.5x price decrease', () => {
      // When price halves, IL is also approximately 5.72%
      const il = calculateImpermanentLoss('10', '5');

      expect(parseFloat(il)).toBeCloseTo(5.72, 1);
    });

    it('should calculate loss for 4x price increase', () => {
      // Larger price changes result in higher IL
      const il = calculateImpermanentLoss('5', '20');

      expect(parseFloat(il)).toBeGreaterThan(10);
    });

    it('should show symmetric loss for price increases and decreases', () => {
      const ilUp = calculateImpermanentLoss('5', '10');
      const ilDown = calculateImpermanentLoss('10', '5');

      // IL should be the same for 2x increase and 0.5x decrease
      expect(ilUp).toBe(ilDown);
    });

    it('should return percentage with 2 decimal places', () => {
      const il = calculateImpermanentLoss('5', '7.5');

      expect(il.split('.')[1].length).toBe(2);
    });

    it('should handle very small price changes', () => {
      const il = calculateImpermanentLoss('5.00', '5.01');

      expect(parseFloat(il)).toBeLessThan(0.1);
    });

    it('should handle extreme price ratios', () => {
      const il = calculateImpermanentLoss('1', '100');

      expect(parseFloat(il)).toBeGreaterThan(0);
      expect(parseFloat(il)).toBeLessThan(100);
    });
  });

  describe('hasSufficientLiquidity', () => {
    it('should return true for sufficient liquidity', () => {
      // Pool has 10000 A and 50000 B
      // Requesting 1000 A and 5000 B is well within limits
      const result = hasSufficientLiquidity('1000', '5000', mockPool);

      expect(result).toBe(true);
    });

    it('should return false for insufficient asset A', () => {
      // Requesting more than available (with safety margin)
      const result = hasSufficientLiquidity('9901', '5000', mockPool);

      expect(result).toBe(false);
    });

    it('should return false for insufficient asset B', () => {
      const result = hasSufficientLiquidity('1000', '49600', mockPool);

      expect(result).toBe(false);
    });

    it('should apply safety margin correctly', () => {
      // With 1% safety margin, available is 99% of reserves
      // Pool has 10000 A, so available is 9900 A
      const result = hasSufficientLiquidity('9900', '5000', mockPool, '0.01');

      expect(result).toBe(true); // Exactly at the limit
    });

    it('should handle custom safety margins', () => {
      // 10% safety margin means 90% is available
      const result = hasSufficientLiquidity('9000', '45000', mockPool, '0.1');

      expect(result).toBe(true);
    });

    it('should handle zero safety margin', () => {
      // With no safety margin, full reserves are available
      const result = hasSufficientLiquidity('10000', '50000', mockPool, '0');

      expect(result).toBe(true);
    });

    it('should return false when either asset is insufficient', () => {
      const result = hasSufficientLiquidity('5000', '60000', mockPool);

      expect(result).toBe(false);
    });

    it('should handle very small amounts', () => {
      const result = hasSufficientLiquidity('0.0001', '0.0005', mockPool);

      expect(result).toBe(true);
    });
  });

  describe('calculateAPRFromFees', () => {
    it('should calculate APR correctly', () => {
      // Daily fees: 100, Total liquidity: 100000
      // Daily rate: 100/100000 = 0.001
      // APR: 0.001 * 365 * 100 = 36.5%
      const apr = calculateAPRFromFees('100', '100000');

      expect(apr).toBe('36.50');
    });

    it('should handle zero fees', () => {
      const apr = calculateAPRFromFees('0', '100000');

      expect(apr).toBe('0.00');
    });

    it('should return zero for zero liquidity', () => {
      const apr = calculateAPRFromFees('100', '0');

      expect(apr).toBe('0.00');
    });

    it('should calculate high APR for high fees', () => {
      const apr = calculateAPRFromFees('1000', '10000');

      // 1000/10000 * 365 * 100 = 3650%
      expect(apr).toBe('3650.00');
    });

    it('should calculate low APR for low fees', () => {
      const apr = calculateAPRFromFees('1', '1000000');

      // Very low APR
      expect(parseFloat(apr)).toBeLessThan(1);
    });

    it('should return percentage with 2 decimal places', () => {
      const apr = calculateAPRFromFees('123.456', '100000');

      expect(apr.split('.')[1].length).toBe(2);
    });

    it('should handle very small daily fees', () => {
      const apr = calculateAPRFromFees('0.01', '100000');

      expect(parseFloat(apr)).toBeGreaterThanOrEqual(0);
    });

    it('should annualize correctly', () => {
      // If daily return is 1%, annual should be 365%
      const apr = calculateAPRFromFees('1000', '100000');

      expect(apr).toBe('365.00');
    });
  });

  describe('toStellarPrecision', () => {
    it('should format to 7 decimal places', () => {
      const result = toStellarPrecision('123.456789123');

      expect(result).toBe('123.4567891');
    });

    it('should round down', () => {
      const result = toStellarPrecision('123.45678999');

      expect(result).toBe('123.4567899');
    });

    it('should handle integers', () => {
      const result = toStellarPrecision(1000);

      expect(result).toBe('1000.0000000');
    });

    it('should handle string numbers', () => {
      const result = toStellarPrecision('1000');

      expect(result).toBe('1000.0000000');
    });

    it('should handle very small numbers', () => {
      const result = toStellarPrecision('0.00000001');

      expect(result).toBe('0.0000000');
    });

    it('should handle very large numbers', () => {
      const result = toStellarPrecision('922337203685.4775807');

      expect(result).toBe('922337203685.4775807');
    });

    it('should pad zeros if needed', () => {
      const result = toStellarPrecision('100.1');

      expect(result).toBe('100.1000000');
    });

    it('should always return 7 decimal places', () => {
      const testCases = ['0.1', '100', '0.0000001', '999999.9999999'];

      testCases.forEach((value) => {
        const result = toStellarPrecision(value);
        expect(result.split('.')[1].length).toBe(7);
      });
    });
  });

  describe('assetsEqual', () => {
    it('should match two native assets', () => {
      const xlm1 = Asset.native();
      const xlm2 = Asset.native();

      expect(assetsEqual(xlm1, xlm2)).toBe(true);
    });

    it('should match two identical custom assets', () => {
      const usdc1 = new Asset('USDC', VALID_ISSUER_1);
      const usdc2 = new Asset('USDC', VALID_ISSUER_1);

      expect(assetsEqual(usdc1, usdc2)).toBe(true);
    });

    it('should not match native and custom asset', () => {
      expect(assetsEqual(xlm, usdc)).toBe(false);
    });

    it('should not match assets with same code but different issuers', () => {
      const usdc1 = new Asset('USDC', VALID_ISSUER_1);
      const usdc2 = new Asset('USDC', VALID_ISSUER_2);

      expect(assetsEqual(usdc1, usdc2)).toBe(false);
    });

    it('should not match assets with different codes', () => {
      expect(assetsEqual(usdc, usdt)).toBe(false);
    });

    it('should not match assets with different codes but same issuer', () => {
      const asset1 = new Asset('USDC', VALID_ISSUER_1);
      const asset2 = new Asset('USDT', VALID_ISSUER_1);

      expect(assetsEqual(asset1, asset2)).toBe(false);
    });
  });

  describe('sortAssets', () => {
    it('should sort assets alphabetically by code', () => {
      const [first, second] = sortAssets(usdc, btc);

      expect(first.getCode()).toBe('BTC');
      expect(second.getCode()).toBe('USDC');
    });

    it('should keep order if already sorted', () => {
      const [first, second] = sortAssets(btc, usdc);

      expect(first.getCode()).toBe('BTC');
      expect(second.getCode()).toBe('USDC');
    });

    it('should sort native asset correctly', () => {
      const [first, second] = sortAssets(usdc, xlm);

      // USDC comes before XLM alphabetically
      expect(first.getCode()).toBe('USDC');
      expect(second.isNative()).toBe(true);
    });

    it('should sort by issuer when codes are the same', () => {
      const usdc1 = new Asset('USDC', VALID_ISSUER_1);
      const usdc2 = new Asset('USDC', VALID_ISSUER_2);

      const [first, second] = sortAssets(usdc2, usdc1);

      expect(first.getIssuer()).toBe(VALID_ISSUER_1);
      expect(second.getIssuer()).toBe(VALID_ISSUER_2);
    });

    it('should handle BTC/XLM pair', () => {
      const [first, second] = sortAssets(xlm, btc);

      expect(first.getCode()).toBe('BTC');
      expect(second.isNative()).toBe(true);
    });

    it('should handle USDC/USDT pair', () => {
      const [first, second] = sortAssets(usdt, usdc);

      expect(first.getCode()).toBe('USDC');
      expect(second.getCode()).toBe('USDT');
    });

    it('should handle two native assets', () => {
      const xlm1 = Asset.native();
      const xlm2 = Asset.native();

      const [first, second] = sortAssets(xlm1, xlm2);

      expect(first.isNative()).toBe(true);
      expect(second.isNative()).toBe(true);
    });

    it('should maintain deterministic order', () => {
      // Sort multiple times should give same result
      const [first1, second1] = sortAssets(usdc, btc);
      const [first2, second2] = sortAssets(usdc, btc);

      expect(first1.getCode()).toBe(first2.getCode());
      expect(second1.getCode()).toBe(second2.getCode());
    });
  });

  describe('Edge Cases and Integration', () => {
    it('should handle optimal deposit with formatted assets', () => {
      const result = calculateOptimalDeposit('1000', '5000', mockPool);
      const formatted = formatPoolAssets(mockPool);

      expect(formatted).toBe('XLM/USDC');
      expect(result.amountA).toBeDefined();
    });

    it('should calculate share value and check if assets are equal', () => {
      const value = calculateShareValue('1000', mockPool);
      const equal = assetsEqual(mockPool.assetA, Asset.native());

      expect(equal).toBe(true);
      expect(value.valueA).toBeDefined();
    });

    it('should sort assets and format pool', () => {
      const [first, second] = sortAssets(usdc, xlm);
      const pool: LiquidityPool = {
        ...mockPool,
        assetA: first,
        assetB: second,
      };

      const formatted = formatPoolAssets(pool);
      expect(formatted).toMatch(/USDC|XLM/);
    });

    it('should handle precision across all helper functions', () => {
      const optimal = calculateOptimalDeposit('1234.5678901', '5000', mockPool);
      const formatted = toStellarPrecision(optimal.amountA);
      const shareValue = calculateShareValue(formatted, mockPool);

      expect(formatted.split('.')[1].length).toBe(7);
      expect(shareValue.valueA.split('.')[1].length).toBe(7);
    });
  });
});
