/**
 * @fileoverview Invisible Wallet System Entry Point
 * @description Main export file for the invisible wallet system
 * @author @ryzen_xp
 * @version 1.0.0
 * @since 2024-12-01
 */

export { InvisibleWalletService } from './src/services/invisible-wallet.service.js';
export { KeyManagementService } from './src/services/key-managment.service.js';
export * from './src/types/wallet.types.js';
export * from './src/types/smart-wallet.types.js';
export * from './src/utils/encryption.utils.js';

// Backup module exports
export * from './src/backup/index.js';

// Re-export commonly used utilities
export { NetworkUtils } from '../stellar-sdk/src/utils/network-utils.js';

/**
 * Default configuration for invisible wallet
 */
export const DEFAULT_CONFIG = {
  keyDerivationIterations: 100000,
  passwordMinLength: 8,
  sessionTimeout: 3600000,
  autoLockEnabled: true,
  biometricEnabled: false,
};

/**
 * Initialize invisible wallet system
 * @param config - Optional configuration overrides
 */
export function initializeInvisibleWallet(
  config?: Partial<typeof DEFAULT_CONFIG>
) {
  return {
    ...DEFAULT_CONFIG,
    ...config,
  };
}
