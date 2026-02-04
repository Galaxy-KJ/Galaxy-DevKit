/**
 * @fileoverview Tests for cost calculator utilities
 * @description Unit tests for cost calculation functions
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import {
  BASE_RESERVE_XLM,
  MINIMUM_ACCOUNT_BALANCE_XLM,
  calculateEntryReserve,
  calculateTotalCost,
  calculateMultipleCost,
  getDetailedBreakdown,
  calculateOnboardingCost,
  calculateMultiOperationCost,
  estimateTransactionFee,
  calculateRequiredSponsorBalance,
  xlmToStroops,
  stroopsToXlm,
  formatCost,
} from '../utils/cost-calculator.js';

describe('Cost Calculator Utilities', () => {
  describe('Constants', () => {
    it('should have correct base reserve', () => {
      expect(BASE_RESERVE_XLM).toBe('0.5');
    });

    it('should have correct minimum account balance', () => {
      expect(MINIMUM_ACCOUNT_BALANCE_XLM).toBe('1');
    });
  });

  describe('calculateEntryReserve', () => {
    it('should calculate account reserve (2 base reserves)', () => {
      const cost = calculateEntryReserve('account', 1);
      expect(cost).toBe('1.0000000');
    });

    it('should calculate trustline reserve (1 base reserve)', () => {
      const cost = calculateEntryReserve('trustline', 1);
      expect(cost).toBe('0.5000000');
    });

    it('should calculate offer reserve (1 base reserve)', () => {
      const cost = calculateEntryReserve('offer', 1);
      expect(cost).toBe('0.5000000');
    });

    it('should calculate data entry reserve (1 base reserve)', () => {
      const cost = calculateEntryReserve('data', 1);
      expect(cost).toBe('0.5000000');
    });

    it('should calculate signer reserve (1 base reserve)', () => {
      const cost = calculateEntryReserve('signer', 1);
      expect(cost).toBe('0.5000000');
    });

    it('should calculate claimable balance reserve (1 base reserve)', () => {
      const cost = calculateEntryReserve('claimable_balance', 1);
      expect(cost).toBe('0.5000000');
    });

    it('should multiply by count', () => {
      const cost = calculateEntryReserve('trustline', 5);
      expect(cost).toBe('2.5000000');
    });
  });

  describe('calculateTotalCost', () => {
    it('should calculate total cost for single config', () => {
      const config = {
        sponsorPublicKey: 'GSPONSOR',
        sponsoredPublicKey: 'GSPONSORED',
        entryType: 'trustline' as const,
      };
      const cost = calculateTotalCost(config);
      expect(cost).toBe('0.5000000');
    });
  });

  describe('calculateMultipleCost', () => {
    it('should calculate total for multiple configs', () => {
      const configs = [
        { sponsorPublicKey: 'G1', sponsoredPublicKey: 'G2', entryType: 'account' as const },
        { sponsorPublicKey: 'G1', sponsoredPublicKey: 'G2', entryType: 'trustline' as const },
        { sponsorPublicKey: 'G1', sponsoredPublicKey: 'G2', entryType: 'trustline' as const },
      ];
      const cost = calculateMultipleCost(configs);
      // 1.0 (account) + 0.5 (trustline) + 0.5 (trustline) = 2.0
      expect(cost).toBe('2.0000000');
    });
  });

  describe('getDetailedBreakdown', () => {
    it('should provide detailed breakdown for multiple entry types', () => {
      const entryTypes = [
        { type: 'account' as const, count: 1 },
        { type: 'trustline' as const, count: 3 },
        { type: 'data' as const, count: 2 },
      ];

      const breakdown = getDetailedBreakdown(entryTypes);

      // Account: 1.0 + Trustlines: 1.5 + Data: 1.0 = 3.5
      expect(breakdown.totalCost).toBe('3.5000000');
      expect(breakdown.baseReserve).toBe('0.5');
      expect(breakdown.entryCount).toBe(6);
      expect(breakdown.breakdown.length).toBe(3);

      // Check individual breakdowns
      const accountBreakdown = breakdown.breakdown.find(b => b.type === 'account');
      expect(accountBreakdown?.cost).toBe('1.0000000');
      expect(accountBreakdown?.count).toBe(1);

      const trustlineBreakdown = breakdown.breakdown.find(b => b.type === 'trustline');
      expect(trustlineBreakdown?.cost).toBe('1.5000000');
      expect(trustlineBreakdown?.count).toBe(3);
    });

    it('should include transaction fee estimate', () => {
      const entryTypes = [{ type: 'trustline' as const, count: 1 }];
      const breakdown = getDetailedBreakdown(entryTypes);

      expect(breakdown.transactionFee).toBeDefined();
      expect(parseFloat(breakdown.transactionFee)).toBeGreaterThan(0);
    });
  });

  describe('calculateOnboardingCost', () => {
    it('should calculate cost for basic onboarding', () => {
      const config = {
        sponsorPublicKey: 'GSPONSOR',
        newUserPublicKey: 'GNEWUSER',
      };

      const cost = calculateOnboardingCost(config);

      // Just account creation
      expect(cost.totalCost).toBe('1.0000000');
    });

    it('should include trustlines in calculation', () => {
      const config = {
        sponsorPublicKey: 'GSPONSOR',
        newUserPublicKey: 'GNEWUSER',
        trustlines: [
          { assetCode: 'USDC', assetIssuer: 'GISSUER' },
          { assetCode: 'BTC', assetIssuer: 'GISSUER' },
        ],
      };

      const cost = calculateOnboardingCost(config);

      // Account: 1.0 + 2 trustlines: 1.0 = 2.0
      expect(cost.totalCost).toBe('2.0000000');
    });

    it('should include data entries in calculation', () => {
      const config = {
        sponsorPublicKey: 'GSPONSOR',
        newUserPublicKey: 'GNEWUSER',
        dataEntries: [
          { name: 'key1', value: 'value1' },
          { name: 'key2', value: 'value2' },
        ],
      };

      const cost = calculateOnboardingCost(config);

      // Account: 1.0 + 2 data entries: 1.0 = 2.0
      expect(cost.totalCost).toBe('2.0000000');
    });

    it('should calculate full onboarding cost', () => {
      const config = {
        sponsorPublicKey: 'GSPONSOR',
        newUserPublicKey: 'GNEWUSER',
        trustlines: [
          { assetCode: 'USDC', assetIssuer: 'GISSUER' },
        ],
        dataEntries: [
          { name: 'onboarded', value: 'true' },
        ],
      };

      const cost = calculateOnboardingCost(config);

      // Account: 1.0 + 1 trustline: 0.5 + 1 data: 0.5 = 2.0
      expect(cost.totalCost).toBe('2.0000000');
    });
  });

  describe('calculateMultiOperationCost', () => {
    it('should calculate cost for multiple operations', () => {
      const config = {
        sponsorPublicKey: 'GSPONSOR',
        sponsoredPublicKey: 'GSPONSORED',
        operations: [
          { type: 'changeTrust' as const, params: {} },
          { type: 'changeTrust' as const, params: {} },
          { type: 'manageData' as const, params: {} },
        ],
      };

      const cost = calculateMultiOperationCost(config);

      // 2 trustlines: 1.0 + 1 data: 0.5 = 1.5
      expect(cost.totalCost).toBe('1.5000000');
    });

    it('should handle signer operations', () => {
      const config = {
        sponsorPublicKey: 'GSPONSOR',
        sponsoredPublicKey: 'GSPONSORED',
        operations: [
          { type: 'setOptions' as const, params: { signer: { key: 'G', weight: 1 } } },
        ],
      };

      const cost = calculateMultiOperationCost(config);

      expect(cost.totalCost).toBe('0.5000000');
    });
  });

  describe('estimateTransactionFee', () => {
    it('should estimate fee for single operation', () => {
      const fee = estimateTransactionFee(1);
      expect(fee).toBe('0.0000100');
    });

    it('should estimate fee for multiple operations', () => {
      const fee = estimateTransactionFee(10);
      expect(fee).toBe('0.0001000');
    });

    it('should use custom base fee', () => {
      const fee = estimateTransactionFee(1, 200);
      expect(fee).toBe('0.0000200');
    });
  });

  describe('calculateRequiredSponsorBalance', () => {
    it('should include buffer in required balance', () => {
      const entryTypes = [{ type: 'trustline' as const, count: 1 }];
      const required = calculateRequiredSponsorBalance(entryTypes, '1');

      // 0.5 (cost) + fee + 1 (buffer) > 1.5
      expect(parseFloat(required)).toBeGreaterThan(1.5);
    });

    it('should handle custom buffer', () => {
      const entryTypes = [{ type: 'trustline' as const, count: 1 }];
      const required = calculateRequiredSponsorBalance(entryTypes, '5');

      // 0.5 (cost) + fee + 5 (buffer) > 5.5
      expect(parseFloat(required)).toBeGreaterThan(5.5);
    });
  });

  describe('xlmToStroops', () => {
    it('should convert XLM to stroops', () => {
      expect(xlmToStroops('1')).toBe(10000000);
      expect(xlmToStroops('0.0000001')).toBe(1);
      expect(xlmToStroops('100.5')).toBe(1005000000);
    });
  });

  describe('stroopsToXlm', () => {
    it('should convert stroops to XLM', () => {
      expect(stroopsToXlm(10000000)).toBe('1.0000000');
      expect(stroopsToXlm(1)).toBe('0.0000001');
      expect(stroopsToXlm(1005000000)).toBe('100.5000000');
    });
  });

  describe('formatCost', () => {
    it('should format cost with default decimals', () => {
      expect(formatCost('1.5')).toBe('1.5000000');
    });

    it('should format cost with custom decimals', () => {
      expect(formatCost('1.5', 2)).toBe('1.50');
    });

    it('should handle invalid input', () => {
      expect(formatCost('invalid')).toBe('0');
    });
  });
});
