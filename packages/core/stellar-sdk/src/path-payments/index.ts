/**
 * @fileoverview Path payments module exports
 * @description Path finding, swap execution, slippage protection
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

export { PathPaymentManager } from './path-payment-manager';
export type {
  PaymentPath,
  SwapParams,
  SwapResult,
  SwapEstimate,
  SwapType,
  StrictSendPathParams,
  StrictReceivePathParams,
  SlippageProtection,
  SwapAnalyticsRecord,
  PathAnalytics,
  PathCacheEntry,
} from './types';
export { HIGH_PRICE_IMPACT_THRESHOLD } from './types';
