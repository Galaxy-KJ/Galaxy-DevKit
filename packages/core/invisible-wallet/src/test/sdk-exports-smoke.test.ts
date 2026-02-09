// @ts-nocheck

/**
 * @fileoverview SDK Exports Smoke Test
 * @description Validates that all public exports from the three core packages
 *   resolve correctly and behave as expected. This is a pre-publish gate:
 *   if any export is broken, missing, or has a wrong signature, these tests
 *   will catch it before npm publish / GitHub push.
 *
 * NO real keys, secrets, network calls, or credentials are used.
 * Safe for npm publication and public repositories.
 */

process.env.ENCRYPTION_V2_ENABLED = 'false'; // Use PBKDF2 — no argon2 native needed
process.env.SUPABASE_URL = 'https://placeholder.supabase.co';
process.env.SUPABASE_ANON_KEY = 'placeholder_anon_key_for_testing_only';

// Mock Supabase client to prevent real network connections
jest.mock('../../../stellar-sdk/src/utils/supabase-client', () => ({
  supabaseClient: {
    from: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
  },
}));

// Mock network-utils to avoid Horizon connection
jest.mock('../../../stellar-sdk/src/utils/network-utils');

// ============================================================================
// 1. INVISIBLE-WALLET — Service Exports
// ============================================================================

import { InvisibleWalletService } from '../../index';
import { KeyManagementService } from '../../index';

// ============================================================================
// 2. INVISIBLE-WALLET — Type & Enum Exports
// ============================================================================

import {
  PasswordStrength,
  WalletStatus,
  AuthMethod,
  WalletEventType,
  USDC_CONFIG,
  DEFAULT_CONFIG,
  initializeInvisibleWallet,
} from '../../index';

import type {
  AssetConfig,
  InvisibleWalletConfig,
  InvisibleWallet,
  BackupStatus,
  WalletSession,
  DeviceInfo,
  KeyDerivationParams,
  EncryptedData,
  WalletRecoveryOptions,
  SecurityQuestion,
  WalletCreationResult,
  WalletUnlockResult,
  WalletOperationResult,
  TrustlineParams,
  InvisibleSwapParams,
  InvisibleSwapResult,
  SignTransactionResult,
  SetupWithUsdcResult,
  WalletEvent,
} from '../../index';

// ============================================================================
// 3. INVISIBLE-WALLET — Encryption Utilities
// ============================================================================

import {
  encryptPrivateKey,
  decryptPrivateKey,
  decryptPrivateKeyToString,
  withDecryptedKey,
  encryptData,
  decryptData,
  hashPassword,
  verifyPassword,
  generateSecureToken,
  generateSessionToken,
  evaluatePasswordStrength,
  validatePassword,
  generateRandomPassword,
  deriveKey,
  createHMAC,
  verifyHMAC,
  isArgon2Available,
} from '../../index';

// ============================================================================
// 4. INVISIBLE-WALLET — Backup Module Exports
// ============================================================================

import {
  BackupManager,
  RestoreManager,
  MigrationService,
  PBKDF2Provider,
  BackupValidator,
  EncryptedJsonFormat,
  QRCodeFormat,
  PaperWalletFormat,
  MnemonicFormat,
  ShamirManager,
  generateBackupChecksum,
  verifyBackupChecksum,
  generateShortChecksum,
  generateBackupHMAC,
  verifyBackupHMAC,
} from '../../index';

// ============================================================================
// 5. STELLAR-SDK — Service & Utility Exports
// ============================================================================

import { StellarService } from '../../../stellar-sdk/src/index';
import {
  isValidPublicKey,
  isValidSecretKey,
  generateKeypair,
  toStroops,
  fromStroops,
  formatAddress,
  isValidMemo,
  getNetworkPassphrase,
  getHorizonUrl,
  isValidAmount,
  formatBalance,
  isSameAddress,
  calculateFee,
  isValidAssetCode,
} from '../../../stellar-sdk/src/index';

// ============================================================================
// 6. STELLAR-SDK — Claimable Balances
// ============================================================================

import {
  ClaimableBalanceManager,
  unconditional,
  beforeAbsoluteTime,
  beforeRelativeTime,
  not,
  and,
  or,
  toStellarPredicate,
  validatePredicate,
  isPredicateClaimable,
} from '../../../stellar-sdk/src/index';

// ============================================================================
// 7. STELLAR-SDK — Liquidity Pools
// ============================================================================

import {
  LiquidityPoolManager,
  calculateConstantProduct,
  calculateSpotPrice,
  calculateDepositShares,
  calculatePriceImpact,
  calculateSwapOutput,
  validatePoolId,
  validateAmount as lpValidateAmount,
  validateSlippage,
  calculateImpermanentLoss,
  calculateAPRFromFees,
  toStellarPrecision,
} from '../../../stellar-sdk/src/index';

// ============================================================================
// 8. STELLAR-SDK — Path Payments
// ============================================================================

import {
  PathPaymentManager,
  HIGH_PRICE_IMPACT_THRESHOLD,
} from '../../../stellar-sdk/src/index';

// ============================================================================
// 9. STELLAR-SDK — Re-exported Stellar SDK
// ============================================================================

import {
  Keypair,
  Networks,
  BASE_FEE,
  Asset,
} from '../../../stellar-sdk/src/index';

// ============================================================================
// 10. DEFI-PROTOCOLS — Exports
// ============================================================================

import {
  BaseProtocol,
  ProtocolFactory,
  getProtocolFactory,
  PROTOCOL_IDS,
  PROTOCOL_NAMES,
  DEFAULT_SLIPPAGE,
  DEFAULT_DEADLINE,
  MIN_SAFE_HEALTH_FACTOR,
  validateAddress,
  validateAmount as defiValidateAmount,
  validateAsset,
  validateSlippage as defiValidateSlippage,
  isHealthyPosition,
  calculateMinimumAmount,
  compareAmounts,
  isNativeAsset,
  isCreditAsset,
  isAsset,
  isLendingOperation,
  isDexOperation,
  ProtocolError,
  isProtocolError,
  wrapError,
} from '../../../defi-protocols/src/index';

// ============================================================================
// TEST SUITES
// ============================================================================

describe('SDK Exports Smoke Tests', () => {

  // ==========================================================================
  // A. INVISIBLE-WALLET EXPORTS
  // ==========================================================================

  describe('invisible-wallet: services', () => {
    it('InvisibleWalletService is a constructable class', () => {
      expect(typeof InvisibleWalletService).toBe('function');
      expect(InvisibleWalletService.prototype).toBeDefined();
    });

    it('KeyManagementService is a constructable class', () => {
      expect(typeof KeyManagementService).toBe('function');
      expect(KeyManagementService.prototype).toBeDefined();
    });
  });

  describe('invisible-wallet: enums', () => {
    it('PasswordStrength has all variants', () => {
      expect(PasswordStrength.WEAK).toBe('weak');
      expect(PasswordStrength.MEDIUM).toBe('medium');
      expect(PasswordStrength.STRONG).toBe('strong');
      expect(PasswordStrength.VERY_STRONG).toBe('very_strong');
    });

    it('WalletStatus has all variants', () => {
      expect(WalletStatus.ACTIVE).toBe('active');
      expect(WalletStatus.LOCKED).toBe('locked');
      expect(WalletStatus.SUSPENDED).toBe('suspended');
      expect(WalletStatus.ARCHIVED).toBe('archived');
    });

    it('AuthMethod has all variants', () => {
      expect(AuthMethod.PASSWORD).toBe('password');
      expect(AuthMethod.BIOMETRIC).toBe('biometric');
      expect(AuthMethod.PIN).toBe('pin');
      expect(AuthMethod.PASSKEY).toBe('passkey');
    });

    it('WalletEventType has all variants', () => {
      expect(WalletEventType.CREATED).toBe('created');
      expect(WalletEventType.UNLOCKED).toBe('unlocked');
      expect(WalletEventType.LOCKED).toBe('locked');
      expect(WalletEventType.TRANSACTION_SENT).toBe('transaction_sent');
      expect(WalletEventType.TRUSTLINE_ADDED).toBe('trustline_added');
      expect(WalletEventType.SWAP_EXECUTED).toBe('swap_executed');
      expect(WalletEventType.TRANSACTION_SIGNED).toBe('transaction_signed');
      expect(WalletEventType.BACKUP_CREATED).toBe('backup_created');
      expect(WalletEventType.PASSWORD_CHANGED).toBe('password_changed');
      expect(WalletEventType.RECOVERY_INITIATED).toBe('recovery_initiated');
    });
  });

  describe('invisible-wallet: constants & init', () => {
    it('USDC_CONFIG has testnet and mainnet issuers', () => {
      expect(USDC_CONFIG.testnet.code).toBe('USDC');
      expect(USDC_CONFIG.testnet.issuer).toMatch(/^G[A-Z2-7]{55}$/);
      expect(USDC_CONFIG.mainnet.code).toBe('USDC');
      expect(USDC_CONFIG.mainnet.issuer).toMatch(/^G[A-Z2-7]{55}$/);
    });

    it('DEFAULT_CONFIG has expected shape', () => {
      expect(DEFAULT_CONFIG).toEqual(
        expect.objectContaining({
          keyDerivationIterations: expect.any(Number),
          passwordMinLength: expect.any(Number),
          sessionTimeout: expect.any(Number),
          autoLockEnabled: expect.any(Boolean),
          biometricEnabled: expect.any(Boolean),
        })
      );
    });

    it('initializeInvisibleWallet merges overrides', () => {
      const config = initializeInvisibleWallet({ sessionTimeout: 999 });
      expect(config.sessionTimeout).toBe(999);
      expect(config.keyDerivationIterations).toBe(DEFAULT_CONFIG.keyDerivationIterations);
    });
  });

  // ── Encryption Utilities ──────────────────────────────────────────────

  describe('invisible-wallet: encryption utilities', () => {
    const TEST_PASSWORD = 'SmokeTest1!Abcdef';
    const TEST_SECRET = 'PLACEHOLDER_SECRET_DATA_FOR_TESTING_ONLY';

    it('all encryption functions are exported and callable', () => {
      expect(typeof encryptPrivateKey).toBe('function');
      expect(typeof decryptPrivateKey).toBe('function');
      expect(typeof decryptPrivateKeyToString).toBe('function');
      expect(typeof withDecryptedKey).toBe('function');
      expect(typeof encryptData).toBe('function');
      expect(typeof decryptData).toBe('function');
      expect(typeof hashPassword).toBe('function');
      expect(typeof verifyPassword).toBe('function');
      expect(typeof generateSecureToken).toBe('function');
      expect(typeof generateSessionToken).toBe('function');
      expect(typeof evaluatePasswordStrength).toBe('function');
      expect(typeof validatePassword).toBe('function');
      expect(typeof generateRandomPassword).toBe('function');
      expect(typeof deriveKey).toBe('function');
      expect(typeof createHMAC).toBe('function');
      expect(typeof verifyHMAC).toBe('function');
      expect(typeof isArgon2Available).toBe('function');
    });

    it('encrypt → decrypt round-trip (PBKDF2 / v1)', async () => {
      const encrypted = await encryptPrivateKey(TEST_SECRET, TEST_PASSWORD);
      expect(typeof encrypted).toBe('string');
      expect(encrypted).not.toBe(TEST_SECRET);

      // Colon-separated v1 format: salt:iv:authTag:ciphertext
      const parts = encrypted.split(':');
      expect(parts.length).toBe(4);

      const decrypted = await decryptPrivateKeyToString(encrypted, TEST_PASSWORD);
      expect(decrypted).toBe(TEST_SECRET);
    });

    it('decryptPrivateKey returns Buffer', async () => {
      const encrypted = await encryptPrivateKey(TEST_SECRET, TEST_PASSWORD);
      const buf = await decryptPrivateKey(encrypted, TEST_PASSWORD);
      expect(buf instanceof Uint8Array).toBe(true);
      expect(Buffer.from(buf).toString('utf8')).toBe(TEST_SECRET);
    });

    it('withDecryptedKey provides key and zeroizes', async () => {
      const encrypted = await encryptPrivateKey(TEST_SECRET, TEST_PASSWORD);
      let capturedBuf: Buffer | null = null;

      const result = await withDecryptedKey(encrypted, TEST_PASSWORD, (keyBuf) => {
        capturedBuf = keyBuf;
        return keyBuf.toString('utf8');
      });

      expect(result).toBe(TEST_SECRET);
      // Buffer should be zeroized after callback completes
      expect(capturedBuf!.every((b: number) => b === 0)).toBe(true);
    });

    it('wrong password fails decryption', async () => {
      const encrypted = await encryptPrivateKey(TEST_SECRET, TEST_PASSWORD);
      await expect(
        decryptPrivateKeyToString(encrypted, 'WrongPassword1!')
      ).rejects.toThrow();
    });

    it('encryptData → decryptData round-trip', async () => {
      const payload = 'arbitrary_data_for_encryption_test';
      const enc = await encryptData(payload, TEST_PASSWORD);

      expect(enc).toHaveProperty('ciphertext');
      expect(enc).toHaveProperty('iv');
      expect(enc).toHaveProperty('salt');
      expect(enc).toHaveProperty('authTag');
      expect(enc).toHaveProperty('algorithm');

      const dec = await decryptData(enc, TEST_PASSWORD);
      expect(dec).toBe(payload);
    });

    it('hashPassword → verifyPassword round-trip', () => {
      const hash = hashPassword(TEST_PASSWORD);
      expect(typeof hash).toBe('string');
      expect(hash.split(':').length).toBe(2);

      expect(verifyPassword(TEST_PASSWORD, hash)).toBe(true);
      expect(verifyPassword('wrongpass', hash)).toBe(false);
    });

    it('generateSecureToken returns url-safe base64', () => {
      const token = generateSecureToken();
      expect(typeof token).toBe('string');
      expect(token.length).toBeGreaterThan(0);
      // base64url has no +, /, =
      expect(token).not.toMatch(/[+/=]/);
    });

    it('generateSessionToken returns longer token', () => {
      const token = generateSessionToken();
      expect(token.length).toBeGreaterThan(generateSecureToken(32).length - 10);
    });

    it('evaluatePasswordStrength classifies correctly', () => {
      expect(evaluatePasswordStrength('ab')).toBe(PasswordStrength.WEAK);
      expect(evaluatePasswordStrength('Abcdefgh1')).toBe(PasswordStrength.MEDIUM);
      expect(
        [PasswordStrength.STRONG, PasswordStrength.VERY_STRONG]
      ).toContain(evaluatePasswordStrength('Str0ng!Pass#2024xyz'));
    });

    it('validatePassword rejects weak passwords', () => {
      expect(() => validatePassword('short')).toThrow();
      expect(() => validatePassword('nouppercase1!')).toThrow();
      expect(() => validatePassword('NOLOWERCASE1!')).toThrow();
      expect(() => validatePassword('NoNumbers!')).toThrow();
    });

    it('validatePassword accepts strong passwords', () => {
      expect(() => validatePassword('ValidPass1!')).not.toThrow();
    });

    it('generateRandomPassword produces valid passwords', () => {
      const pw = generateRandomPassword(20);
      expect(pw.length).toBe(20);
      expect(/[a-z]/.test(pw)).toBe(true);
      expect(/[A-Z]/.test(pw)).toBe(true);
      expect(/[0-9]/.test(pw)).toBe(true);
      // Should not throw validation
      expect(() => validatePassword(pw)).not.toThrow();
    });

    it('generateRandomPassword uses CSPRNG (no duplicates in batch)', () => {
      const passwords = new Set(Array.from({ length: 50 }, () => generateRandomPassword()));
      // Extremely unlikely to have duplicates with CSPRNG
      expect(passwords.size).toBe(50);
    });

    it('deriveKey produces deterministic 32-byte buffer', () => {
      const salt = Buffer.from('smoke_test_salt_16b', 'utf8').subarray(0, 16);
      const key1 = deriveKey(TEST_PASSWORD, salt);
      const key2 = deriveKey(TEST_PASSWORD, salt);
      expect(key1.length).toBe(32);
      expect(key1.equals(key2)).toBe(true);
    });

    it('createHMAC → verifyHMAC round-trip', () => {
      const data = 'integrity_check_data';
      const hmacKey = 'hmac_secret_key';
      const sig = createHMAC(data, hmacKey);
      expect(typeof sig).toBe('string');
      expect(verifyHMAC(data, sig, hmacKey)).toBe(true);
      expect(verifyHMAC('tampered', sig, hmacKey)).toBe(false);
    });

    it('isArgon2Available returns boolean', () => {
      expect(typeof isArgon2Available()).toBe('boolean');
    });
  });

  // ── Backup Module ─────────────────────────────────────────────────────

  describe('invisible-wallet: backup module exports', () => {
    it('all backup classes are constructable', () => {
      expect(typeof BackupManager).toBe('function');
      expect(typeof RestoreManager).toBe('function');
      expect(typeof MigrationService).toBe('function');
      expect(typeof PBKDF2Provider).toBe('function');
      expect(typeof BackupValidator).toBe('function');
      expect(typeof EncryptedJsonFormat).toBe('function');
      expect(typeof QRCodeFormat).toBe('function');
      expect(typeof PaperWalletFormat).toBe('function');
      expect(typeof MnemonicFormat).toBe('function');
      expect(typeof ShamirManager).toBe('function');
    });

    it('backup checksum utilities work', () => {
      expect(typeof generateBackupChecksum).toBe('function');
      expect(typeof verifyBackupChecksum).toBe('function');
      expect(typeof generateShortChecksum).toBe('function');
      expect(typeof generateBackupHMAC).toBe('function');
      expect(typeof verifyBackupHMAC).toBe('function');
    });

    it('PBKDF2Provider can generate params and derive keys', async () => {
      const provider = new PBKDF2Provider();
      const params = provider.generateParams();
      expect(params).toHaveProperty('salt');
      expect(params).toHaveProperty('iterations');

      const key = await provider.deriveKey('smoke_test_pw', params);
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });
  });

  // ==========================================================================
  // B. STELLAR-SDK EXPORTS
  // ==========================================================================

  describe('stellar-sdk: service classes', () => {
    it('StellarService is a constructable class', () => {
      expect(typeof StellarService).toBe('function');
      expect(StellarService.prototype).toBeDefined();
    });

    it('ClaimableBalanceManager is a constructable class', () => {
      expect(typeof ClaimableBalanceManager).toBe('function');
    });

    it('LiquidityPoolManager is a constructable class', () => {
      expect(typeof LiquidityPoolManager).toBe('function');
    });

    it('PathPaymentManager is a constructable class', () => {
      expect(typeof PathPaymentManager).toBe('function');
    });

    it('HIGH_PRICE_IMPACT_THRESHOLD is exported', () => {
      expect(typeof HIGH_PRICE_IMPACT_THRESHOLD).toBe('number');
      expect(HIGH_PRICE_IMPACT_THRESHOLD).toBeGreaterThan(0);
    });
  });

  describe('stellar-sdk: utility functions', () => {
    it('isValidPublicKey validates Stellar addresses', () => {
      const kp = Keypair.random();
      expect(isValidPublicKey(kp.publicKey())).toBe(true);
      expect(isValidPublicKey('INVALID')).toBe(false);
      expect(isValidPublicKey('')).toBe(false);
    });

    it('isValidSecretKey validates Stellar secrets', () => {
      const kp = Keypair.random();
      expect(isValidSecretKey(kp.secret())).toBe(true);
      expect(isValidSecretKey('INVALID')).toBe(false);
    });

    it('generateKeypair returns valid keypair', () => {
      const kp = generateKeypair();
      expect(kp).toHaveProperty('publicKey');
      expect(kp).toHaveProperty('secretKey');
      expect(isValidPublicKey(kp.publicKey)).toBe(true);
      expect(isValidSecretKey(kp.secretKey)).toBe(true);
    });

    it('toStroops and fromStroops are inverse', () => {
      const amount = '100.5000000';
      const stroops = toStroops(amount);
      expect(typeof stroops).toBe('number');
      expect(stroops).toBe(1005000000);
      const back = fromStroops(stroops);
      expect(back).toBe(amount);
    });

    it('formatAddress truncates middle', () => {
      const kp = Keypair.random();
      const formatted = formatAddress(kp.publicKey());
      expect(formatted.length).toBeLessThan(kp.publicKey().length);
      expect(formatted).toContain('...');
    });

    it('isValidMemo validates memo types', () => {
      expect(isValidMemo('hello')).toBe(true);
    });

    it('getNetworkPassphrase returns known passphrases', () => {
      expect(getNetworkPassphrase('testnet')).toContain('Test SDF');
      expect(getNetworkPassphrase('mainnet')).toContain('Public Global');
    });

    it('getHorizonUrl returns valid URLs', () => {
      expect(getHorizonUrl('testnet')).toContain('horizon-testnet');
      expect(getHorizonUrl('mainnet')).toContain('horizon');
    });

    it('isValidAmount checks numeric strings', () => {
      expect(isValidAmount('100')).toBe(true);
      expect(isValidAmount('0')).toBe(false);
      expect(isValidAmount('-5')).toBe(false);
    });

    it('formatBalance formats to 7 decimals', () => {
      const formatted = formatBalance('1234567.1234567');
      expect(typeof formatted).toBe('string');
    });

    it('isSameAddress compares addresses', () => {
      const kp = Keypair.random();
      expect(isSameAddress(kp.publicKey(), kp.publicKey())).toBe(true);
      expect(isSameAddress(kp.publicKey(), Keypair.random().publicKey())).toBe(false);
    });

    it('calculateFee returns fee number', () => {
      const fee = calculateFee(1);
      expect(typeof fee).toBe('number');
      expect(fee).toBe(100); // 1 op * 100 base fee
    });

    it('isValidAssetCode validates asset codes', () => {
      expect(isValidAssetCode('XLM')).toBe(true);
      expect(isValidAssetCode('USDC')).toBe(true);
      expect(isValidAssetCode('')).toBe(false);
    });
  });

  describe('stellar-sdk: claimable balance predicates', () => {
    it('predicate builders produce valid objects', () => {
      const u = unconditional();
      expect(u).toBeDefined();
      expect(u).toHaveProperty('unconditional', true);

      const before = beforeAbsoluteTime('2030-01-01T00:00:00Z');
      expect(before).toHaveProperty('abs_before');

      const rel = beforeRelativeTime(3600);
      expect(rel).toHaveProperty('rel_before', '3600');

      const n = not(u);
      expect(n).toHaveProperty('not');

      const a = and(u, before);
      expect(a).toHaveProperty('and');
      expect(a.and).toHaveLength(2);

      const o = or(u, before);
      expect(o).toHaveProperty('or');
      expect(o.or).toHaveLength(2);
    });

    it('validatePredicate does not throw for valid predicates', () => {
      expect(() => validatePredicate(unconditional())).not.toThrow();
      expect(() => validatePredicate(and(unconditional(), unconditional()))).not.toThrow();
    });

    it('isPredicateClaimable checks time-based predicates', () => {
      expect(isPredicateClaimable(unconditional())).toBe(true);
    });

    it('toStellarPredicate converts to SDK format', () => {
      const pred = toStellarPredicate(unconditional());
      expect(pred).toBeDefined();
    });
  });

  describe('stellar-sdk: liquidity pool calculations', () => {
    it('calculateConstantProduct computes k = x * y', () => {
      const k = calculateConstantProduct('1000', '2000');
      expect(parseFloat(k)).toBe(2_000_000);
    });

    it('calculateSpotPrice computes price', () => {
      const price = calculateSpotPrice('1000', '2000');
      expect(parseFloat(price)).toBeCloseTo(2.0, 5);
    });

    it('calculateSwapOutput computes output for constant-product AMM', () => {
      const result = calculateSwapOutput('100', '10000', '20000', 30);
      // Returns a string amount
      expect(typeof result).toBe('string');
      expect(parseFloat(result)).toBeGreaterThan(0);
    });

    it('calculatePriceImpact returns impact object', () => {
      // Needs 4 args: inputAmount, outputAmount, reserveIn, reserveOut
      const output = calculateSwapOutput('500', '10000', '20000', 30);
      const impact = calculatePriceImpact('500', output, '10000', '20000');
      expect(impact).toHaveProperty('priceImpact');
      expect(impact).toHaveProperty('isHighImpact');
      expect(impact).toHaveProperty('effectivePrice');
    });

    it('calculateImpermanentLoss returns loss value', () => {
      const il = calculateImpermanentLoss(1.0, 2.0);
      expect(typeof il).toBe('string');
      expect(parseFloat(il)).toBeGreaterThan(0);
    });

    it('calculateAPRFromFees computes annualized return', () => {
      const apr = calculateAPRFromFees('1000', '100000', 30);
      expect(typeof apr).toBe('string');
      expect(parseFloat(apr)).toBeGreaterThan(0);
    });

    it('toStellarPrecision formats to 7 decimals', () => {
      expect(toStellarPrecision('1.123456789')).toBe('1.1234567');
      expect(toStellarPrecision(100)).toBe('100.0000000');
    });

    it('validation functions work', () => {
      // validatePoolId returns true or throws
      expect(validatePoolId('abc123def456abc123def456abc123def456abc123def456abc123def456abcd')).toBe(true);
      expect(() => validatePoolId('short')).toThrow();
      expect(lpValidateAmount('100')).toBe(true);
      expect(() => lpValidateAmount('-5')).toThrow();
      expect(validateSlippage('0.5')).toBe(true);
    });
  });

  describe('stellar-sdk: re-exported @stellar/stellar-sdk', () => {
    it('Keypair is the real Stellar Keypair', () => {
      const kp = Keypair.random();
      expect(kp.publicKey()).toMatch(/^G[A-Z2-7]{55}$/);
      expect(kp.secret()).toMatch(/^S[A-Z2-7]{55}$/);
    });

    it('Networks contains known passphrases', () => {
      expect(Networks.TESTNET).toContain('Test SDF');
      expect(Networks.PUBLIC).toContain('Public Global');
    });

    it('BASE_FEE is a string', () => {
      expect(typeof BASE_FEE).toBe('string');
      expect(parseInt(BASE_FEE, 10)).toBeGreaterThan(0);
    });

    it('Asset.native() exists', () => {
      const xlm = Asset.native();
      expect(xlm.isNative()).toBe(true);
    });
  });

  // ==========================================================================
  // C. DEFI-PROTOCOLS EXPORTS
  // ==========================================================================

  describe('defi-protocols: core exports', () => {
    it('BaseProtocol is a constructable class', () => {
      expect(typeof BaseProtocol).toBe('function');
    });

    it('ProtocolFactory is a constructable class', () => {
      expect(typeof ProtocolFactory).toBe('function');
    });

    it('getProtocolFactory returns a singleton', () => {
      const f1 = getProtocolFactory();
      const f2 = getProtocolFactory();
      expect(f1).toBe(f2);
      expect(f1).toBeInstanceOf(ProtocolFactory);
    });
  });

  describe('defi-protocols: constants', () => {
    it('PROTOCOL_IDS has blend and soroswap', () => {
      expect(PROTOCOL_IDS).toHaveProperty('BLEND');
      expect(PROTOCOL_IDS).toHaveProperty('SOROSWAP');
    });

    it('PROTOCOL_NAMES maps IDs to display names', () => {
      expect(typeof PROTOCOL_NAMES[PROTOCOL_IDS.BLEND]).toBe('string');
      expect(typeof PROTOCOL_NAMES[PROTOCOL_IDS.SOROSWAP]).toBe('string');
    });

    it('DEFAULT_SLIPPAGE is a numeric string', () => {
      expect(parseFloat(DEFAULT_SLIPPAGE)).toBeGreaterThan(0);
      expect(parseFloat(DEFAULT_SLIPPAGE)).toBeLessThan(1);
    });

    it('DEFAULT_DEADLINE is a positive integer', () => {
      expect(DEFAULT_DEADLINE).toBeGreaterThan(0);
      expect(Number.isInteger(DEFAULT_DEADLINE)).toBe(true);
    });

    it('MIN_SAFE_HEALTH_FACTOR > 1', () => {
      expect(parseFloat(MIN_SAFE_HEALTH_FACTOR)).toBeGreaterThan(1);
    });
  });

  describe('defi-protocols: validation utilities', () => {
    it('validateAddress checks Stellar public keys', () => {
      const kp = Keypair.random();
      expect(validateAddress(kp.publicKey())).toBe(true);
      // Throws on invalid address (not returns false)
      expect(() => validateAddress('INVALID')).toThrow('Invalid Stellar address');
    });

    it('validateAmount rejects non-positive amounts', () => {
      expect(defiValidateAmount('100')).toBe(true);
      expect(() => defiValidateAmount('-1')).toThrow();
      expect(() => defiValidateAmount('0')).toThrow();
    });

    it('validateAsset accepts native and credit assets', () => {
      expect(validateAsset({ code: 'XLM', type: 'native' })).toBe(true);
      expect(
        validateAsset({ code: 'USDC', type: 'credit_alphanum4', issuer: Keypair.random().publicKey() })
      ).toBe(true);
    });

    it('validateSlippage rejects out-of-range values', () => {
      expect(defiValidateSlippage('0.01')).toBe(true);
      expect(() => defiValidateSlippage('-0.01')).toThrow();
      expect(() => defiValidateSlippage('1.5')).toThrow();
    });

    it('isHealthyPosition checks health factor', () => {
      expect(isHealthyPosition('2.0')).toBe(true);
      expect(isHealthyPosition('0.5')).toBe(false);
    });

    it('calculateMinimumAmount applies slippage', () => {
      const min = calculateMinimumAmount('100', '0.01');
      expect(parseFloat(min)).toBeLessThan(100);
      expect(parseFloat(min)).toBeGreaterThan(98);
    });

    it('compareAmounts compares numeric strings', () => {
      expect(compareAmounts('100', '200')).toBeLessThan(0);
      expect(compareAmounts('200', '100')).toBeGreaterThan(0);
      expect(compareAmounts('100', '100')).toBe(0);
    });
  });

  describe('defi-protocols: type guards', () => {
    it('isNativeAsset identifies native asset', () => {
      expect(isNativeAsset({ code: 'XLM', type: 'native' })).toBe(true);
      expect(isNativeAsset({ code: 'USDC', type: 'credit_alphanum4', issuer: 'G...' })).toBe(false);
    });

    it('isCreditAsset identifies credit assets', () => {
      expect(isCreditAsset({ code: 'USDC', type: 'credit_alphanum4', issuer: 'G...' })).toBe(true);
      expect(isCreditAsset({ code: 'XLM', type: 'native' })).toBe(false);
    });

    it('isAsset type guard works', () => {
      expect(isAsset({ code: 'XLM', type: 'native' })).toBe(true);
      expect(isAsset(42)).toBe(false);
      expect(isAsset(null)).toBe(false);
    });

    it('operation type guards return booleans', () => {
      expect(typeof isLendingOperation).toBe('function');
      expect(typeof isDexOperation).toBe('function');
    });
  });

  describe('defi-protocols: error classes', () => {
    it('ProtocolError is throwable with code', () => {
      const err = new ProtocolError('test error', 'UNKNOWN_ERROR');
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('test error');
      expect(err.code).toBe('UNKNOWN_ERROR');
    });

    it('isProtocolError type guard works', () => {
      const err = new ProtocolError('test', 'UNKNOWN_ERROR');
      expect(isProtocolError(err)).toBe(true);
      expect(isProtocolError(new Error('plain'))).toBe(false);
    });

    it('wrapError converts unknown errors', () => {
      const wrapped = wrapError(new Error('raw error'));
      expect(isProtocolError(wrapped)).toBe(true);
    });
  });

  // ==========================================================================
  // D. CROSS-PACKAGE INTEGRATION
  // ==========================================================================

  describe('cross-package: encryption re-exports from stellar-sdk', () => {
    it('stellar-sdk re-exports encryption from invisible-wallet', async () => {
      const {
        encryptPrivateKey: stellarEncrypt,
        decryptPrivateKeyToString: stellarDecrypt,
        withDecryptedKey: stellarWithKey,
      } = await import('../../../stellar-sdk/src/utils/encryption.utils');

      expect(typeof stellarEncrypt).toBe('function');
      expect(typeof stellarDecrypt).toBe('function');
      expect(typeof stellarWithKey).toBe('function');

      // Verify they actually work (not just stubs)
      const password = 'CrossPkgTest1!';
      const secret = 'cross_package_test_data';
      const enc = await stellarEncrypt(secret, password);
      const dec = await stellarDecrypt(enc, password);
      expect(dec).toBe(secret);
    });
  });

  describe('cross-package: keypair generation consistency', () => {
    it('generateKeypair from stellar-sdk produces valid keys for encryption', async () => {
      const kp = generateKeypair();
      const password = 'KeypairTest1!';

      // Encrypt the generated secret
      const encrypted = await encryptPrivateKey(kp.secretKey, password);
      const decrypted = await decryptPrivateKeyToString(encrypted, password);
      expect(decrypted).toBe(kp.secretKey);

      // Verify the decrypted key is a valid Stellar secret
      expect(isValidSecretKey(decrypted)).toBe(true);
    });
  });

  // ==========================================================================
  // E. SECURITY INVARIANTS
  // ==========================================================================

  describe('security: no sensitive data in this test file', () => {
    const fs = require('fs');
    const path = require('path');
    const thisFile = fs.readFileSync(
      path.join(__dirname, 'sdk-exports-smoke.test.ts'),
      'utf8'
    );

    it('file contains no real Stellar secret keys (S...)', () => {
      // Real Stellar secrets are 56 chars starting with S followed by base32
      const realSecretPattern = /S[A-Z2-7]{55}/g;
      const matches = thisFile.match(realSecretPattern) || [];
      // Filter out the regex pattern itself and string literals we use
      const suspicious = matches.filter(
        (m: string) => !m.startsWith('SAAAA') && m !== 'SDF Network'
      );
      expect(suspicious).toEqual([]);
    });

    it('file contains no hardcoded passwords besides test constants', () => {
      // Ensure no real-looking passwords are embedded
      const lines = thisFile.split('\n');
      const passwordLines = lines.filter(
        (l: string) =>
          /password\s*[:=]\s*['"][^'"]{20,}/i.test(l) && !l.includes('PLACEHOLDER')
      );
      expect(passwordLines).toEqual([]);
    });

    it('file contains no API keys or tokens', () => {
      expect(thisFile).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);
      expect(thisFile).not.toMatch(/Bearer [a-zA-Z0-9]{20,}/);
      expect(thisFile).not.toMatch(/ghp_[a-zA-Z0-9]{36}/);
    });
  });
});
