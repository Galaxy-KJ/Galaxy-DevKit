/**
 * Hardware Wallet Integration
 * Export all hardware wallet related modules
 */

export { LedgerWallet, detectLedgerDevices, isLedgerSupported } from './LedgerWallet';
export {
  type LedgerConfig,
  type LedgerDeviceInfo,
  type LedgerConnectionStatus,
  type LedgerAccount,
  type LedgerSignatureResult,
  type TransportType,
  LedgerError,
  LedgerErrorCode,
  STELLAR_BIP44_PATH,
  STELLAR_COIN_TYPE,
  parseBIP44Path,
  buildStellarPath,
  validateStellarPath,
} from './types';
export {
  parseLedgerError,
  getErrorMessage,
  isRecoverableError,
  requiresUserAction,
  getSuggestedAction,
} from './ledger-errors';
