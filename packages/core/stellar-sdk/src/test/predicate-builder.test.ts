/**
 * @fileoverview Unit tests for predicate builder utilities
 * @description Tests for predicate creation, validation, and conversion
 */

// Mock Stellar SDK ClaimPredicate
const mockClaimPredicate = {
  predicateUnconditional: jest.fn(() => ({ type: 'unconditional' })),
  predicateBeforeAbsoluteTime: jest.fn((timestamp) => ({
    type: 'abs_before',
    timestamp,
  })),
  predicateBeforeRelativeTime: jest.fn((seconds) => ({
    type: 'rel_before',
    seconds,
  })),
  predicateNot: jest.fn((pred) => ({ type: 'not', predicate: pred })),
  predicateAnd: jest.fn((preds) => ({ type: 'and', predicates: preds })),
  predicateOr: jest.fn((preds) => ({ type: 'or', predicates: preds })),
};

jest.mock('@stellar/stellar-sdk', () => ({
  ClaimPredicate: mockClaimPredicate,
}));

import {
  unconditional,
  beforeAbsoluteTime,
  beforeRelativeTime,
  not,
  and,
  or,
  toStellarPredicate,
  validatePredicate,
  isPredicateClaimable,
} from '../claimable-balances/predicate-builder.js';

describe('Predicate Builder', () => {
  describe('unconditional', () => {
    it('should create unconditional predicate', () => {
      const predicate = unconditional();

      expect(predicate).toEqual({ unconditional: true });
    });
  });

  describe('beforeAbsoluteTime', () => {
    it('should create absolute time predicate with Date object', () => {
      const date = new Date('2025-12-31T00:00:00Z');
      const predicate = beforeAbsoluteTime(date);

      expect(predicate).toHaveProperty('abs_before');
      expect(predicate.abs_before).toBe(date.toISOString());
    });

    it('should create absolute time predicate with ISO string', () => {
      const isoString = '2025-12-31T00:00:00.000Z';
      const predicate = beforeAbsoluteTime(isoString);

      expect(predicate).toHaveProperty('abs_before');
      expect(predicate.abs_before).toBe(isoString);
    });
  });

  describe('beforeRelativeTime', () => {
    it('should create relative time predicate', () => {
      const seconds = 86400; // 24 hours
      const predicate = beforeRelativeTime(seconds);

      expect(predicate).toHaveProperty('rel_before');
      expect(predicate.rel_before).toBe('86400');
    });

    it('should handle fractional seconds', () => {
      const seconds = 3600.5;
      const predicate = beforeRelativeTime(seconds);

      expect(predicate.rel_before).toBe('3600.5');
    });
  });

  describe('not', () => {
    it('should create NOT predicate', () => {
      const innerPredicate = unconditional();
      const predicate = not(innerPredicate);

      expect(predicate).toHaveProperty('not');
      expect(predicate.not).toBe(innerPredicate);
    });

    it('should nest NOT predicates', () => {
      const inner = unconditional();
      const notPredicate = not(inner);
      const doubleNot = not(notPredicate);

      expect(doubleNot).toHaveProperty('not');
      expect(doubleNot.not).toHaveProperty('not');
    });
  });

  describe('and', () => {
    it('should create AND predicate', () => {
      const pred1 = unconditional();
      const pred2 = beforeAbsoluteTime(new Date('2025-12-31'));
      const predicate = and(pred1, pred2);

      expect(predicate).toHaveProperty('and');
      expect(predicate.and).toHaveLength(2);
      expect(predicate.and[0]).toBe(pred1);
      expect(predicate.and[1]).toBe(pred2);
    });
  });

  describe('or', () => {
    it('should create OR predicate', () => {
      const pred1 = unconditional();
      const pred2 = beforeRelativeTime(3600);
      const predicate = or(pred1, pred2);

      expect(predicate).toHaveProperty('or');
      expect(predicate.or).toHaveLength(2);
      expect(predicate.or[0]).toBe(pred1);
      expect(predicate.or[1]).toBe(pred2);
    });
  });

  describe('toStellarPredicate', () => {
    it('should convert unconditional predicate', () => {
      const predicate = unconditional();
      const stellarPred = toStellarPredicate(predicate);

      expect(stellarPred).toBeDefined();
    });

    it('should convert absolute time predicate', () => {
      const date = new Date('2025-12-31T00:00:00Z');
      const predicate = beforeAbsoluteTime(date);
      const stellarPred = toStellarPredicate(predicate);

      expect(stellarPred).toBeDefined();
    });

    it('should convert relative time predicate', () => {
      const predicate = beforeRelativeTime(86400);
      const stellarPred = toStellarPredicate(predicate);

      expect(stellarPred).toBeDefined();
    });

    it('should convert NOT predicate', () => {
      const predicate = not(unconditional());
      const stellarPred = toStellarPredicate(predicate);

      expect(stellarPred).toBeDefined();
    });

    it('should convert AND predicate', () => {
      const predicate = and(unconditional(), beforeAbsoluteTime(new Date()));
      const stellarPred = toStellarPredicate(predicate);

      expect(stellarPred).toBeDefined();
    });

    it('should convert OR predicate', () => {
      const predicate = or(unconditional(), beforeRelativeTime(3600));
      const stellarPred = toStellarPredicate(predicate);

      expect(stellarPred).toBeDefined();
    });

    it('should throw error for invalid predicate type', () => {
      const invalidPredicate: any = { invalid: true };

      expect(() => toStellarPredicate(invalidPredicate)).toThrow('Invalid predicate type');
    });
  });

  describe('validatePredicate', () => {
    it('should validate unconditional predicate', () => {
      const predicate = unconditional();

      expect(() => validatePredicate(predicate)).not.toThrow();
    });

    it('should validate absolute time predicate with future date', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const predicate = beforeAbsoluteTime(futureDate);

      expect(() => validatePredicate(predicate)).not.toThrow();
    });

    it('should throw error for absolute time predicate with past date', () => {
      const pastDate = new Date('2020-01-01');
      const predicate = beforeAbsoluteTime(pastDate);

      expect(() => validatePredicate(predicate)).toThrow('Absolute timestamp must be in the future');
    });

    it('should throw error for invalid absolute timestamp format', () => {
      const predicate: any = { abs_before: 'invalid-date' };

      expect(() => validatePredicate(predicate)).toThrow('Invalid absolute timestamp format');
    });

    it('should validate relative time predicate with positive seconds', () => {
      const predicate = beforeRelativeTime(3600);

      expect(() => validatePredicate(predicate)).not.toThrow();
    });

    it('should throw error for relative time predicate with zero seconds', () => {
      const predicate = beforeRelativeTime(0);

      expect(() => validatePredicate(predicate)).toThrow('Relative time must be a positive number');
    });

    it('should throw error for relative time predicate with negative seconds', () => {
      const predicate = beforeRelativeTime(-100);

      expect(() => validatePredicate(predicate)).toThrow('Relative time must be a positive number');
    });

    it('should validate NOT predicate', () => {
      const predicate = not(unconditional());

      expect(() => validatePredicate(predicate)).not.toThrow();
    });

    it('should validate AND predicate with two sub-predicates', () => {
      // Use a future date to ensure validation passes
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const predicate = and(unconditional(), beforeAbsoluteTime(futureDate));

      expect(() => validatePredicate(predicate)).not.toThrow();
    });

    it('should throw error for AND predicate with invalid sub-predicates', () => {
      const predicate: any = { and: [unconditional()] }; // Only one predicate

      expect(() => validatePredicate(predicate)).toThrow('AND predicate must have exactly 2 sub-predicates');
    });

    it('should validate OR predicate with two sub-predicates', () => {
      const predicate = or(unconditional(), beforeRelativeTime(3600));

      expect(() => validatePredicate(predicate)).not.toThrow();
    });

    it('should throw error for OR predicate with invalid sub-predicates', () => {
      const predicate: any = { or: [unconditional()] }; // Only one predicate

      expect(() => validatePredicate(predicate)).toThrow('OR predicate must have exactly 2 sub-predicates');
    });

    it('should throw error for unknown predicate type', () => {
      const predicate: any = { unknown: true };

      expect(() => validatePredicate(predicate)).toThrow('Unknown predicate type');
    });
  });

  describe('isPredicateClaimable', () => {
    it('should return true for unconditional predicate', () => {
      const predicate = unconditional();

      expect(isPredicateClaimable(predicate)).toBe(true);
    });

    it('should return true for absolute time predicate in the future', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const predicate = beforeAbsoluteTime(futureDate);

      expect(isPredicateClaimable(predicate)).toBe(true);
    });

    it('should return false for absolute time predicate in the past', () => {
      const pastDate = new Date('2020-01-01');
      const predicate = beforeAbsoluteTime(pastDate);

      expect(isPredicateClaimable(predicate)).toBe(false);
    });

    it('should return true for relative time predicate without creation time', () => {
      const predicate = beforeRelativeTime(3600);

      // Without creation time, we can't validate, so it returns true
      expect(isPredicateClaimable(predicate)).toBe(true);
    });

    it('should return true for relative time predicate within time limit', () => {
      const createdAt = new Date();
      createdAt.setHours(createdAt.getHours() - 1); // 1 hour ago
      const predicate = beforeRelativeTime(7200); // 2 hours

      expect(isPredicateClaimable(predicate, createdAt)).toBe(true);
    });

    it('should return false for relative time predicate past time limit', () => {
      const createdAt = new Date();
      createdAt.setHours(createdAt.getHours() - 3); // 3 hours ago
      const predicate = beforeRelativeTime(3600); // 1 hour

      expect(isPredicateClaimable(predicate, createdAt)).toBe(false);
    });

    it('should handle NOT predicate', () => {
      const predicate = not(unconditional());

      // NOT of unconditional (true) = false
      expect(isPredicateClaimable(predicate)).toBe(false);
    });

    it('should handle AND predicate with both true', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const predicate = and(unconditional(), beforeAbsoluteTime(futureDate));

      expect(isPredicateClaimable(predicate)).toBe(true);
    });

    it('should handle AND predicate with one false', () => {
      const pastDate = new Date('2020-01-01');
      const predicate = and(unconditional(), beforeAbsoluteTime(pastDate));

      expect(isPredicateClaimable(predicate)).toBe(false);
    });

    it('should handle OR predicate with one true', () => {
      const pastDate = new Date('2020-01-01');
      const predicate = or(unconditional(), beforeAbsoluteTime(pastDate));

      expect(isPredicateClaimable(predicate)).toBe(true);
    });

    it('should handle OR predicate with both false', () => {
      const pastDate = new Date('2020-01-01');
      const predicate = or(beforeAbsoluteTime(pastDate), beforeAbsoluteTime(pastDate));

      expect(isPredicateClaimable(predicate)).toBe(false);
    });

    it('should handle nested predicates', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      const predicate = and(
        or(unconditional(), beforeAbsoluteTime(futureDate)),
        not(beforeAbsoluteTime(new Date('2020-01-01')))
      );

      expect(isPredicateClaimable(predicate)).toBe(true);
    });
  });
});
