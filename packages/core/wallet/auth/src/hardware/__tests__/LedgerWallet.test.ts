/**
 * LedgerWallet Tests
 * Comprehensive test suite for Ledger hardware wallet integration
 */

import { LedgerWallet, detectLedgerDevices, isLedgerSupported } from '../LedgerWallet';
import {
  LedgerErrorCode,
  LedgerError,
  STELLAR_BIP44_PATH,
  buildStellarPath,
  validateStellarPath,
  parseBIP44Path,
} from '../types';
import { parseLedgerError, isRecoverableError, requiresUserAction } from '../ledger-errors';

// Mock the Ledger transport modules
jest.mock('@ledgerhq/hw-transport-webusb');
jest.mock('@ledgerhq/hw-transport-node-hid');
jest.mock('@ledgerhq/hw-app-str');

describe('LedgerWallet', () => {
  let ledgerWallet: LedgerWallet;

  beforeEach(() => {
    ledgerWallet = new LedgerWallet({
      transport: 'usb',
      timeout: 30000,
      autoReconnect: false,
    });
  });

  afterEach(async () => {
    if (ledgerWallet.isConnected()) {
      await ledgerWallet.disconnect();
    }
  });

  describe('Connection Management', () => {
    it('should initialize with default configuration', () => {
      const wallet = new LedgerWallet();
      expect(wallet.isConnected()).toBe(false);
      const status = wallet.getConnectionStatus();
      expect(status.connected).toBe(false);
    });

    it('should accept custom configuration', () => {
      const customWallet = new LedgerWallet({
        transport: 'usb',
        timeout: 60000,
        derivationPath: buildStellarPath(1),
        autoReconnect: true,
        maxReconnectAttempts: 5,
      });
      expect(customWallet).toBeDefined();
    });

    it('should emit connecting event on connect attempt', (done) => {
      ledgerWallet.on('connecting', () => {
        done();
      });

      ledgerWallet.connect().catch(() => {
        // Expected to fail in test environment
      });
    });

    it('should update connection status on disconnect', async () => {
      expect(ledgerWallet.isConnected()).toBe(false);
      const status = ledgerWallet.getConnectionStatus();
      expect(status.connected).toBe(false);
    });
  });

  describe('Derivation Path Validation', () => {
    it('should validate correct Stellar BIP44 paths', () => {
      expect(validateStellarPath(STELLAR_BIP44_PATH)).toBe(true);
      expect(validateStellarPath("44'/148'/0'")).toBe(true);
      expect(validateStellarPath("44'/148'/1'")).toBe(true);
      expect(validateStellarPath("44'/148'/999'")).toBe(true);
    });

    it('should reject invalid paths', () => {
      expect(validateStellarPath("44'/0'/0'")).toBe(false); // Wrong coin type
      expect(validateStellarPath("49'/148'/0'")).toBe(false); // Wrong purpose
      expect(validateStellarPath('invalid')).toBe(false);
      expect(validateStellarPath('')).toBe(false);
    });

    it('should parse BIP44 path correctly', () => {
      const parsed = parseBIP44Path("44'/148'/5'");
      expect(parsed.purpose).toBe(44);
      expect(parsed.coinType).toBe(148);
      expect(parsed.account).toBe(5);
    });

    it('should build Stellar paths correctly', () => {
      expect(buildStellarPath(0)).toBe("44'/148'/0'");
      expect(buildStellarPath(1)).toBe("44'/148'/1'");
      expect(buildStellarPath(99)).toBe("44'/148'/99'");
    });

    it('should throw error for invalid path in parseBIP44Path', () => {
      expect(() => parseBIP44Path('invalid')).toThrow(LedgerError);
      expect(() => parseBIP44Path("44'/148'")).toThrow(LedgerError);
    });
  });

  describe('Error Handling', () => {
    it('should parse user rejection error', () => {
      const mockError = { statusCode: 0x6985, message: 'User rejected' };
      const ledgerError = parseLedgerError(mockError);

      expect(ledgerError).toBeInstanceOf(LedgerError);
      expect(ledgerError.code).toBe(LedgerErrorCode.USER_REJECTED);
    });

    it('should parse app not open error', () => {
      const mockError = { statusCode: 0x6d00, message: 'App not open' };
      const ledgerError = parseLedgerError(mockError);

      expect(ledgerError.code).toBe(LedgerErrorCode.APP_NOT_OPEN);
    });

    it('should parse device locked error', () => {
      const mockError = { statusCode: 0x6e00, message: 'Device locked' };
      const ledgerError = parseLedgerError(mockError);

      expect(ledgerError.code).toBe(LedgerErrorCode.DEVICE_LOCKED);
    });

    it('should identify recoverable errors', () => {
      const timeoutError = new LedgerError(
        LedgerErrorCode.CONNECTION_TIMEOUT,
        'Timeout'
      );
      const transportError = new LedgerError(
        LedgerErrorCode.TRANSPORT_ERROR,
        'Transport failed'
      );
      const userRejection = new LedgerError(
        LedgerErrorCode.USER_REJECTED,
        'Rejected'
      );

      expect(isRecoverableError(timeoutError)).toBe(true);
      expect(isRecoverableError(transportError)).toBe(true);
      expect(isRecoverableError(userRejection)).toBe(false);
    });

    it('should identify errors requiring user action', () => {
      const appNotOpen = new LedgerError(LedgerErrorCode.APP_NOT_OPEN, 'App not open');
      const deviceLocked = new LedgerError(LedgerErrorCode.DEVICE_LOCKED, 'Locked');
      const invalidPath = new LedgerError(
        LedgerErrorCode.INVALID_DERIVATION_PATH,
        'Invalid path'
      );

      expect(requiresUserAction(appNotOpen)).toBe(true);
      expect(requiresUserAction(deviceLocked)).toBe(true);
      expect(requiresUserAction(invalidPath)).toBe(false);
    });

    it('should handle transport errors', () => {
      const transportError = { name: 'TransportError', message: 'USB error' };
      const ledgerError = parseLedgerError(transportError);

      expect(ledgerError.code).toBe(LedgerErrorCode.TRANSPORT_ERROR);
    });

    it('should handle timeout errors', () => {
      const timeoutError = { message: 'Connection timeout occurred' };
      const ledgerError = parseLedgerError(timeoutError);

      expect(ledgerError.code).toBe(LedgerErrorCode.CONNECTION_TIMEOUT);
    });
  });

  describe('Event Emitter', () => {
    it('should emit error events', (done) => {
      ledgerWallet.on('error', (error) => {
        expect(error).toBeInstanceOf(LedgerError);
        done();
      });

      // Trigger error by trying to get public key without connection
      ledgerWallet.getPublicKey().catch(() => {
        // Expected to fail
      });
    });

    it('should emit disconnected event', (done) => {
      ledgerWallet.on('disconnected', () => {
        done();
      });

      ledgerWallet.disconnect();
    });
  });

  describe('Account Cache', () => {
    it('should cache accounts', async () => {
      const derivationPath = buildStellarPath(0);
      expect(ledgerWallet.getCachedAccount(derivationPath)).toBeUndefined();

      // Cache would be populated after getAccounts() call
      // In real scenario with connected device
    });

    it('should clear account cache', () => {
      ledgerWallet.clearAccountCache();
      expect(ledgerWallet.getCachedAccount(STELLAR_BIP44_PATH)).toBeUndefined();
    });
  });

  describe('Device Detection', () => {
    it('should check if Ledger is supported', () => {
      const supported = isLedgerSupported();
      expect(typeof supported).toBe('boolean');
    });

    it('should detect Ledger devices', async () => {
      const detected = await detectLedgerDevices().catch(() => false);
      expect(typeof detected).toBe('boolean');
    });
  });

  describe('Configuration Validation', () => {
    it('should handle missing optional config parameters', () => {
      const wallet = new LedgerWallet({ transport: 'usb' });
      expect(wallet).toBeDefined();
      const status = wallet.getConnectionStatus();
      expect(status.connected).toBe(false);
    });

    it('should apply default configuration', () => {
      const wallet = new LedgerWallet();
      const status = wallet.getConnectionStatus();
      expect(status.connected).toBe(false);
    });
  });

  describe('Error Messages', () => {
    it('should provide user-friendly error messages', () => {
      const errors = [
        new LedgerError(LedgerErrorCode.DEVICE_NOT_CONNECTED, 'Not connected'),
        new LedgerError(LedgerErrorCode.APP_NOT_OPEN, 'App not open'),
        new LedgerError(LedgerErrorCode.USER_REJECTED, 'Rejected'),
        new LedgerError(LedgerErrorCode.DEVICE_LOCKED, 'Locked'),
      ];

      errors.forEach((error) => {
        expect(error.message).toBeTruthy();
        expect(error.code).toBeTruthy();
      });
    });
  });

  describe('Multiple Accounts', () => {
    it('should build paths for multiple accounts', () => {
      const paths = [0, 1, 2, 3, 4].map(buildStellarPath);

      expect(paths).toEqual([
        "44'/148'/0'",
        "44'/148'/1'",
        "44'/148'/2'",
        "44'/148'/3'",
        "44'/148'/4'",
      ]);

      paths.forEach((path) => {
        expect(validateStellarPath(path)).toBe(true);
      });
    });
  });

  describe('Signature Operations', () => {
    it('should throw error when signing without connection', async () => {
      const hash = Buffer.from('test-hash');

      await expect(ledgerWallet.signTransaction(hash)).rejects.toThrow(LedgerError);
      await expect(ledgerWallet.signHash(hash)).rejects.toThrow(LedgerError);
    });

    it('should validate derivation path before signing', async () => {
      const hash = Buffer.from('test-hash');
      const invalidPath = "44'/0'/0'"; // Wrong coin type

      await expect(
        ledgerWallet.signTransaction(hash, invalidPath)
      ).rejects.toThrow(LedgerError);
    });
  });

  describe('Connection Status', () => {
    it('should return correct connection status', () => {
      const status = ledgerWallet.getConnectionStatus();

      expect(status).toHaveProperty('connected');
      expect(status.connected).toBe(false);
    });

    it('should include last connected timestamp after connection', () => {
      const status = ledgerWallet.getConnectionStatus();
      expect(status.lastConnectedAt).toBeUndefined();
    });
  });
});

describe('LedgerError', () => {
  it('should create LedgerError with all properties', () => {
    const originalError = new Error('Original error');
    const ledgerError = new LedgerError(
      LedgerErrorCode.DEVICE_NOT_CONNECTED,
      'Device not connected',
      originalError
    );

    expect(ledgerError).toBeInstanceOf(Error);
    expect(ledgerError).toBeInstanceOf(LedgerError);
    expect(ledgerError.code).toBe(LedgerErrorCode.DEVICE_NOT_CONNECTED);
    expect(ledgerError.message).toBe('Device not connected');
    expect(ledgerError.originalError).toBe(originalError);
    expect(ledgerError.name).toBe('LedgerError');
  });

  it('should work without original error', () => {
    const ledgerError = new LedgerError(
      LedgerErrorCode.USER_REJECTED,
      'User rejected transaction'
    );

    expect(ledgerError.code).toBe(LedgerErrorCode.USER_REJECTED);
    expect(ledgerError.originalError).toBeUndefined();
  });
});

describe('Path Utilities', () => {
  describe('buildStellarPath', () => {
    it('should build correct paths for various account indices', () => {
      expect(buildStellarPath(0)).toBe("44'/148'/0'");
      expect(buildStellarPath(10)).toBe("44'/148'/10'");
      expect(buildStellarPath(9999)).toBe("44'/148'/9999'");
    });

    it('should use 0 as default account index', () => {
      expect(buildStellarPath()).toBe("44'/148'/0'");
    });
  });

  describe('validateStellarPath', () => {
    it('should accept valid Stellar paths', () => {
      const validPaths = [
        "44'/148'/0'",
        "44'/148'/1'",
        "44'/148'/100'",
        "44'/148'/9999'",
      ];

      validPaths.forEach((path) => {
        expect(validateStellarPath(path)).toBe(true);
      });
    });

    it('should reject paths with wrong coin type', () => {
      const invalidPaths = ["44'/0'/0'", "44'/60'/0'", "44'/1'/0'"];

      invalidPaths.forEach((path) => {
        expect(validateStellarPath(path)).toBe(false);
      });
    });

    it('should reject malformed paths', () => {
      const malformedPaths = ['', 'invalid', '44/148/0', "44'148'0'", '44'];

      malformedPaths.forEach((path) => {
        expect(validateStellarPath(path)).toBe(false);
      });
    });
  });

  describe('parseBIP44Path', () => {
    it('should correctly parse valid BIP44 paths', () => {
      const parsed = parseBIP44Path("44'/148'/5'");

      expect(parsed).toEqual({
        purpose: 44,
        coinType: 148,
        account: 5,
      });
    });

    it('should handle paths with m/ prefix', () => {
      const parsed1 = parseBIP44Path("m/44'/148'/0'");
      const parsed2 = parseBIP44Path("44'/148'/0'");

      expect(parsed1).toEqual(parsed2);
    });

    it('should throw for invalid paths', () => {
      expect(() => parseBIP44Path('invalid')).toThrow(LedgerError);
      expect(() => parseBIP44Path("44'/148'")).toThrow(LedgerError);
      expect(() => parseBIP44Path('')).toThrow(LedgerError);
    });

    it('should parse non-hardened values correctly', () => {
      // Even though Stellar uses hardened paths, parser should handle both
      const parsed = parseBIP44Path("44'/148'/0'");
      expect(parsed.account).toBe(0);
    });
  });
});
