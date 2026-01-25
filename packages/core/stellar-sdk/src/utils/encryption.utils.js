"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.encryptPrivateKey = encryptPrivateKey;
exports.decryptPrivateKey = decryptPrivateKey;
const crypto_1 = __importDefault(require("crypto"));
const ALGO = 'aes-256-gcm';
const IV_LENGTH = 12;
/**
 * Encrypts text using AES-256-GCM with a password
 */
function encryptPrivateKey(privateKey, password) {
    const salt = crypto_1.default.randomBytes(16);
    const iv = crypto_1.default.randomBytes(IV_LENGTH);
    // Derive 256-bit key from password using PBKDF2
    const key = crypto_1.default.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    const cipher = crypto_1.default.createCipheriv(ALGO, key, iv);
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
function decryptPrivateKey(encryptedData, password) {
    const [saltB64, ivB64, authTagB64, encryptedB64] = encryptedData.split(':');
    const salt = Buffer.from(saltB64, 'base64');
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');
    const encrypted = Buffer.from(encryptedB64, 'base64');
    const key = crypto_1.default.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
    const decipher = crypto_1.default.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
    ]);
    return decrypted.toString('utf8');
}
//# sourceMappingURL=encryption.utils.js.map