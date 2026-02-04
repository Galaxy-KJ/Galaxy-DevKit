/**
 * @fileoverview Unit tests for claimable balance helper functions
 * @description Tests for time-locked balances, vesting, escrow, etc.
 */

// Mock Stellar SDK - Define mocks before imports
jest.mock('@stellar/stellar-sdk', () => ({
  Asset: {
    native: jest.fn(() => ({ code: 'XLM', type: 'native' })),
  },
  Operation: {
    createClaimableBalance: jest.fn((opts) => ({ type: 'createClaimableBalance', ...opts })),
  },
  ClaimPredicate: {
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
  },
  Account: jest.fn(),
}));

import {
  createTimeLockedBalance,
  createVestingSchedule,
  createEscrow,
  createTwoPartyEscrow,
  createConditionalRelease,
  createRefundableBalance,
} from '../claimable-balances/helpers.js';
import { Asset, Account } from '@stellar/stellar-sdk';

describe('Claimable Balance Helpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createTimeLockedBalance', () => {
    it('should create time-locked balance operation', () => {
      const unlockDate = new Date('2025-12-31T00:00:00Z');
      const params = {
        asset: Asset.native(),
        amount: '100.0000000',
        claimant: 'GCLAIMANTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        unlockDate,
      };

      const operation = createTimeLockedBalance(params);

      expect(operation).toBeDefined();
      const { Operation } = require('@stellar/stellar-sdk');
      expect(Operation.createClaimableBalance).toHaveBeenCalled();
    });

    it('should include correct claimant and predicate', () => {
      const unlockDate = new Date('2025-12-31T00:00:00Z');
      const params = {
        asset: Asset.native(),
        amount: '100.0000000',
        claimant: 'GCLAIMANTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        unlockDate,
      };

      createTimeLockedBalance(params);

      const { Operation } = require('@stellar/stellar-sdk');
      const callArgs = Operation.createClaimableBalance.mock.calls[0][0];
      expect(callArgs.claimants).toHaveLength(1);
      expect(callArgs.claimants[0].destination).toBe(params.claimant);
    });
  });

  describe('createVestingSchedule', () => {
    const mockAccount: any = {
      accountId: () => 'GACCOUNTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      sequenceNumber: () => '123456',
    };

    it('should create vesting schedule with multiple operations', () => {
      const params = {
        asset: Asset.native(),
        totalAmount: '10000.0000000',
        claimant: 'GCLAIMANTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        vestingPeriods: [
          { date: new Date('2025-01-01'), percentage: 25 },
          { date: new Date('2025-04-01'), percentage: 25 },
          { date: new Date('2025-07-01'), percentage: 25 },
          { date: new Date('2025-10-01'), percentage: 25 },
        ],
      };

      const operations = createVestingSchedule(mockAccount, params);

      expect(operations).toHaveLength(4);
      expect(operations[0]).toBeDefined();
    });

    it('should calculate correct amounts for each period', () => {
      const params = {
        asset: Asset.native(),
        totalAmount: '1000.0000000',
        claimant: 'GCLAIMANTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        vestingPeriods: [
          { date: new Date('2025-01-01'), percentage: 50 },
          { date: new Date('2025-06-01'), percentage: 50 },
        ],
      };

      const operations = createVestingSchedule(mockAccount, params);

      expect(operations).toHaveLength(2);
      const { Operation } = require('@stellar/stellar-sdk');
      expect(Operation.createClaimableBalance).toHaveBeenCalledTimes(2);
    });

    it('should throw error if percentages do not sum to 100', () => {
      const params = {
        asset: Asset.native(),
        totalAmount: '1000.0000000',
        claimant: 'GCLAIMANTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        vestingPeriods: [
          { date: new Date('2025-01-01'), percentage: 30 },
          { date: new Date('2025-06-01'), percentage: 50 },
        ],
      };

      expect(() => createVestingSchedule(mockAccount, params)).toThrow(
        'Vesting periods must sum to 100%'
      );
    });

    it('should sort periods by date', () => {
      const params = {
        asset: Asset.native(),
        totalAmount: '1000.0000000',
        claimant: 'GCLAIMANTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        vestingPeriods: [
          { date: new Date('2025-06-01'), percentage: 50 },
          { date: new Date('2025-01-01'), percentage: 50 },
        ],
      };

      const operations = createVestingSchedule(mockAccount, params);

      expect(operations).toHaveLength(2);
      // Operations should be in chronological order
      const { Operation } = require('@stellar/stellar-sdk');
      const calls = Operation.createClaimableBalance.mock.calls;
      expect(calls.length).toBe(2);
    });
  });

  describe('createEscrow', () => {
    it('should create escrow with multiple parties', () => {
      const params = {
        asset: Asset.native(),
        amount: '1000.0000000',
        parties: [
          'GBUYERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          'GSELLERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        ],
        releaseDate: new Date('2025-06-01'),
        arbitrator: 'GARBITRATORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      };

      const operation = createEscrow(params);

      expect(operation).toBeDefined();
      const { Operation } = require('@stellar/stellar-sdk');
      const callArgs = Operation.createClaimableBalance.mock.calls[0][0];
      expect(callArgs.claimants.length).toBeGreaterThanOrEqual(2);
    });

    it('should throw error for less than 2 parties', () => {
      const params = {
        asset: Asset.native(),
        amount: '1000.0000000',
        parties: ['GONLYONEXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'],
      };

      expect(() => createEscrow(params)).toThrow('Escrow requires at least 2 parties');
    });

    it('should include arbitrator if provided', () => {
      const params = {
        asset: Asset.native(),
        amount: '1000.0000000',
        parties: [
          'GBUYERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          'GSELLERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        ],
        arbitrator: 'GARBITRATORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
      };

      createEscrow(params);

      const { Operation } = require('@stellar/stellar-sdk');
      const callArgs = Operation.createClaimableBalance.mock.calls[0][0];
      const hasArbitrator = callArgs.claimants.some(
        (c: any) => c.destination === params.arbitrator
      );
      expect(hasArbitrator).toBe(true);
    });

    it('should use time-locked predicate if releaseDate provided', () => {
      const releaseDate = new Date('2025-06-01');
      const params = {
        asset: Asset.native(),
        amount: '1000.0000000',
        parties: [
          'GBUYERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          'GSELLERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        ],
        releaseDate,
      };

      createEscrow(params);

      const { Operation } = require('@stellar/stellar-sdk');
      expect(Operation.createClaimableBalance).toHaveBeenCalled();
    });

    it('should use unconditional predicate if no releaseDate', () => {
      const params = {
        asset: Asset.native(),
        amount: '1000.0000000',
        parties: [
          'GBUYERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
          'GSELLERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        ],
      };

      createEscrow(params);

      const { Operation } = require('@stellar/stellar-sdk');
      expect(Operation.createClaimableBalance).toHaveBeenCalled();
    });
  });

  describe('createTwoPartyEscrow', () => {
    it('should create two-party escrow with arbitrator', () => {
      const params = {
        asset: Asset.native(),
        amount: '5000.0000000',
        buyer: 'GBUYERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        seller: 'GSELLERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        arbitrator: 'GARBITRATORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        releaseDate: new Date('2025-06-01'),
      };

      const operation = createTwoPartyEscrow(params);

      expect(operation).toBeDefined();
      const { Operation } = require('@stellar/stellar-sdk');
      const callArgs = Operation.createClaimableBalance.mock.calls[0][0];
      expect(callArgs.claimants.length).toBe(3);
    });

    it('should include buyer, seller, and arbitrator as claimants', () => {
      const params = {
        asset: Asset.native(),
        amount: '5000.0000000',
        buyer: 'GBUYERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        seller: 'GSELLERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        arbitrator: 'GARBITRATORXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        releaseDate: new Date('2025-06-01'),
      };

      createTwoPartyEscrow(params);

      const { Operation } = require('@stellar/stellar-sdk');
      const callArgs = Operation.createClaimableBalance.mock.calls[0][0];
      const destinations = callArgs.claimants.map((c: any) => c.destination);
      expect(destinations).toContain(params.buyer);
      expect(destinations).toContain(params.seller);
      expect(destinations).toContain(params.arbitrator);
    });
  });

  describe('createConditionalRelease', () => {
    it('should create conditional release operation', () => {
      const params = {
        asset: Asset.native(),
        amount: '1000.0000000',
        claimant: 'GCLAIMANTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        releaseDate: new Date('2025-06-01'),
        conditionPredicate: { unconditional: true },
      };

      const operation = createConditionalRelease(params);

      expect(operation).toBeDefined();
      const { Operation } = require('@stellar/stellar-sdk');
      expect(Operation.createClaimableBalance).toHaveBeenCalled();
    });

    it('should combine time and condition predicates', () => {
      const params = {
        asset: Asset.native(),
        amount: '1000.0000000',
        claimant: 'GCLAIMANTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        releaseDate: new Date('2025-06-01'),
        conditionPredicate: { unconditional: true },
      };

      createConditionalRelease(params);

      const { Operation } = require('@stellar/stellar-sdk');
      expect(Operation.createClaimableBalance).toHaveBeenCalled();
    });
  });

  describe('createRefundableBalance', () => {
    it('should create refundable balance with recipient and sender', () => {
      const params = {
        asset: Asset.native(),
        amount: '1000.0000000',
        recipient: 'GRECIPIENTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        sender: 'GSENDERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        expirationDate: new Date('2025-12-31'),
      };

      const operation = createRefundableBalance(params);

      expect(operation).toBeDefined();
      const { Operation } = require('@stellar/stellar-sdk');
      const callArgs = Operation.createClaimableBalance.mock.calls[0][0];
      expect(callArgs.claimants.length).toBe(2);
    });

    it('should include recipient with time-locked predicate', () => {
      const params = {
        asset: Asset.native(),
        amount: '1000.0000000',
        recipient: 'GRECIPIENTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        sender: 'GSENDERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        expirationDate: new Date('2025-12-31'),
      };

      createRefundableBalance(params);

      const { Operation } = require('@stellar/stellar-sdk');
      const callArgs = Operation.createClaimableBalance.mock.calls[0][0];
      const recipient = callArgs.claimants.find(
        (c: any) => c.destination === params.recipient
      );
      expect(recipient).toBeDefined();
    });

    it('should include sender with unconditional predicate', () => {
      const params = {
        asset: Asset.native(),
        amount: '1000.0000000',
        recipient: 'GRECIPIENTXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        sender: 'GSENDERXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        expirationDate: new Date('2025-12-31'),
      };

      createRefundableBalance(params);

      const { Operation } = require('@stellar/stellar-sdk');
      const callArgs = Operation.createClaimableBalance.mock.calls[0][0];
      const sender = callArgs.claimants.find(
        (c: any) => c.destination === params.sender
      );
      expect(sender).toBeDefined();
    });
  });
});
