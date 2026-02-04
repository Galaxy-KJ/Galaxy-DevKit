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
const AUTH_TAG_LENGTH = 16;
const DEFAULT_ITERATIONS = 100000;
const KEY_LENGTH = 32;

/**
 * Encrypts private key using AES-256-GCM with password
 * @param privateKey - Private key to encrypt
 * @param password - Password for encryption
 * @returns Encrypted string
 */
export function encryptPrivateKey(
  privateKey: string,
  password: string
): string {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);

  const key = crypto.pbkdf2Sync(
    password,
    salt,
    DEFAULT_ITERATIONS,
    KEY_LENGTH,
    'sha256'
  );

  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(privateKey, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    salt.toString('base64'),
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

/**
 * Decrypts AES-256-GCM encrypted private key
 * @param encryptedData - Encrypted data string
 * @param password - Password for decryption
 * @returns Decrypted private key
 */
export function decryptPrivateKey(
  encryptedData: string,
  password: string
): string {
  const [saltB64, ivB64, authTagB64, encryptedB64] = encryptedData.split(':');

  if (!saltB64 || !ivB64 || !authTagB64 || !encryptedB64) {
    throw new Error('Invalid encrypted data format');
  }

  const salt = Buffer.from(saltB64, 'base64');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const encrypted = Buffer.from(encryptedB64, 'base64');

  const key = crypto.pbkdf2Sync(
    password,
    salt,
    DEFAULT_ITERATIONS,
    KEY_LENGTH,
    'sha256'
  );

  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

/**
 * Encrypts any data with structured output
 * @param data - Data to encrypt
 * @param password - Password for encryption
 * @param params - Key derivation parameters
 * @returns Encrypted data object
 */
export function encryptData(
  data: string,
  password: string,
  params?: Partial<KeyDerivationParams>
): EncryptedData {
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
export function decryptData(
  encryptedData: EncryptedData,
  password: string,
  params?: Partial<KeyDerivationParams>
): string {
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
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += symbols[Math.floor(Math.random() * symbols.length)];

  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  return password
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('');
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
