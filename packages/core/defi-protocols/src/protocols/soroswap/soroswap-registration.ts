/**
 * @fileoverview Soroswap Protocol factory registration
 * @description Registers Soroswap protocol with the protocol factory
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-30
 */

import { getProtocolFactory } from '../../services/protocol-factory';
import { SoroswapProtocol } from './soroswap-protocol';

/**
 * Register Soroswap protocol with the factory
 * @description Call this function to make Soroswap available through the protocol factory
 */
export function registerSoroswapProtocol(): void {
  const factory = getProtocolFactory();
  factory.register('soroswap', SoroswapProtocol);
}

// Auto-register when module is imported
registerSoroswapProtocol();
