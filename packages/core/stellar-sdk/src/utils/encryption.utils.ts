/**
 * @fileoverview Re-exports encryption utilities from the canonical source
 * @description Delegates to @galaxy-kj/core-invisible-wallet encryption utils
 *   to avoid duplicate implementations and ensure consistent Argon2id/PBKDF2 handling.
 */

export {
  encryptPrivateKey,
  decryptPrivateKey,
  decryptPrivateKeyToString,
  withDecryptedKey,
} from '../../../invisible-wallet/src/utils/encryption.utils.js';
