/**
 * @fileoverview Enhanced encryption utilities for invisible wallet
 * @description Advanced encryption, hashing, and security utilities
 * @author @ryzen_xp
 * @version 1.0.0
 * @since 2024-12-01
 */

import crypto from 'crypto';
import {
  EncryptedData,
  KeyDerivationParams,
  PasswordStrength,
} from '../types/wallet.types.js';

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const DEFAULT_ITERATIONS = 100000;
const KEY_LENGTH = 32;

// Argon2id parameters
const ENCRYPTION_VERSION_PREFIX = 'v2:';
const ARGON2_MEMORY_COST = 65536; // 64 MB
const ARGON2_TIME_COST = 3;
const ARGON2_PARALLELISM = 4;

// Rollback flag — set ENCRYPTION_V2_ENABLED=false to revert new encryptions to PBKDF2
const ENCRYPTION_V2_ENABLED = process.env.ENCRYPTION_V2_ENABLED !== 'false';

// Argon2 graceful degradation
let argon2Module: any = null;
let argon2Available = false;

(async () => {
  try {
    argon2Module = await import('argon2');
    argon2Available = true;
  } catch {
    console.error(
      'CRITICAL: argon2 native module failed to load. New encryptions will be rejected. Decryption of existing keys will use PBKDF2 fallback.'
    );
  }
})();

/**
 * Checks if Argon2 native module is available
 */
export function isArgon2Available(): boolean {
  return argon2Available;
}

/**
 * Encrypts private key using AES-256-GCM.
 * When ENCRYPTION_V2_ENABLED=true (default) and Argon2 is available, uses Argon2id KDF
 * and outputs v2 format: `v2:salt:iv:authTag:argon2Params:ciphertext`.
 * Otherwise falls back to PBKDF2 with v1 format: `salt:iv:authTag:ciphertext`.
 * @param privateKey - Private key to encrypt
 * @param password - Password for encryption
 * @returns Encrypted string
 */
export async function encryptPrivateKey(
  privateKey: string,
  password: string
): Promise<string> {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);

  let key: Buffer;

  if (ENCRYPTION_V2_ENABLED) {
    if (!argon2Available || !argon2Module) {
      throw new Error(
        'Argon2id unavailable — cannot create secure encryption. Install argon2 native module.'
      );
    }

    key = await argon2Module.hash(password, {
      type: argon2Module.argon2id,
      memoryCost: ARGON2_MEMORY_COST,
      timeCost: ARGON2_TIME_COST,
      parallelism: ARGON2_PARALLELISM,
      salt,
      raw: true,
      hashLength: KEY_LENGTH,
    });
  } else {
    key = crypto.pbkdf2Sync(password, salt, DEFAULT_ITERATIONS, KEY_LENGTH, 'sha256');
  }

  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(privateKey, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  if (ENCRYPTION_V2_ENABLED) {
    const argon2Params = Buffer.from(
      JSON.stringify({ m: ARGON2_MEMORY_COST, t: ARGON2_TIME_COST, p: ARGON2_PARALLELISM })
    ).toString('base64');

    return [
      'v2',
      salt.toString('base64'),
      iv.toString('base64'),
      authTag.toString('base64'),
      argon2Params,
      encrypted.toString('base64'),
    ].join(':');
  }

  return [
    salt.toString('base64'),
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

/**
 * Decrypts AES-256-GCM encrypted private key.
 * Auto-detects format: v2 (Argon2id) or v1 (PBKDF2).
 * Returns Buffer to enable zeroization by the caller.
 * @param encryptedData - Encrypted data string
 * @param password - Password for decryption
 * @returns Decrypted private key as Buffer
 */
export async function decryptPrivateKey(
  encryptedData: string,
  password: string
): Promise<Buffer> {
  const isV2 = encryptedData.startsWith(ENCRYPTION_VERSION_PREFIX);

  if (isV2) {
    // v2 format: v2:salt:iv:authTag:argon2Params:ciphertext
    const parts = encryptedData.split(':');
    const [, saltB64, ivB64, authTagB64, argon2ParamsB64, encryptedB64] = parts;

    if (!saltB64 || !ivB64 || !authTagB64 || !argon2ParamsB64 || !encryptedB64) {
      throw new Error('Invalid password or corrupted key data');
    }

    const salt = Buffer.from(saltB64, 'base64');
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const encrypted = Buffer.from(encryptedB64, 'base64');

    let key: Buffer;

    if (argon2Available && argon2Module) {
      const params = JSON.parse(Buffer.from(argon2ParamsB64, 'base64').toString('utf8'));
      key = await argon2Module.hash(password, {
        type: argon2Module.argon2id,
        memoryCost: params.m,
        timeCost: params.t,
        parallelism: params.p,
        salt,
        raw: true,
        hashLength: KEY_LENGTH,
      });
    } else {
      // Degraded fallback: PBKDF2 with high iterations when Argon2 unavailable
      console.warn(
        'WARNING: Argon2 unavailable, using PBKDF2 degraded fallback for v2 decryption. Key access preserved but KDF strength reduced.'
      );
      key = crypto.pbkdf2Sync(password, salt, DEFAULT_ITERATIONS, KEY_LENGTH, 'sha256');
    }

    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(encrypted), decipher.final()]);
  }

  // v1 format: salt:iv:authTag:ciphertext (PBKDF2)
  const [saltB64, ivB64, authTagB64, encryptedB64] = encryptedData.split(':');

  if (!saltB64 || !ivB64 || !authTagB64 || encryptedB64 === undefined) {
    throw new Error('Invalid password or corrupted key data');
  }

  const salt = Buffer.from(saltB64, 'base64');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const encrypted = Buffer.from(encryptedB64, 'base64');

  const key = crypto.pbkdf2Sync(password, salt, DEFAULT_ITERATIONS, KEY_LENGTH, 'sha256');

  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

/**
 * Decrypts private key and returns as string (legacy convenience wrapper).
 * Prefer withDecryptedKey() for new code — it handles Buffer zeroization.
 * @param encryptedData - Encrypted data string
 * @param password - Password for decryption
 * @returns Decrypted private key as string
 */
export async function decryptPrivateKeyToString(
  encryptedData: string,
  password: string
): Promise<string> {
  const raw = await decryptPrivateKey(encryptedData, password);
  const buf = Buffer.from(raw);
  const result = buf.toString('utf8');
  buf.fill(0);
  return result;
}

/**
 * Safely decrypts a key, passes it to a callback, and zeroizes the buffer.
 * All consumers should use this pattern for key operations.
 * @param encryptedKey - Encrypted key data
 * @param password - Decryption password
 * @param callback - Function receiving the key Buffer
 * @returns Result of the callback
 */
export async function withDecryptedKey<T>(
  encryptedKey: string,
  password: string,
  callback: (keyBuffer: Buffer) => T | Promise<T>
): Promise<T> {
  const raw = await decryptPrivateKey(encryptedKey, password);
  const keyBuffer = Buffer.from(raw);
  try {
    return await callback(keyBuffer);
  } catch {
    throw new Error('Invalid password or corrupted key data');
  } finally {
    keyBuffer.fill(0);
  }
}

/**
 * Encrypts any data with structured output
 * @param data - Data to encrypt
 * @param password - Password for encryption
 * @param params - Key derivation parameters
 * @returns Encrypted data object
 */
export async function encryptData(
  data: string,
  password: string,
  params?: Partial<KeyDerivationParams>
): Promise<EncryptedData> {
  const salt = params?.salt || crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const iterations = params?.iterations || DEFAULT_ITERATIONS;

  const key = crypto.pbkdf2Sync(
    password,
    salt,
    iterations,
    params?.keyLength || KEY_LENGTH,
    params?.digest || 'sha256'
  );

  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(data, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    salt: salt.toString('base64'),
    authTag: authTag.toString('base64'),
    algorithm: ALGO,
  };
}

/**
 * Decrypts structured encrypted data
 * @param encryptedData - Encrypted data object
 * @param password - Password for decryption
 * @param params - Key derivation parameters
 * @returns Decrypted data
 */
export async function decryptData(
  encryptedData: EncryptedData,
  password: string,
  params?: Partial<KeyDerivationParams>
): Promise<string> {
  const salt = Buffer.from(encryptedData.salt, 'base64');
  const iv = Buffer.from(encryptedData.iv, 'base64');
  const authTag = Buffer.from(encryptedData.authTag, 'base64');
  const ciphertext = Buffer.from(encryptedData.ciphertext, 'base64');
  const iterations = params?.iterations || DEFAULT_ITERATIONS;

  const key = crypto.pbkdf2Sync(
    password,
    salt,
    iterations,
    params?.keyLength || KEY_LENGTH,
    params?.digest || 'sha256'
  );

  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/**
 * Hashes a password using PBKDF2
 * @param password - Password to hash
 * @param salt - Optional salt
 * @returns Hash string
 */
export function hashPassword(password: string, salt?: Buffer): string {
  const saltBuffer = salt || crypto.randomBytes(SALT_LENGTH);
  const hash = crypto.pbkdf2Sync(
    password,
    saltBuffer,
    DEFAULT_ITERATIONS,
    KEY_LENGTH,
    'sha256'
  );

  return `${saltBuffer.toString('base64')}:${hash.toString('base64')}`;
}

/**
 * Verifies a password against a hash
 * @param password - Password to verify
 * @param hash - Hash to verify against
 * @returns Boolean indicating if password is correct
 */
export function verifyPassword(password: string, hash: string): boolean {
  const [saltB64, hashB64] = hash.split(':');
  const salt = Buffer.from(saltB64, 'base64');
  const originalHash = Buffer.from(hashB64, 'base64');

  const testHash = crypto.pbkdf2Sync(
    password,
    salt,
    DEFAULT_ITERATIONS,
    KEY_LENGTH,
    'sha256'
  );

  return crypto.timingSafeEqual(originalHash, testHash);
}

/**
 * Generates a secure random token
 * @param length - Token length in bytes
 * @returns Token string
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('base64url');
}

/**
 * Generates a session token
 * @returns Session token
 */
export function generateSessionToken(): string {
  return generateSecureToken(48);
}

/**
 * Evaluates password strength
 * @param password - Password to evaluate
 * @returns Password strength enum
 */
export function evaluatePasswordStrength(password: string): PasswordStrength {
  if (password.length < 8) return PasswordStrength.WEAK;

  let strength = 0;

  // Length check
  if (password.length >= 12) strength++;
  if (password.length >= 16) strength++;

  // Character variety
  if (/[a-z]/.test(password)) strength++;
  if (/[A-Z]/.test(password)) strength++;
  if (/[0-9]/.test(password)) strength++;
  if (/[^a-zA-Z0-9]/.test(password)) strength++;

  // Patterns (negative)
  if (/(.)\1{2,}/.test(password)) strength--;
  if (/^[0-9]+$/.test(password)) strength--;

  if (strength <= 2) return PasswordStrength.WEAK;
  if (strength <= 4) return PasswordStrength.MEDIUM;
  if (strength <= 6) return PasswordStrength.STRONG;
  return PasswordStrength.VERY_STRONG;
}

/**
 * Validates password requirements
 * @param password - Password to validate
 * @throws Error if password doesn't meet requirements
 */
export function validatePassword(password: string): void {
  if (!password || password.length < 8) {
    throw new Error('Password must be at least 8 characters long');
  }

  if (!/[a-z]/.test(password)) {
    throw new Error('Password must contain at least one lowercase letter');
  }

  if (!/[A-Z]/.test(password)) {
    throw new Error('Password must contain at least one uppercase letter');
  }

  if (!/[0-9]/.test(password)) {
    throw new Error('Password must contain at least one number');
  }

  const strength = evaluatePasswordStrength(password);
  if (strength === PasswordStrength.WEAK) {
    throw new Error('Password is too weak. Please use a stronger password.');
  }
}

/**
 * Generates a random password
 * @param length - Password length
 * @returns Generated password
 */
export function generateRandomPassword(length: number = 16): string {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const symbols = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  const allChars = lowercase + uppercase + numbers + symbols;

  let password = '';
  // Guarantee at least one character from each category using CSPRNG
  password += lowercase[crypto.randomInt(lowercase.length)];
  password += uppercase[crypto.randomInt(uppercase.length)];
  password += numbers[crypto.randomInt(numbers.length)];
  password += symbols[crypto.randomInt(symbols.length)];

  for (let i = password.length; i < length; i++) {
    password += allChars[crypto.randomInt(allChars.length)];
  }

  // Durstenfeld shuffle using crypto.randomInt for unbiased randomness
  const chars = password.split('');
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

/**
 * Derives a key from password
 * @param password - Password
 * @param salt - Salt buffer
 * @param iterations - Number of iterations
 * @returns Derived key
 */
export function deriveKey(
  password: string,
  salt: Buffer,
  iterations: number = DEFAULT_ITERATIONS
): Buffer {
  return crypto.pbkdf2Sync(password, salt, iterations, KEY_LENGTH, 'sha256');
}

/**
 * Creates a HMAC signature
 * @param data - Data to sign
 * @param key - Secret key
 * @returns HMAC signature
 */
export function createHMAC(data: string, key: string): string {
  return crypto.createHmac('sha256', key).update(data).digest('base64');
}

/**
 * Verifies a HMAC signature
 * @param data - Original data
 * @param signature - Signature to verify
 * @param key - Secret key
 * @returns Boolean indicating if signature is valid
 */
export function verifyHMAC(
  data: string,
  signature: string,
  key: string
): boolean {
  const expectedSignature = createHMAC(data, key);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}
