/**
 * @fileoverview Tests for validation utilities
 * @description Unit tests for DeFi validation functions
 */

import {
  validateAddress,
  validateAmount,
  validateAsset,
  validateSlippage,
  isHealthyPosition,
  calculateMinimumAmount,
  compareAmounts
} from '../../src/utils/validation';
import { Asset, AssetType } from '../../src/types/defi-types';

describe('Validation Utils', () => {
  describe('validateAddress', () => {
    it('should validate a correct Stellar address', () => {
      const validAddress = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';
      expect(() => validateAddress(validAddress)).not.toThrow();
      expect(validateAddress(validAddress)).toBe(true);
    });

    it('should throw error for invalid address', () => {
      expect(() => validateAddress('invalid_address')).toThrow('Invalid Stellar address');
    });

    it('should throw error for empty address', () => {
      expect(() => validateAddress('')).toThrow('Address must be a non-empty string');
    });
  });

  describe('validateAmount', () => {
    it('should validate a correct amount', () => {
      expect(() => validateAmount('100.50')).not.toThrow();
      expect(validateAmount('100.50')).toBe(true);
    });

    it('should throw error for zero amount', () => {
      expect(() => validateAmount('0')).toThrow('Amount must be greater than 0');
    });

    it('should throw error for negative amount', () => {
      expect(() => validateAmount('-10')).toThrow('Amount must be greater than 0');
    });

    it('should throw error for non-numeric amount', () => {
      expect(() => validateAmount('abc')).toThrow('Amount must be a valid number');
    });

    it('should throw error for empty amount', () => {
      expect(() => validateAmount('')).toThrow('Amount must be a non-empty string');
    });

    it('should use custom field name in error messages', () => {
      expect(() => validateAmount('0', 'Deposit')).toThrow('Deposit must be greater than 0');
    });
  });

  describe('validateAsset', () => {
    it('should validate a native asset', () => {
      const asset: Asset = {
        code: 'XLM',
        type: 'native'
      };
      expect(() => validateAsset(asset)).not.toThrow();
      expect(validateAsset(asset)).toBe(true);
    });

    it('should validate a credit asset with issuer', () => {
      const asset: Asset = {
        code: 'USDC',
        type: 'credit_alphanum4',
        issuer: 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H'
      };
      expect(() => validateAsset(asset)).not.toThrow();
      expect(validateAsset(asset)).toBe(true);
    });

    it('should throw error for credit asset without issuer', () => {
      const asset: Asset = {
        code: 'USDC',
        type: 'credit_alphanum4'
      };
      expect(() => validateAsset(asset)).toThrow('Non-native assets must have an issuer');
    });

    it('should throw error for asset without code', () => {
      const asset: any = {
        type: 'native'
      };
      expect(() => validateAsset(asset)).toThrow('Asset code is required');
    });

    it('should throw error for invalid asset type', () => {
      const asset: any = {
        code: 'XLM',
        type: 'invalid_type'
      };
      expect(() => validateAsset(asset)).toThrow('Asset type must be native');
    });
  });

  describe('validateSlippage', () => {
    it('should validate correct slippage values', () => {
      expect(() => validateSlippage('0.01')).not.toThrow();
      expect(() => validateSlippage('0.5')).not.toThrow();
      expect(() => validateSlippage('0')).not.toThrow();
      expect(() => validateSlippage('1')).not.toThrow();
    });

    it('should throw error for slippage > 1', () => {
      expect(() => validateSlippage('1.5')).toThrow('Slippage must be between 0 and 1');
    });

    it('should throw error for negative slippage', () => {
      expect(() => validateSlippage('-0.1')).toThrow('Slippage must be between 0 and 1');
    });

    it('should throw error for non-numeric slippage', () => {
      expect(() => validateSlippage('abc')).toThrow('Slippage must be a valid number');
    });
  });

  describe('isHealthyPosition', () => {
    it('should return true for health factor >= 1', () => {
      expect(isHealthyPosition('1.0')).toBe(true);
      expect(isHealthyPosition('1.5')).toBe(true);
      expect(isHealthyPosition('2.0')).toBe(true);
    });

    it('should return false for health factor < 1', () => {
      expect(isHealthyPosition('0.9')).toBe(false);
      expect(isHealthyPosition('0.5')).toBe(false);
      expect(isHealthyPosition('0')).toBe(false);
    });
  });

  describe('calculateMinimumAmount', () => {
    it('should calculate minimum amount with slippage', () => {
      const result = calculateMinimumAmount('100', '0.01'); // 1% slippage
      expect(result).toBe('99');
    });

    it('should calculate minimum amount with higher slippage', () => {
      const result = calculateMinimumAmount('1000', '0.05'); // 5% slippage
      expect(result).toBe('950');
    });

    it('should throw error for invalid expected amount', () => {
      expect(() => calculateMinimumAmount('invalid', '0.01')).toThrow();
    });

    it('should throw error for invalid slippage', () => {
      expect(() => calculateMinimumAmount('100', '1.5')).toThrow();
    });
  });

  describe('compareAmounts', () => {
    it('should return -1 when amount1 < amount2', () => {
      expect(compareAmounts('50', '100')).toBe(-1);
    });

    it('should return 0 when amounts are equal', () => {
      expect(compareAmounts('100', '100')).toBe(0);
    });

    it('should return 1 when amount1 > amount2', () => {
      expect(compareAmounts('150', '100')).toBe(1);
    });

    it('should handle decimal amounts', () => {
      expect(compareAmounts('100.5', '100.49')).toBe(1);
      expect(compareAmounts('100.49', '100.5')).toBe(-1);
    });
  });
});
