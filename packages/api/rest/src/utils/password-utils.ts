/**
 * @fileoverview Password utilities for authentication
 * @description Provides password hashing, verification, and strength validation
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { PasswordStrength } from '../types/auth-types';

/**
 * Default bcrypt salt rounds
 */
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);

/**
 * Minimum password length
 */
const PASSWORD_MIN_LENGTH = parseInt(process.env.PASSWORD_MIN_LENGTH || '8', 10);

/**
 * API key length in bytes
 */
const API_KEY_LENGTH = parseInt(process.env.API_KEY_LENGTH || '32', 10);

/**
 * API key prefix length for display
 */
const API_KEY_PREFIX_LENGTH = parseInt(process.env.API_KEY_PREFIX_LENGTH || '8', 10);

/**
 * Hash a password using bcrypt
 * @param password - Plain text password
 * @returns Promise<string> - Hashed password
 */
export async function hashPassword(password: string): Promise<string> {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    throw new Error(`Password must be at least ${PASSWORD_MIN_LENGTH} characters long`);
  }

  const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
  return bcrypt.hash(password, salt);
}

/**
 * Verify a password against a hash
 * @param password - Plain text password
 * @param hash - Hashed password
 * @returns Promise<boolean> - Whether password matches
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) {
    return false;
  }

  try {
    return await bcrypt.compare(password, hash);
  } catch (error) {
    console.error('Password verification error:', error);
    return false;
  }
}

/**
 * Generate a secure random API key
 * @returns string - Generated API key (base64 encoded)
 */
export function generateApiKey(): string {
  const randomBytes = crypto.randomBytes(API_KEY_LENGTH);
  return randomBytes.toString('base64').replace(/[+/=]/g, (char) => {
    switch (char) {
      case '+':
        return '-';
      case '/':
        return '_';
      case '=':
        return '';
      default:
        return char;
    }
  });
}

/**
 * Hash an API key using SHA-256
 * @param apiKey - Plain API key
 * @returns string - Hashed API key (hex)
 */
export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Extract prefix from API key for display
 * @param apiKey - Full API key
 * @returns string - API key prefix
 */
export function getApiKeyPrefix(apiKey: string): string {
  return apiKey.substring(0, API_KEY_PREFIX_LENGTH);
}

/**
 * Validate password strength
 * @param password - Password to validate
 * @returns PasswordStrength - Password strength level
 */
export function validatePasswordStrength(password: string): PasswordStrength {
  if (!password || password.length < PASSWORD_MIN_LENGTH) {
    return PasswordStrength.WEAK;
  }

  let strength = 0;

  // Length check
  if (password.length >= 12) {
    strength += 1;
  } else if (password.length >= 8) {
    strength += 0.5;
  }

  // Contains lowercase
  if (/[a-z]/.test(password)) {
    strength += 1;
  }

  // Contains uppercase
  if (/[A-Z]/.test(password)) {
    strength += 1;
  }

  // Contains numbers
  if (/[0-9]/.test(password)) {
    strength += 1;
  }

  // Contains special characters
  if (/[^a-zA-Z0-9]/.test(password)) {
    strength += 1;
  }

  // Determine strength level
  if (strength >= 4.5) {
    return PasswordStrength.VERY_STRONG;
  } else if (strength >= 3.5) {
    return PasswordStrength.STRONG;
  } else if (strength >= 2.5) {
    return PasswordStrength.MEDIUM;
  } else {
    return PasswordStrength.WEAK;
  }
}

/**
 * Generate a secure random token
 * @param length - Token length in bytes (default: 32)
 * @returns string - Generated token (hex encoded)
 */
export function generateSecureToken(length: number = 32): string {
  const randomBytes = crypto.randomBytes(length);
  return randomBytes.toString('hex');
}

/**
 * Generate a session token
 * @returns string - Generated session token
 */
export function generateSessionToken(): string {
  return generateSecureToken(48);
}

/**
 * Generate a refresh token
 * @returns string - Generated refresh token
 */
export function generateRefreshToken(): string {
  return generateSecureToken(64);
}

