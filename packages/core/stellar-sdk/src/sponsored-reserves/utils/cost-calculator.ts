/**
 * @fileoverview Cost calculation utilities for sponsored reserves
 * @description Contains functions for calculating sponsorship costs
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import {
  SponsorshipConfig,
  SponsorshipCost,
  CostBreakdownItem,
  SponsoredEntryType,
  UserOnboardingConfig,
  MultiOperationSponsorshipConfig,
} from '../types/sponsored-reserves-types';

/**
 * Current Stellar base reserve in XLM
 * As of 2024, this is 0.5 XLM per entry
 */
export const BASE_RESERVE_XLM = '0.5';

/**
 * Minimum account balance (2 * base reserve)
 */
export const MINIMUM_ACCOUNT_BALANCE_XLM = '1';

/**
 * Default transaction fee in stroops
 */
export const DEFAULT_FEE_STROOPS = 100;

/**
 * Calculates the reserve cost for a specific entry type
 * @param entryType - Type of ledger entry
 * @param count - Number of entries (default 1)
 * @returns Cost in XLM as string
 */
export function calculateEntryReserve(
  entryType: SponsoredEntryType,
  count: number = 1
): string {
  const baseReserve = parseFloat(BASE_RESERVE_XLM);
  let multiplier = 1;

  switch (entryType) {
    case 'account':
      // Account requires 2 base reserves minimum
      multiplier = 2;
      break;
    case 'trustline':
    case 'offer':
    case 'data':
    case 'signer':
      // These each require 1 base reserve
      multiplier = 1;
      break;
    case 'claimable_balance':
      // Claimable balance requires 1 base reserve
      multiplier = 1;
      break;
    default:
      multiplier = 1;
  }

  const total = baseReserve * multiplier * count;
  return total.toFixed(7);
}

/**
 * Gets a human-readable description for an entry type cost
 * @param entryType - Type of ledger entry
 * @returns Description string
 */
function getEntryDescription(entryType: SponsoredEntryType): string {
  switch (entryType) {
    case 'account':
      return 'Account creation (2 base reserves)';
    case 'trustline':
      return 'Trustline (1 base reserve)';
    case 'offer':
      return 'Offer (1 base reserve)';
    case 'data':
      return 'Data entry (1 base reserve)';
    case 'signer':
      return 'Additional signer (1 base reserve)';
    case 'claimable_balance':
      return 'Claimable balance (1 base reserve)';
    default:
      return 'Unknown entry type';
  }
}

/**
 * Calculates the total cost for a sponsorship configuration
 * @param config - Sponsorship configuration
 * @returns Total cost in XLM as string
 */
export function calculateTotalCost(config: SponsorshipConfig): string {
  return calculateEntryReserve(config.entryType, 1);
}

/**
 * Calculates total cost for multiple sponsorship configurations
 * @param configs - Array of sponsorship configurations
 * @returns Total cost in XLM as string
 */
export function calculateMultipleCost(configs: SponsorshipConfig[]): string {
  let total = 0;

  for (const config of configs) {
    total += parseFloat(calculateEntryReserve(config.entryType, 1));
  }

  return total.toFixed(7);
}

/**
 * Gets a detailed cost breakdown for sponsorship operations
 * @param entryTypes - Array of entry types with counts
 * @returns Detailed cost breakdown
 */
export function getDetailedBreakdown(
  entryTypes: Array<{ type: SponsoredEntryType; count: number }>
): SponsorshipCost {
  const breakdown: CostBreakdownItem[] = [];
  let totalEntries = 0;
  let totalCost = 0;

  for (const entry of entryTypes) {
    const cost = parseFloat(calculateEntryReserve(entry.type, entry.count));
    totalCost += cost;
    totalEntries += entry.count;

    breakdown.push({
      type: entry.type,
      count: entry.count,
      cost: cost.toFixed(7),
      description: getEntryDescription(entry.type),
    });
  }

  // Estimate transaction fee (assuming default fee per operation)
  // Each sponsorship requires 3 operations: begin, operation, end
  const estimatedOperations = totalEntries * 3;
  const transactionFee = ((DEFAULT_FEE_STROOPS * estimatedOperations) / 10000000).toFixed(7);

  return {
    totalCost: totalCost.toFixed(7),
    baseReserve: BASE_RESERVE_XLM,
    entryCount: totalEntries,
    breakdown,
    transactionFee,
  };
}

/**
 * Calculates cost for user onboarding configuration
 * @param config - User onboarding configuration
 * @returns Sponsorship cost breakdown
 */
export function calculateOnboardingCost(config: UserOnboardingConfig): SponsorshipCost {
  const entryTypes: Array<{ type: SponsoredEntryType; count: number }> = [];

  // Account creation
  entryTypes.push({ type: 'account', count: 1 });

  // Trustlines
  if (config.trustlines && config.trustlines.length > 0) {
    entryTypes.push({ type: 'trustline', count: config.trustlines.length });
  }

  // Data entries
  if (config.dataEntries && config.dataEntries.length > 0) {
    entryTypes.push({ type: 'data', count: config.dataEntries.length });
  }

  return getDetailedBreakdown(entryTypes);
}

/**
 * Calculates cost for multi-operation sponsorship configuration
 * @param config - Multi-operation configuration
 * @returns Sponsorship cost breakdown
 */
export function calculateMultiOperationCost(
  config: MultiOperationSponsorshipConfig
): SponsorshipCost {
  const entryTypes: Array<{ type: SponsoredEntryType; count: number }> = [];
  const typeCounts: Map<SponsoredEntryType, number> = new Map();

  for (const op of config.operations) {
    let entryType: SponsoredEntryType;

    switch (op.type) {
      case 'createAccount':
        entryType = 'account';
        break;
      case 'changeTrust':
        entryType = 'trustline';
        break;
      case 'manageData':
        entryType = 'data';
        break;
      case 'setOptions':
        // setOptions with signer adds a signer entry
        if (op.params.signer) {
          entryType = 'signer';
        } else {
          continue; // Other setOptions don't add entries
        }
        break;
      default:
        continue;
    }

    const currentCount = typeCounts.get(entryType) || 0;
    typeCounts.set(entryType, currentCount + 1);
  }

  for (const [type, count] of typeCounts) {
    entryTypes.push({ type, count });
  }

  return getDetailedBreakdown(entryTypes);
}

/**
 * Estimates transaction fee based on number of operations
 * @param operationCount - Number of operations in the transaction
 * @param baseFee - Base fee per operation in stroops (default 100)
 * @returns Estimated fee in XLM as string
 */
export function estimateTransactionFee(
  operationCount: number,
  baseFee: number = DEFAULT_FEE_STROOPS
): string {
  const feeStroops = baseFee * operationCount;
  return (feeStroops / 10000000).toFixed(7);
}

/**
 * Calculates the minimum balance required for a sponsor
 * @param entryTypes - Array of entry types with counts
 * @param buffer - Additional buffer in XLM (default 1)
 * @returns Required balance in XLM as string
 */
export function calculateRequiredSponsorBalance(
  entryTypes: Array<{ type: SponsoredEntryType; count: number }>,
  buffer: string = '1'
): string {
  const breakdown = getDetailedBreakdown(entryTypes);
  const total =
    parseFloat(breakdown.totalCost) +
    parseFloat(breakdown.transactionFee) +
    parseFloat(buffer);

  return total.toFixed(7);
}

/**
 * Converts XLM to stroops
 * @param xlm - Amount in XLM
 * @returns Amount in stroops
 */
export function xlmToStroops(xlm: string): number {
  return Math.floor(parseFloat(xlm) * 10000000);
}

/**
 * Converts stroops to XLM
 * @param stroops - Amount in stroops
 * @returns Amount in XLM as string
 */
export function stroopsToXlm(stroops: number): string {
  return (stroops / 10000000).toFixed(7);
}

/**
 * Formats a cost amount for display
 * @param amount - Amount in XLM
 * @param decimals - Number of decimal places (default 7)
 * @returns Formatted string
 */
export function formatCost(amount: string, decimals: number = 7): string {
  const num = parseFloat(amount);
  if (isNaN(num)) {
    return '0';
  }
  return num.toFixed(decimals);
}
