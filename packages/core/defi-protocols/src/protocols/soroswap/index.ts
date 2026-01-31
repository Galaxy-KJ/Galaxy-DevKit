/**
 * @fileoverview Soroswap Protocol exports
 * @description Exports all Soroswap protocol related functionality
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-30
 */

export { SoroswapProtocol } from './soroswap-protocol';
export type {
  SoroswapPairInfo,
  SoroswapRouteInfo,
  SoroswapPoolStats,
  SoroswapEvent
} from './soroswap-types';
export { SoroswapEventType } from './soroswap-types';
export { registerSoroswapProtocol } from './soroswap-registration';
export {
  SOROSWAP_TESTNET_CONFIG,
  SOROSWAP_MAINNET_CONFIG,
  SOROSWAP_DEFAULT_FEE,
  getSoroswapConfig
} from './soroswap-config';
