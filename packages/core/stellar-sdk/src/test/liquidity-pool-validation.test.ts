/**
 * @fileoverview Unit tests for liquidity pool validation functions
 * @description Tests for pool ID, amount, slippage, price, and parameter validation
 */

import { Keypair } from '@stellar/stellar-sdk';
import {
  validatePoolId,
  validateAmount,
  validateSlippage,
  validatePrice,
  validatePublicKey,
  validateDepositParams,
  validateWithdrawParams,
  validateSufficientShares,
  validateMinimumLiquidity,
} from '../liquidity-pools/validation.js';
import { LiquidityPoolDeposit, LiquidityPoolWithdraw } from '../liquidity-pools/types.js';

const VALID_POOL_ID =
  'a'.repeat(64);
const VALID_PUBLIC_KEY = Keypair.random().publicKey();

describe('validatePoolId', () => {
  it('accepts a 64-character hex string', () => {
    expect(validatePoolId(VALID_POOL_ID)).toBe(true);
  });

  it('accepts uppercase hex characters', () => {
    expect(validatePoolId('A'.repeat(64))).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(() => validatePoolId('')).toThrow('Pool ID must be a non-empty string');
  });

  it('rejects a string that is too short', () => {
    expect(() => validatePoolId('abc123')).toThrow('Invalid pool ID format');
  });

  it('rejects a string with non-hex characters', () => {
    expect(() => validatePoolId('z'.repeat(64))).toThrow('Invalid pool ID format');
  });
});

describe('validateAmount', () => {
  it('accepts a positive numeric string', () => {
    expect(validateAmount('100.5')).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(() => validateAmount('')).toThrow('Amount must be a non-empty string');
  });

  it('rejects a non-numeric string', () => {
    expect(() => validateAmount('abc')).toThrow('Amount must be a valid number');
  });

  it('rejects zero', () => {
    expect(() => validateAmount('0')).toThrow('Amount must be greater than 0');
  });

  it('rejects a negative amount', () => {
    expect(() => validateAmount('-5')).toThrow('Amount must be greater than 0');
  });

  it('rejects an amount above the Stellar maximum', () => {
    expect(() => validateAmount('922337203685.4775808')).toThrow(
      'Amount exceeds maximum Stellar amount'
    );
  });

  it('accepts the Stellar maximum amount exactly', () => {
    expect(validateAmount('922337203685.4775807')).toBe(true);
  });

  it('uses the provided field name in error messages', () => {
    expect(() => validateAmount('0', 'maxAmountA')).toThrow(
      'maxAmountA must be greater than 0'
    );
  });
});

describe('validateSlippage', () => {
  it('accepts a value within [0, 1]', () => {
    expect(validateSlippage('0.01')).toBe(true);
    expect(validateSlippage('0')).toBe(true);
    expect(validateSlippage('1')).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(() => validateSlippage('')).toThrow('Slippage must be a non-empty string');
  });

  it('rejects a non-numeric string', () => {
    expect(() => validateSlippage('abc')).toThrow('Slippage must be a valid number');
  });

  it('rejects a value below 0', () => {
    expect(() => validateSlippage('-0.1')).toThrow(
      'Slippage must be between 0 and 1 (0% to 100%)'
    );
  });

  it('rejects a value above 1', () => {
    expect(() => validateSlippage('1.1')).toThrow(
      'Slippage must be between 0 and 1 (0% to 100%)'
    );
  });
});

describe('validatePrice', () => {
  it('accepts a positive numeric string', () => {
    expect(validatePrice('1.5')).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(() => validatePrice('')).toThrow('Price must be a non-empty string');
  });

  it('rejects zero', () => {
    expect(() => validatePrice('0')).toThrow('Price must be greater than 0');
  });

  it('rejects a negative price', () => {
    expect(() => validatePrice('-1')).toThrow('Price must be greater than 0');
  });

  it('uses the provided field name in error messages', () => {
    expect(() => validatePrice('0', 'minPrice')).toThrow('minPrice must be greater than 0');
  });
});

describe('validatePublicKey', () => {
  it('accepts a valid Stellar public key', () => {
    expect(validatePublicKey(VALID_PUBLIC_KEY)).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(() => validatePublicKey('')).toThrow('Public key must be a non-empty string');
  });

  it('rejects a malformed public key', () => {
    expect(() => validatePublicKey('INVALID')).toThrow('Invalid public key: INVALID');
  });
});

describe('validateDepositParams', () => {
  const baseParams: LiquidityPoolDeposit = {
    poolId: VALID_POOL_ID,
    maxAmountA: '100',
    maxAmountB: '200',
  };

  it('accepts minimal valid params', () => {
    expect(() => validateDepositParams(baseParams)).not.toThrow();
  });

  it('accepts valid optional fields', () => {
    expect(() =>
      validateDepositParams({
        ...baseParams,
        slippageTolerance: '0.01',
        minPrice: '1',
        maxPrice: '2',
        fee: 100,
        memo: 'deposit',
      })
    ).not.toThrow();
  });

  it('rejects an invalid pool ID', () => {
    expect(() => validateDepositParams({ ...baseParams, poolId: 'bad' })).toThrow(
      'Invalid pool ID format'
    );
  });

  it('rejects a zero maxAmountA', () => {
    expect(() => validateDepositParams({ ...baseParams, maxAmountA: '0' })).toThrow(
      'maxAmountA must be greater than 0'
    );
  });

  it('rejects minPrice >= maxPrice', () => {
    expect(() =>
      validateDepositParams({ ...baseParams, minPrice: '2', maxPrice: '1' })
    ).toThrow('minPrice must be less than maxPrice');
  });

  it('rejects a negative fee', () => {
    expect(() => validateDepositParams({ ...baseParams, fee: -1 })).toThrow(
      'Fee must be a non-negative number'
    );
  });

  it('rejects a non-string memo', () => {
    expect(() =>
      validateDepositParams({ ...baseParams, memo: 123 as unknown as string })
    ).toThrow('Memo must be a string');
  });
});

describe('validateWithdrawParams', () => {
  const baseParams: LiquidityPoolWithdraw = {
    poolId: VALID_POOL_ID,
    shares: '50',
  };

  it('accepts minimal valid params', () => {
    expect(() => validateWithdrawParams(baseParams)).not.toThrow();
  });

  it('accepts valid optional fields', () => {
    expect(() =>
      validateWithdrawParams({
        ...baseParams,
        minAmountA: '10',
        minAmountB: '20',
        slippageTolerance: '0.02',
        fee: 100,
        memo: 'withdraw',
      })
    ).not.toThrow();
  });

  it('rejects an invalid pool ID', () => {
    expect(() => validateWithdrawParams({ ...baseParams, poolId: 'bad' })).toThrow(
      'Invalid pool ID format'
    );
  });

  it('rejects zero shares', () => {
    expect(() => validateWithdrawParams({ ...baseParams, shares: '0' })).toThrow(
      'shares must be greater than 0'
    );
  });

  it('rejects a negative fee', () => {
    expect(() => validateWithdrawParams({ ...baseParams, fee: -1 })).toThrow(
      'Fee must be a non-negative number'
    );
  });
});

describe('validateSufficientShares', () => {
  it('accepts requested shares equal to available', () => {
    expect(validateSufficientShares('100', '100')).toBe(true);
  });

  it('accepts requested shares less than available', () => {
    expect(validateSufficientShares('50', '100')).toBe(true);
  });

  it('rejects requested shares greater than available', () => {
    expect(() => validateSufficientShares('150', '100')).toThrow(
      'Insufficient shares. Requested: 150, Available: 100'
    );
  });
});

describe('validateMinimumLiquidity', () => {
  it('accepts liquidity above the default minimum', () => {
    expect(validateMinimumLiquidity('100', '100')).toBe(true);
  });

  it('rejects liquidity below the default minimum', () => {
    expect(() => validateMinimumLiquidity('0.00000001', '0.00000001')).toThrow(
      'Liquidity below minimum threshold'
    );
  });

  it('respects a custom minimum threshold', () => {
    expect(() => validateMinimumLiquidity('1', '1', '10')).toThrow(
      'Liquidity below minimum threshold'
    );
    expect(validateMinimumLiquidity('100', '100', '10')).toBe(true);
  });
});
