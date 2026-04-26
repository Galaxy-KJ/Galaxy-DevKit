/**
 * @fileoverview SDEX Protocol factory registration
 * @description Registers Stellar DEX protocol with the protocol factory
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-04-26
 */

import { getProtocolFactory } from '../../services/protocol-factory.js';
import { SdexProtocol } from './sdex-protocol.js';

/**
 * Register SDEX protocol with the factory
 * @description Call this function to make SDEX available through the protocol factory
 */
export function registerSdexProtocol(): void {
  const factory = getProtocolFactory();
  factory.register('sdex', SdexProtocol as any);
}

// Auto-register when module is imported
registerSdexProtocol();
