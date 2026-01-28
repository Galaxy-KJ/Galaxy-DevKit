/**
 * Hardware wallet types and interfaces for Ledger integration
 */

export type TransportType = 'usb' | 'bluetooth';

/**
 * Ledger device configuration
 */
export interface LedgerConfig {
  /** Transport type - USB or Bluetooth */
  transport: TransportType;
  /** BIP44 derivation path (default: m/44'/148'/0') */
  derivationPath?: string;
  /** Connection timeout in milliseconds */
  timeout?: number;
  /** Enable auto-reconnect on disconnect */
  autoReconnect?: boolean;
  /** Maximum reconnection attempts */
  maxReconnectAttempts?: number;
}

/**
 * Ledger device information
 */
export interface LedgerDeviceInfo {
  /** Device model name */
  model: string;
  /** Firmware version */
  firmwareVersion: string;
  /** Stellar app version */
  appVersion?: string;
  /** Whether Stellar app is open */
  isStellarAppOpen: boolean;
  /** Device serial number */
  serialNumber?: string;
}

/**
 * Ledger connection status
 */
export interface LedgerConnectionStatus {
  /** Whether device is connected */
  connected: boolean;
  /** Device information */
  deviceInfo?: LedgerDeviceInfo;
  /** Error message if connection failed */
  error?: string;
  /** Last connection timestamp */
  lastConnectedAt?: Date;
}

/**
 * Ledger account information
 */
export interface LedgerAccount {
  /** Account public key */
  publicKey: string;
  /** Derivation path */
  derivationPath: string;
  /** Account index */
  index: number;
  /** Account balance (if fetched) */
  balance?: string;
}

/**
 * Ledger signature result
 */
export interface LedgerSignatureResult {
  /** Signature bytes */
  signature: Buffer;
  /** Public key used for signing */
  publicKey: string;
  /** Transaction hash (if available) */
  hash?: string;
}

/**
 * Ledger error codes
 */
export enum LedgerErrorCode {
  /** Device not connected */
  DEVICE_NOT_CONNECTED = 'DEVICE_NOT_CONNECTED',
  /** Stellar app not open */
  APP_NOT_OPEN = 'APP_NOT_OPEN',
  /** User rejected on device */
  USER_REJECTED = 'USER_REJECTED',
  /** Invalid derivation path */
  INVALID_DERIVATION_PATH = 'INVALID_DERIVATION_PATH',
  /** Connection timeout */
  CONNECTION_TIMEOUT = 'CONNECTION_TIMEOUT',
  /** Transport error */
  TRANSPORT_ERROR = 'TRANSPORT_ERROR',
  /** Device locked */
  DEVICE_LOCKED = 'DEVICE_LOCKED',
  /** Firmware version not supported */
  UNSUPPORTED_FIRMWARE = 'UNSUPPORTED_FIRMWARE',
  /** Invalid transaction */
  INVALID_TRANSACTION = 'INVALID_TRANSACTION',
  /** Unknown error */
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Ledger error class
 */
export class LedgerError extends Error {
  constructor(
    public code: LedgerErrorCode,
    message: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'LedgerError';
    Object.setPrototypeOf(this, LedgerError.prototype);
  }
}

/**
 * BIP44 derivation path constants for Stellar
 */
export const STELLAR_BIP44_PATH = "44'/148'/0'";
export const STELLAR_COIN_TYPE = 148;

/**
 * Parse BIP44 derivation path
 */
export function parseBIP44Path(path: string): {
  purpose: number;
  coinType: number;
  account: number;
} {
  const parts = path.split('/').filter((p) => p !== 'm');
  if (parts.length < 3) {
    throw new LedgerError(
      LedgerErrorCode.INVALID_DERIVATION_PATH,
      `Invalid BIP44 path: ${path}`
    );
  }

  return {
    purpose: parseInt(parts[0].replace("'", ''), 10),
    coinType: parseInt(parts[1].replace("'", ''), 10),
    account: parseInt(parts[2].replace("'", ''), 10),
  };
}

/**
 * Build BIP44 derivation path for Stellar
 */
export function buildStellarPath(accountIndex: number = 0): string {
  return `44'/148'/${accountIndex}'`;
}

/**
 * Validate BIP44 derivation path for Stellar
 */
export function validateStellarPath(path: string): boolean {
  try {
    const parsed = parseBIP44Path(path);
    return parsed.purpose === 44 && parsed.coinType === STELLAR_COIN_TYPE;
  } catch {
    return false;
  }
}
