/**
 * @fileoverview Enhanced encryption utilities for invisible wallet
 * @description Advanced encryption, hashing, and security utilities
 * @author @ryzen_xp
 * @version 1.0.0
 * @since 2024-12-01
 */
import { EncryptedData, KeyDerivationParams, PasswordStrength } from '../types/wallet.types.js';
/**
 * Checks if Argon2 native module is available
 */
export declare function isArgon2Available(): boolean;
/**
 * Encrypts private key using AES-256-GCM.
 * When ENCRYPTION_V2_ENABLED=true (default) and Argon2 is available, uses Argon2id KDF
 * and outputs v2 format: `v2:salt:iv:authTag:argon2Params:ciphertext`.
 * Otherwise falls back to PBKDF2 with v1 format: `salt:iv:authTag:ciphertext`.
 * @param privateKey - Private key to encrypt
 * @param password - Password for encryption
 * @returns Encrypted string
 */
export declare function encryptPrivateKey(privateKey: string, password: string): Promise<string>;
/**
 * Decrypts AES-256-GCM encrypted private key.
 * Auto-detects format: v2 (Argon2id) or v1 (PBKDF2).
 * Returns Buffer to enable zeroization by the caller.
 * @param encryptedData - Encrypted data string
 * @param password - Password for decryption
 * @returns Decrypted private key as Buffer
 */
export declare function decryptPrivateKey(encryptedData: string, password: string): Promise<Buffer>;
/**
 * Decrypts private key and returns as string (legacy convenience wrapper).
 * Prefer withDecryptedKey() for new code — it handles Buffer zeroization.
 * @param encryptedData - Encrypted data string
 * @param password - Password for decryption
 * @returns Decrypted private key as string
 */
export declare function decryptPrivateKeyToString(encryptedData: string, password: string): Promise<string>;
/**
 * Safely decrypts a key, passes it to a callback, and zeroizes the buffer.
 * All consumers should use this pattern for key operations.
 * @param encryptedKey - Encrypted key data
 * @param password - Decryption password
 * @param callback - Function receiving the key Buffer
 * @returns Result of the callback
 */
export declare function withDecryptedKey<T>(encryptedKey: string, password: string, callback: (keyBuffer: Buffer) => T | Promise<T>): Promise<T>;
/**
 * Encrypts any data with structured output
 * @param data - Data to encrypt
 * @param password - Password for encryption
 * @param params - Key derivation parameters
 * @returns Encrypted data object
 */
export declare function encryptData(data: string, password: string, params?: Partial<KeyDerivationParams>): Promise<EncryptedData>;
/**
 * Decrypts structured encrypted data
 * @param encryptedData - Encrypted data object
 * @param password - Password for decryption
 * @param params - Key derivation parameters
 * @returns Decrypted data
 */
export declare function decryptData(encryptedData: EncryptedData, password: string, params?: Partial<KeyDerivationParams>): Promise<string>;
/**
 * Hashes a password using PBKDF2
 * @param password - Password to hash
 * @param salt - Optional salt
 * @returns Hash string
 */
export declare function hashPassword(password: string, salt?: Buffer): string;
/**
 * Verifies a password against a hash
 * @param password - Password to verify
 * @param hash - Hash to verify against
 * @returns Boolean indicating if password is correct
 */
export declare function verifyPassword(password: string, hash: string): boolean;
/**
 * Generates a secure random token
 * @param length - Token length in bytes
 * @returns Token string
 */
export declare function generateSecureToken(length?: number): string;
/**
 * Generates a session token
 * @returns Session token
 */
export declare function generateSessionToken(): string;
/**
 * Evaluates password strength
 * @param password - Password to evaluate
 * @returns Password strength enum
 */
export declare function evaluatePasswordStrength(password: string): PasswordStrength;
/**
 * Validates password requirements
 * @param password - Password to validate
 * @throws Error if password doesn't meet requirements
 */
export declare function validatePassword(password: string): void;
/**
 * Generates a random password
 * @param length - Password length
 * @returns Generated password
 */
export declare function generateRandomPassword(length?: number): string;
/**
 * Derives a key from password
 * @param password - Password
 * @param salt - Salt buffer
 * @param iterations - Number of iterations
 * @returns Derived key
 */
export declare function deriveKey(password: string, salt: Buffer, iterations?: number): Buffer;
/**
 * Creates a HMAC signature
 * @param data - Data to sign
 * @param key - Secret key
 * @returns HMAC signature
 */
export declare function createHMAC(data: string, key: string): string;
/**
 * Verifies a HMAC signature
 * @param data - Original data
 * @param signature - Signature to verify
 * @param key - Secret key
 * @returns Boolean indicating if signature is valid
 */
export declare function verifyHMAC(data: string, signature: string, key: string): boolean;
//# sourceMappingURL=encryption.utils.d.ts.map