/**
 * @fileoverview Aquarius Protocol factory registration
 */

import { getProtocolFactory } from '../../services/protocol-factory.js';
import { AquariusProtocol } from './aquarius-protocol.js';

export function registerAquariusProtocol(): void {
  const factory = getProtocolFactory();
  factory.register('aquarius', AquariusProtocol as any);
}

// Auto-register when module is imported
registerAquariusProtocol();
