/**
 * @fileoverview Blend Protocol factory registration
 * @description Registers Blend protocol with the protocol factory
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-29
 */

import { getProtocolFactory } from '../../services/protocol-factory';
import { BlendProtocol } from './blend-protocol';

/**
 * Register Blend protocol with the factory
 * @description Call this function to make Blend available through the protocol factory
 */
export function registerBlendProtocol(): void {
  const factory = getProtocolFactory();
  factory.register('blend', BlendProtocol);
}

// Auto-register when module is imported
registerBlendProtocol();
