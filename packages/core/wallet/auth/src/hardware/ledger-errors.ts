/**
 * Ledger error handling utilities
 */

import { LedgerError, LedgerErrorCode } from './types';

/**
 * Known Ledger error codes from @ledgerhq packages
 */
const LEDGER_ERROR_CODES: Record<number, LedgerErrorCode> = {
  0x6985: LedgerErrorCode.USER_REJECTED,
  0x6d00: LedgerErrorCode.APP_NOT_OPEN,
  0x6e00: LedgerErrorCode.DEVICE_LOCKED,
  0x6f00: LedgerErrorCode.INVALID_TRANSACTION,
  0x6f01: LedgerErrorCode.INVALID_DERIVATION_PATH,
};

/**
 * User-friendly error messages
 */
const ERROR_MESSAGES: Record<LedgerErrorCode, string> = {
  [LedgerErrorCode.DEVICE_NOT_CONNECTED]:
    'Ledger device not connected. Please connect your device.',
  [LedgerErrorCode.APP_NOT_OPEN]:
    'Stellar app not open. Please open the Stellar app on your Ledger device.',
  [LedgerErrorCode.USER_REJECTED]:
    'Transaction rejected on device. Please approve the transaction on your Ledger.',
  [LedgerErrorCode.INVALID_DERIVATION_PATH]:
    'Invalid derivation path. Please use a valid BIP44 path for Stellar.',
  [LedgerErrorCode.CONNECTION_TIMEOUT]:
    'Connection timeout. Please check your device connection.',
  [LedgerErrorCode.TRANSPORT_ERROR]:
    'Transport error. Please reconnect your Ledger device.',
  [LedgerErrorCode.DEVICE_LOCKED]:
    'Device is locked. Please unlock your Ledger device.',
  [LedgerErrorCode.UNSUPPORTED_FIRMWARE]:
    'Firmware version not supported. Please update your Ledger firmware.',
  [LedgerErrorCode.INVALID_TRANSACTION]:
    'Invalid transaction data. Please check the transaction parameters.',
  [LedgerErrorCode.UNKNOWN_ERROR]:
    'An unknown error occurred. Please try again.',
};

/**
 * Parse Ledger error and convert to LedgerError
 */
export function parseLedgerError(error: any): LedgerError {
  // Check if already a LedgerError
  if (error instanceof LedgerError) {
    return error;
  }

  // Extract error code from various error formats
  let errorCode: LedgerErrorCode = LedgerErrorCode.UNKNOWN_ERROR;
  let message = 'Unknown error';

  // Handle Ledger transport errors
  if (error.name === 'TransportError' || error.message?.includes('Transport')) {
    errorCode = LedgerErrorCode.TRANSPORT_ERROR;
  }
  // Handle status codes
  else if (error.statusCode) {
    errorCode = LEDGER_ERROR_CODES[error.statusCode] || LedgerErrorCode.UNKNOWN_ERROR;
  }
  // Handle error messages
  else if (error.message) {
    const msg = error.message.toLowerCase();
    if (msg.includes('not connected') || msg.includes('no device')) {
      errorCode = LedgerErrorCode.DEVICE_NOT_CONNECTED;
    } else if (msg.includes('timeout')) {
      errorCode = LedgerErrorCode.CONNECTION_TIMEOUT;
    } else if (msg.includes('rejected') || msg.includes('denied')) {
      errorCode = LedgerErrorCode.USER_REJECTED;
    } else if (msg.includes('locked')) {
      errorCode = LedgerErrorCode.DEVICE_LOCKED;
    } else if (msg.includes('app') && msg.includes('not')) {
      errorCode = LedgerErrorCode.APP_NOT_OPEN;
    }
  }

  message = ERROR_MESSAGES[errorCode] || error.message || message;

  return new LedgerError(errorCode, message, error);
}

/**
 * Get user-friendly error message for error code
 */
export function getErrorMessage(code: LedgerErrorCode): string {
  return ERROR_MESSAGES[code] || ERROR_MESSAGES[LedgerErrorCode.UNKNOWN_ERROR];
}

/**
 * Check if error is recoverable (can retry)
 */
export function isRecoverableError(error: LedgerError): boolean {
  const recoverableErrors = [
    LedgerErrorCode.CONNECTION_TIMEOUT,
    LedgerErrorCode.TRANSPORT_ERROR,
    LedgerErrorCode.DEVICE_NOT_CONNECTED,
  ];
  return recoverableErrors.includes(error.code);
}

/**
 * Check if error requires user action
 */
export function requiresUserAction(error: LedgerError): boolean {
  const userActionErrors = [
    LedgerErrorCode.APP_NOT_OPEN,
    LedgerErrorCode.DEVICE_LOCKED,
    LedgerErrorCode.USER_REJECTED,
    LedgerErrorCode.DEVICE_NOT_CONNECTED,
  ];
  return userActionErrors.includes(error.code);
}

/**
 * Get suggested action for error
 */
export function getSuggestedAction(error: LedgerError): string {
  switch (error.code) {
    case LedgerErrorCode.DEVICE_NOT_CONNECTED:
      return 'Please connect your Ledger device via USB or Bluetooth.';
    case LedgerErrorCode.APP_NOT_OPEN:
      return 'Navigate to and open the Stellar app on your Ledger device.';
    case LedgerErrorCode.USER_REJECTED:
      return 'Review the transaction details on your device and approve if correct.';
    case LedgerErrorCode.DEVICE_LOCKED:
      return 'Enter your PIN on the Ledger device to unlock it.';
    case LedgerErrorCode.CONNECTION_TIMEOUT:
      return 'Check USB/Bluetooth connection and try again.';
    case LedgerErrorCode.TRANSPORT_ERROR:
      return 'Disconnect and reconnect your Ledger device.';
    case LedgerErrorCode.UNSUPPORTED_FIRMWARE:
      return 'Update your Ledger firmware using Ledger Live.';
    case LedgerErrorCode.INVALID_DERIVATION_PATH:
      return 'Use a valid BIP44 derivation path (e.g., 44\'/148\'/0\').';
    case LedgerErrorCode.INVALID_TRANSACTION:
      return 'Check transaction parameters and try again.';
    default:
      return 'Please try again or contact support if the problem persists.';
  }
}
