/**
 * @fileoverview Tests for sponsorship validation utilities
 * @description Unit tests for validation functions
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import {
  validatePublicKey,
  validateSecretKey,
  validateSponsorBalance,
  validateOperationSequence,
  validateAssetCode,
  validateAmount,
  validateClaimants,
  validateClaimPredicate,
  validateDataEntryName,
  validateDataEntryValue,
  validateSignerWeight,
  validateEntryType,
} from '../utils/sponsorship-validation';

// Mock Stellar SDK
jest.mock('@stellar/stellar-sdk', () => ({
  StrKey: {
    isValidEd25519PublicKey: jest.fn(key => key.startsWith('G') && key.length === 56),
    isValidEd25519SecretSeed: jest.fn(key => key.startsWith('S') && key.length === 56),
    isValidPreAuthTx: jest.fn(key => key.startsWith('T') && key.length === 56),
    isValidSha256Hash: jest.fn(key => key.startsWith('X') && key.length === 56),
  },
}));

describe('Sponsorship Validation Utilities', () => {
  describe('validatePublicKey', () => {
    it('should return true for valid public key', () => {
      const validKey = 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      expect(validatePublicKey(validKey)).toBe(true);
    });

    it('should return false for invalid public key', () => {
      expect(validatePublicKey('INVALID')).toBe(false);
      expect(validatePublicKey('')).toBe(false);
      expect(validatePublicKey(null as any)).toBe(false);
      expect(validatePublicKey(undefined as any)).toBe(false);
    });

    it('should return false for secret key', () => {
      const secretKey = 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      expect(validatePublicKey(secretKey)).toBe(false);
    });
  });

  describe('validateSecretKey', () => {
    it('should return true for valid secret key', () => {
      const validKey = 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      expect(validateSecretKey(validKey)).toBe(true);
    });

    it('should return false for invalid secret key', () => {
      expect(validateSecretKey('INVALID')).toBe(false);
      expect(validateSecretKey('')).toBe(false);
      expect(validateSecretKey(null as any)).toBe(false);
    });

    it('should return false for public key', () => {
      const publicKey = 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      expect(validateSecretKey(publicKey)).toBe(false);
    });
  });

  describe('validateSponsorBalance', () => {
    it('should return valid for sufficient balance', () => {
      const result = validateSponsorBalance('100', '10', '1');
      expect(result.valid).toBe(true);
    });

    it('should return invalid for insufficient balance', () => {
      const result = validateSponsorBalance('5', '10', '1');
      expect(result.valid).toBe(false);
      expect(result.shortfall).toBeDefined();
      expect(result.message).toContain('Insufficient balance');
    });

    it('should include buffer in calculation', () => {
      // 10 required + 2 buffer = 12 needed, have 11
      const result = validateSponsorBalance('11', '10', '2');
      expect(result.valid).toBe(false);
    });

    it('should handle invalid values', () => {
      const result = validateSponsorBalance('invalid', '10', '1');
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Invalid balance values');
    });
  });

  describe('validateOperationSequence', () => {
    it('should return valid for properly paired operations', () => {
      const operations = [
        'beginSponsoringFutureReserves',
        'createAccount',
        'endSponsoringFutureReserves',
      ];
      const result = validateOperationSequence(operations);
      expect(result.valid).toBe(true);
    });

    it('should return invalid for unmatched begin', () => {
      const operations = [
        'beginSponsoringFutureReserves',
        'createAccount',
      ];
      const result = validateOperationSequence(operations);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Unmatched beginSponsoringFutureReserves');
    });

    it('should return invalid for unmatched end', () => {
      const operations = [
        'createAccount',
        'endSponsoringFutureReserves',
      ];
      const result = validateOperationSequence(operations);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Unmatched endSponsoringFutureReserves');
    });

    it('should return invalid for nested sponsorship', () => {
      const operations = [
        'beginSponsoringFutureReserves',
        'beginSponsoringFutureReserves',
        'endSponsoringFutureReserves',
        'endSponsoringFutureReserves',
      ];
      const result = validateOperationSequence(operations);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Nested sponsorship');
    });
  });

  describe('validateAssetCode', () => {
    it('should return true for valid asset codes', () => {
      expect(validateAssetCode('USDC')).toBe(true);
      expect(validateAssetCode('BTC')).toBe(true);
      expect(validateAssetCode('LONGASSET123')).toBe(true);
      expect(validateAssetCode('A')).toBe(true);
    });

    it('should return false for invalid asset codes', () => {
      expect(validateAssetCode('')).toBe(false);
      expect(validateAssetCode('TOOLONGASSETCODE')).toBe(false);
      expect(validateAssetCode('INVALID!')).toBe(false);
      expect(validateAssetCode(null as any)).toBe(false);
    });
  });

  describe('validateAmount', () => {
    it('should return true for valid positive amounts', () => {
      expect(validateAmount('100')).toBe(true);
      expect(validateAmount('0.0000001')).toBe(true);
      expect(validateAmount('999999999.9999999')).toBe(true);
    });

    it('should return false for invalid amounts', () => {
      expect(validateAmount('0')).toBe(false);
      expect(validateAmount('-10')).toBe(false);
      expect(validateAmount('invalid')).toBe(false);
      expect(validateAmount('')).toBe(false);
    });

    it('should handle allowZero parameter', () => {
      expect(validateAmount('0', true)).toBe(true);
      expect(validateAmount('-1', true)).toBe(false);
    });

    it('should reject amounts with too many decimals', () => {
      expect(validateAmount('1.12345678')).toBe(false);
    });
  });

  describe('validateClaimants', () => {
    it('should return valid for proper claimants', () => {
      const claimants = [
        {
          destination: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          predicate: { unconditional: true as const },
        },
      ];
      const result = validateClaimants(claimants);
      expect(result.valid).toBe(true);
    });

    it('should return invalid for empty claimants', () => {
      const result = validateClaimants([]);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('At least one claimant');
    });

    it('should return invalid for too many claimants', () => {
      const claimants = Array(11).fill({
        destination: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        predicate: { unconditional: true as const },
      });
      const result = validateClaimants(claimants);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Maximum 10 claimants');
    });

    it('should return invalid for missing destination', () => {
      const claimants = [
        {
          destination: '',
          predicate: { unconditional: true as const },
        },
      ];
      const result = validateClaimants(claimants);
      expect(result.valid).toBe(false);
    });

    it('should return invalid for invalid predicate', () => {
      const claimants = [
        {
          destination: 'GXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          predicate: { invalidType: true } as any,
        },
      ];
      const result = validateClaimants(claimants);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateClaimPredicate', () => {
    it('should validate unconditional predicate', () => {
      const result = validateClaimPredicate({ unconditional: true });
      expect(result.valid).toBe(true);
    });

    it('should validate AND predicate', () => {
      const result = validateClaimPredicate({
        and: [
          { unconditional: true },
          { beforeAbsoluteTime: '1704067200' },
        ],
      });
      expect(result.valid).toBe(true);
    });

    it('should validate OR predicate', () => {
      const result = validateClaimPredicate({
        or: [
          { unconditional: true },
          { beforeRelativeTime: '3600' },
        ],
      });
      expect(result.valid).toBe(true);
    });

    it('should validate NOT predicate', () => {
      const result = validateClaimPredicate({
        not: { beforeAbsoluteTime: '1704067200' },
      });
      expect(result.valid).toBe(true);
    });

    it('should validate beforeAbsoluteTime predicate', () => {
      const result = validateClaimPredicate({ beforeAbsoluteTime: '1704067200' });
      expect(result.valid).toBe(true);
    });

    it('should validate beforeRelativeTime predicate', () => {
      const result = validateClaimPredicate({ beforeRelativeTime: '3600' });
      expect(result.valid).toBe(true);
    });

    it('should return invalid for unknown predicate type', () => {
      const result = validateClaimPredicate({ unknownType: true } as any);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('Unknown predicate type');
    });

    it('should reject deeply nested predicates', () => {
      // Create predicate nested 12 levels deep
      let predicate: any = { unconditional: true };
      for (let i = 0; i < 12; i++) {
        predicate = { not: predicate };
      }
      const result = validateClaimPredicate(predicate);
      expect(result.valid).toBe(false);
      expect(result.message).toContain('too deep');
    });

    it('should reject AND with wrong number of predicates', () => {
      const result = validateClaimPredicate({
        and: [{ unconditional: true }],
      });
      expect(result.valid).toBe(false);
      expect(result.message).toContain('exactly 2 predicates');
    });
  });

  describe('validateDataEntryName', () => {
    it('should return true for valid names', () => {
      expect(validateDataEntryName('my_data')).toBe(true);
      expect(validateDataEntryName('a')).toBe(true);
      expect(validateDataEntryName('a'.repeat(64))).toBe(true);
    });

    it('should return false for invalid names', () => {
      expect(validateDataEntryName('')).toBe(false);
      expect(validateDataEntryName('a'.repeat(65))).toBe(false);
      expect(validateDataEntryName(null as any)).toBe(false);
    });
  });

  describe('validateDataEntryValue', () => {
    it('should return true for valid string values', () => {
      const validBase64 = Buffer.from('test').toString('base64');
      expect(validateDataEntryValue(validBase64)).toBe(true);
    });

    it('should return true for valid buffer values', () => {
      const validBuffer = Buffer.from('test');
      expect(validateDataEntryValue(validBuffer)).toBe(true);
    });

    it('should return false for values exceeding 64 bytes', () => {
      const largeBuffer = Buffer.alloc(65);
      expect(validateDataEntryValue(largeBuffer)).toBe(false);
    });

    it('should return false for empty values', () => {
      expect(validateDataEntryValue('')).toBe(false);
      expect(validateDataEntryValue(null as any)).toBe(false);
    });
  });

  describe('validateSignerWeight', () => {
    it('should return true for valid weights', () => {
      expect(validateSignerWeight(0)).toBe(true);
      expect(validateSignerWeight(1)).toBe(true);
      expect(validateSignerWeight(255)).toBe(true);
    });

    it('should return false for invalid weights', () => {
      expect(validateSignerWeight(-1)).toBe(false);
      expect(validateSignerWeight(256)).toBe(false);
      expect(validateSignerWeight(1.5)).toBe(false);
      expect(validateSignerWeight(NaN)).toBe(false);
    });
  });

  describe('validateEntryType', () => {
    it('should return true for valid entry types', () => {
      expect(validateEntryType('account')).toBe(true);
      expect(validateEntryType('trustline')).toBe(true);
      expect(validateEntryType('offer')).toBe(true);
      expect(validateEntryType('data')).toBe(true);
      expect(validateEntryType('claimable_balance')).toBe(true);
      expect(validateEntryType('signer')).toBe(true);
    });

    it('should return false for invalid entry types', () => {
      expect(validateEntryType('invalid')).toBe(false);
      expect(validateEntryType('')).toBe(false);
    });
  });
});
