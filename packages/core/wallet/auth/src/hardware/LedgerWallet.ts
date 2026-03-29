// @ts-nocheck
/**
 * Ledger Wallet Integration for Stellar
 * Provides secure key management and transaction signing using Ledger hardware wallets
 */

import { EventEmitter } from 'events';
import Transport from '@ledgerhq/hw-transport';
import TransportWebUSB from '@ledgerhq/hw-transport-webusb';
import TransportNodeHid from '@ledgerhq/hw-transport-node-hid';
import Str from '@ledgerhq/hw-app-str';
import {
  LedgerConfig,
  LedgerDeviceInfo,
  LedgerConnectionStatus,
  LedgerAccount,
  LedgerSignatureResult,
  LedgerError,
  LedgerErrorCode,
  TransportType,
  STELLAR_BIP44_PATH,
  buildStellarPath,
  validateStellarPath,
} from './types';
import { parseLedgerError, isRecoverableError } from './ledger-errors';

/**
 * Default Ledger configuration
 */
const DEFAULT_CONFIG: LedgerConfig = {
  transport: 'usb',
  derivationPath: STELLAR_BIP44_PATH,
  timeout: 30000, // 30 seconds
  autoReconnect: true,
  maxReconnectAttempts: 3,
};

/**
 * Ledger Wallet class for Stellar
 * Manages connection, signing, and account management with Ledger devices
 */
export class LedgerWallet extends EventEmitter {
  private config: LedgerConfig;
  private transport: Transport | null = null;
  private stellarApp: Str | null = null;
  private connectionStatus: LedgerConnectionStatus;
  private reconnectAttempts: number = 0;
  private accountCache: Map<string, LedgerAccount> = new Map();

  constructor(config: Partial<LedgerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.connectionStatus = { connected: false };
  }

  /**
   * Connect to Ledger device
   */
  async connect(): Promise<void> {
    try {
      this.emit('connecting');

      // Create transport based on configuration
      this.transport = await this.createTransport();

      // Set timeout
      this.transport.setExchangeTimeout(this.config.timeout || 30000);

      // Initialize Stellar app
      this.stellarApp = new Str(this.transport);

      // Get device info
      const deviceInfo = await this.getDeviceInfo();

      this.connectionStatus = {
        connected: true,
        deviceInfo,
        lastConnectedAt: new Date(),
      };

      this.reconnectAttempts = 0;

      this.emit('connected', deviceInfo);

      // Set up disconnect handler
      this.transport.on('disconnect', () => {
        this.handleDisconnect();
      });
    } catch (error: any) {
      const ledgerError = parseLedgerError(error);
      this.connectionStatus = {
        connected: false,
        error: ledgerError.message,
      };
      this.emit('error', ledgerError);
      throw ledgerError;
    }
  }

  /**
   * Disconnect from Ledger device
   */
  async disconnect(): Promise<void> {
    try {
      if (this.transport) {
        await this.transport.close();
        this.transport = null;
        this.stellarApp = null;
      }

      this.connectionStatus = { connected: false };
      this.emit('disconnected');
    } catch (error: any) {
      const ledgerError = parseLedgerError(error);
      this.emit('error', ledgerError);
      throw ledgerError;
    }
  }

  /**
   * Get device information
   */
  async getDeviceInfo(): Promise<LedgerDeviceInfo> {
    this.ensureConnected();

    try {
      // Get app configuration
      const appConfig = await this.stellarApp!.getAppConfiguration();

      return {
        model: 'Ledger Device', // Transport doesn't expose model info directly
        firmwareVersion: appConfig.version || 'Unknown',
        appVersion: appConfig.version,
        isStellarAppOpen: true,
      };
    } catch (error: any) {
      const ledgerError = parseLedgerError(error);

      // If app not open, return partial info
      if (ledgerError.code === LedgerErrorCode.APP_NOT_OPEN) {
        return {
          model: 'Ledger Device',
          firmwareVersion: 'Unknown',
          isStellarAppOpen: false,
        };
      }

      throw ledgerError;
    }
  }

  /**
   * Get Stellar public key from device
   * @param derivationPath - BIP44 derivation path
   * @param displayOnDevice - Whether to display address on device for verification
   */
  async getPublicKey(
    derivationPath: string = STELLAR_BIP44_PATH,
    displayOnDevice: boolean = false
  ): Promise<string> {
    this.ensureConnected();

    if (!validateStellarPath(derivationPath)) {
      throw new LedgerError(
        LedgerErrorCode.INVALID_DERIVATION_PATH,
        `Invalid Stellar derivation path: ${derivationPath}`
      );
    }

    try {
      this.emit('prompt-user', {
        action: 'verify-address',
        message: displayOnDevice
          ? 'Please verify the address on your device'
          : 'Retrieving public key...',
      });

      const result = await this.stellarApp!.getPublicKey(
        derivationPath,
        displayOnDevice,
        false // Don't return chain code
      );

      this.emit('public-key-retrieved', {
        publicKey: result.publicKey,
        derivationPath,
      });

      return result.publicKey;
    } catch (error: any) {
      const ledgerError = parseLedgerError(error);
      this.emit('error', ledgerError);
      throw ledgerError;
    }
  }

  /**
   * Get multiple account public keys
   * @param startIndex - Starting account index
   * @param count - Number of accounts to retrieve
   */
  async getAccounts(
    startIndex: number = 0,
    count: number = 5
  ): Promise<LedgerAccount[]> {
    this.ensureConnected();

    const accounts: LedgerAccount[] = [];

    for (let i = 0; i < count; i++) {
      const accountIndex = startIndex + i;
      const derivationPath = buildStellarPath(accountIndex);

      try {
        const publicKey = await this.getPublicKey(derivationPath, false);

        const account: LedgerAccount = {
          publicKey,
          derivationPath,
          index: accountIndex,
        };

        accounts.push(account);
        this.accountCache.set(derivationPath, account);
      } catch (error: any) {
        const ledgerError = parseLedgerError(error);
        this.emit('error', ledgerError);
        // Continue with next account instead of failing entirely
        console.warn(`Failed to get account ${accountIndex}:`, ledgerError.message);
      }
    }

    this.emit('accounts-retrieved', accounts);
    return accounts;
  }

  /**
   * Sign a transaction hash
   * @param transactionHash - Transaction hash to sign (Buffer)
   * @param derivationPath - BIP44 derivation path
   */
  async signTransaction(
    transactionHash: Buffer,
    derivationPath: string = STELLAR_BIP44_PATH
  ): Promise<LedgerSignatureResult> {
    this.ensureConnected();

    if (!validateStellarPath(derivationPath)) {
      throw new LedgerError(
        LedgerErrorCode.INVALID_DERIVATION_PATH,
        `Invalid Stellar derivation path: ${derivationPath}`
      );
    }

    try {
      this.emit('prompt-user', {
        action: 'sign-transaction',
        message: 'Please review and confirm the transaction on your device',
      });

      const signature = await this.stellarApp!.signTransaction(
        derivationPath,
        transactionHash
      );

      const publicKey = await this.getPublicKey(derivationPath, false);

      const result: LedgerSignatureResult = {
        signature,
        publicKey,
        hash: transactionHash.toString('hex'),
      };

      this.emit('transaction-signed', result);
      return result;
    } catch (error: any) {
      const ledgerError = parseLedgerError(error);
      this.emit('error', ledgerError);
      throw ledgerError;
    }
  }

  /**
   * Sign an arbitrary hash (for message signing)
   * @param hash - Hash to sign
   * @param derivationPath - BIP44 derivation path
   */
  async signHash(
    hash: Buffer,
    derivationPath: string = STELLAR_BIP44_PATH
  ): Promise<LedgerSignatureResult> {
    this.ensureConnected();

    if (!validateStellarPath(derivationPath)) {
      throw new LedgerError(
        LedgerErrorCode.INVALID_DERIVATION_PATH,
        `Invalid Stellar derivation path: ${derivationPath}`
      );
    }

    try {
      this.emit('prompt-user', {
        action: 'sign-hash',
        message: 'Please confirm the signature on your device',
      });

      const signature = await this.stellarApp!.signHash(derivationPath, hash);

      const publicKey = await this.getPublicKey(derivationPath, false);

      const result: LedgerSignatureResult = {
        signature,
        publicKey,
        hash: hash.toString('hex'),
      };

      this.emit('hash-signed', result);
      return result;
    } catch (error: any) {
      const ledgerError = parseLedgerError(error);
      this.emit('error', ledgerError);
      throw ledgerError;
    }
  }

  /**
   * Display address on Ledger device
   * @param derivationPath - BIP44 derivation path
   */
  async displayAddress(derivationPath: string = STELLAR_BIP44_PATH): Promise<string> {
    return this.getPublicKey(derivationPath, true);
  }

  /**
   * Get connection status
   */
  getConnectionStatus(): LedgerConnectionStatus {
    return { ...this.connectionStatus };
  }

  /**
   * Check if device is connected
   */
  isConnected(): boolean {
    return this.connectionStatus.connected;
  }

  /**
   * Create transport based on configuration
   */
  private async createTransport(): Promise<Transport> {
    try {
      if (this.config.transport === 'usb') {
        // Try browser WebUSB first
        if (typeof window !== 'undefined' && TransportWebUSB.isSupported()) {
          return await TransportWebUSB.create();
        }
        // Fall back to Node.js HID
        return await TransportNodeHid.create();
      } else {
        // Bluetooth support would go here
        throw new LedgerError(
          LedgerErrorCode.TRANSPORT_ERROR,
          'Bluetooth transport not yet implemented'
        );
      }
    } catch (error: any) {
      throw parseLedgerError(error);
    }
  }

  /**
   * Handle device disconnect
   */
  private async handleDisconnect(): Promise<void> {
    this.connectionStatus = { connected: false };
    this.transport = null;
    this.stellarApp = null;
    this.emit('disconnected');

    // Auto-reconnect if enabled
    if (this.config.autoReconnect && this.reconnectAttempts < (this.config.maxReconnectAttempts || 3)) {
      this.reconnectAttempts++;
      this.emit('reconnecting', this.reconnectAttempts);

      try {
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2 seconds
        await this.connect();
      } catch (error: any) {
        const ledgerError = parseLedgerError(error);
        this.emit('reconnect-failed', ledgerError);

        if (this.reconnectAttempts >= (this.config.maxReconnectAttempts || 3)) {
          this.emit('reconnect-exhausted');
        }
      }
    }
  }

  /**
   * Ensure device is connected
   */
  private ensureConnected(): void {
    if (!this.transport || !this.stellarApp || !this.connectionStatus.connected) {
      throw new LedgerError(
        LedgerErrorCode.DEVICE_NOT_CONNECTED,
        'Ledger device not connected. Please call connect() first.'
      );
    }
  }

  /**
   * Get cached account by derivation path
   */
  getCachedAccount(derivationPath: string): LedgerAccount | undefined {
    return this.accountCache.get(derivationPath);
  }

  /**
   * Clear account cache
   */
  clearAccountCache(): void {
    this.accountCache.clear();
  }
}

/**
 * Detect available Ledger devices
 */
export async function detectLedgerDevices(): Promise<boolean> {
  try {
    // Check WebUSB support
    if (typeof window !== 'undefined' && TransportWebUSB.isSupported()) {
      const devices = await TransportWebUSB.list();
      return devices.length > 0;
    }

    // Check Node.js HID support
    const devices = await TransportNodeHid.list();
    return devices.length > 0;
  } catch {
    return false;
  }
}

/**
 * Check if Ledger is supported in current environment
 */
export function isLedgerSupported(): boolean {
  // Check WebUSB support in browser
  if (typeof window !== 'undefined') {
    return TransportWebUSB.isSupported();
  }

  // Node.js environment always supported with HID
  return true;
}
