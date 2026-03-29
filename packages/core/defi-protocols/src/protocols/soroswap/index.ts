/**
 * @fileoverview Soroswap Protocol exports
 * @description Exports all Soroswap protocol related functionality
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-30
 */

export { SoroswapProtocol } from './soroswap-protocol.js';
export type {
  SoroswapPairInfo,
  SoroswapRouteInfo,
  SoroswapPoolStats,
  SoroswapEvent
} from './soroswap-types.js';
export { SoroswapEventType } from './soroswap-types.js';
export { registerSoroswapProtocol } from './soroswap-registration.js';
export {
  SOROSWAP_TESTNET_CONFIG,
  SOROSWAP_MAINNET_CONFIG,
  SOROSWAP_DEFAULT_FEE,
  getSoroswapConfig
} from './soroswap-config.js';
