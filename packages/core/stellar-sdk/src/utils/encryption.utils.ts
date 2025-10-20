import crypto from 'crypto';

const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12; 

/**
 * Encrypts text using AES-256-GCM with a password
 */
export function encryptPrivateKey(
  privateKey: string,
  password: string
): string {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(IV_LENGTH);

  // Derive 256-bit key from password using PBKDF2
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');

  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(privateKey, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Format: salt:iv:authTag:ciphertext (Base64)
  return [
    salt.toString('base64'),
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

/**
 * Decrypts AES-256-GCM encrypted private key
 */
export function decryptPrivateKey(
  encryptedData: string,
  password: string
): string {
  const [saltB64, ivB64, authTagB64, encryptedB64] = encryptedData.split(':');

  const salt = Buffer.from(saltB64, 'base64');
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const encrypted = Buffer.from(encryptedB64, 'base64');

  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');

  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
