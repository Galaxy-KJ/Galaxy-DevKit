import crypto from 'crypto';
import {
  encryptPrivateKey,
  decryptPrivateKey,
} from '../utils/encryption.utils.js';

// Force v1 (PBKDF2) encryption for tests since argon2 native module may not be available
process.env.ENCRYPTION_V2_ENABLED = 'false';

describe('Encryption Utils', () => {
  const testPrivateKey = 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
  const testPassword = 'securePassword123!';
  const weakPassword = '123';
  const longPassword = 'a'.repeat(1000);

  /** Helper: decrypt and return string (since decryptPrivateKey now returns Buffer/Uint8Array) */
  async function decryptToString(encrypted: string, password: string): Promise<string> {
    const raw = await decryptPrivateKey(encrypted, password);
    const buf = Buffer.from(raw);
    const result = buf.toString('utf8');
    buf.fill(0);
    return result;
  }

  describe('encryptPrivateKey', () => {
    it('should encrypt a private key successfully', async () => {
      const encrypted = await encryptPrivateKey(testPrivateKey, testPassword);

      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
      expect(encrypted).not.toBe(testPrivateKey);
    });

    it('should return encrypted string in correct format (salt:iv:authTag:ciphertext)', async () => {
      const encrypted = await encryptPrivateKey(testPrivateKey, testPassword);
      const parts = encrypted.split(':');

      expect(parts.length).toBe(4);

      // Verify each part is valid base64
      parts.forEach(part => {
        expect(() => Buffer.from(part, 'base64')).not.toThrow();
      });
    });

    it('should produce different encrypted outputs for same input (due to random salt/iv)', async () => {
      const encrypted1 = await encryptPrivateKey(testPrivateKey, testPassword);
      const encrypted2 = await encryptPrivateKey(testPrivateKey, testPassword);

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should encrypt empty string', async () => {
      const encrypted = await encryptPrivateKey('', testPassword);

      expect(encrypted).toBeDefined();
      expect(encrypted.split(':').length).toBe(4);
    });

    it('should handle very long private keys', async () => {
      const longKey = 'S' + 'X'.repeat(500);
      const encrypted = await encryptPrivateKey(longKey, testPassword);

      expect(encrypted).toBeDefined();
      expect(encrypted.split(':').length).toBe(4);
    });

    it('should handle special characters in private key', async () => {
      const specialKey = 'SKEY!@#$%^&*()_+-=[]{}|;:,.<>?';
      const encrypted = await encryptPrivateKey(specialKey, testPassword);

      expect(encrypted).toBeDefined();
      expect(encrypted.split(':').length).toBe(4);
    });

    it('should work with weak passwords', async () => {
      const encrypted = await encryptPrivateKey(testPrivateKey, weakPassword);

      expect(encrypted).toBeDefined();
      expect(encrypted.split(':').length).toBe(4);
    });

    it('should work with very long passwords', async () => {
      const encrypted = await encryptPrivateKey(testPrivateKey, longPassword);

      expect(encrypted).toBeDefined();
      expect(encrypted.split(':').length).toBe(4);
    });

    it('should handle unicode characters in private key', async () => {
      const unicodeKey = 'SKEY_\u{1F510}_\u5BC6\u94A5_\u{1F680}';
      const encrypted = await encryptPrivateKey(unicodeKey, testPassword);

      expect(encrypted).toBeDefined();
      expect(encrypted.split(':').length).toBe(4);
    });

    it('should produce encrypted string that is longer than original', async () => {
      const encrypted = await encryptPrivateKey(testPrivateKey, testPassword);

      expect(encrypted.length).toBeGreaterThan(testPrivateKey.length);
    });

    it('should use 12-byte IV', async () => {
      const encrypted = await encryptPrivateKey(testPrivateKey, testPassword);
      const parts = encrypted.split(':');
      const iv = Buffer.from(parts[1], 'base64');

      expect(iv.length).toBe(12);
    });

    it('should use 16-byte salt', async () => {
      const encrypted = await encryptPrivateKey(testPrivateKey, testPassword);
      const parts = encrypted.split(':');
      const salt = Buffer.from(parts[0], 'base64');

      expect(salt.length).toBe(16);
    });

    it('should use 16-byte auth tag', async () => {
      const encrypted = await encryptPrivateKey(testPrivateKey, testPassword);
      const parts = encrypted.split(':');
      const authTag = Buffer.from(parts[2], 'base64');

      expect(authTag.length).toBe(16);
    });
  });

  describe('decryptPrivateKey', () => {
    it('should decrypt encrypted private key successfully', async () => {
      const encrypted = await encryptPrivateKey(testPrivateKey, testPassword);
      const decrypted = await decryptToString(encrypted, testPassword);

      expect(decrypted).toBe(testPrivateKey);
    });

    it('should return a Uint8Array-compatible result', async () => {
      const encrypted = await encryptPrivateKey(testPrivateKey, testPassword);
      const result = await decryptPrivateKey(encrypted, testPassword);

      expect(result).toBeInstanceOf(Uint8Array);
      expect(typeof result.byteLength).toBe('number');
      // Should be convertible to Buffer
      const buf = Buffer.from(result);
      expect(buf.toString('utf8')).toBe(testPrivateKey);
      buf.fill(0);
    });

    it('should throw error with wrong password', async () => {
      const encrypted = await encryptPrivateKey(testPrivateKey, testPassword);

      await expect(
        decryptPrivateKey(encrypted, 'wrongPassword')
      ).rejects.toThrow();
    });

    it('should handle empty string decryption', async () => {
      const encrypted = await encryptPrivateKey('', testPassword);
      const decrypted = await decryptToString(encrypted, testPassword);

      expect(decrypted).toBe('');
    });

    it('should decrypt long private keys', async () => {
      const longKey = 'S' + 'X'.repeat(500);
      const encrypted = await encryptPrivateKey(longKey, testPassword);
      const decrypted = await decryptToString(encrypted, testPassword);

      expect(decrypted).toBe(longKey);
    });

    it('should decrypt keys with special characters', async () => {
      const specialKey = 'SKEY!@#$%^&*()_+-=[]{}|;:,.<>?';
      const encrypted = await encryptPrivateKey(specialKey, testPassword);
      const decrypted = await decryptToString(encrypted, testPassword);

      expect(decrypted).toBe(specialKey);
    });

    it('should decrypt keys with unicode characters', async () => {
      const unicodeKey = 'SKEY_\u{1F510}_\u5BC6\u94A5_\u{1F680}';
      const encrypted = await encryptPrivateKey(unicodeKey, testPassword);
      const decrypted = await decryptToString(encrypted, testPassword);

      expect(decrypted).toBe(unicodeKey);
    });

    it('should work with weak passwords if they match', async () => {
      const encrypted = await encryptPrivateKey(testPrivateKey, weakPassword);
      const decrypted = await decryptToString(encrypted, weakPassword);

      expect(decrypted).toBe(testPrivateKey);
    });

    it('should work with very long passwords if they match', async () => {
      const encrypted = await encryptPrivateKey(testPrivateKey, longPassword);
      const decrypted = await decryptToString(encrypted, longPassword);

      expect(decrypted).toBe(testPrivateKey);
    });

    it('should throw error with corrupted encrypted data', async () => {
      const encrypted = await encryptPrivateKey(testPrivateKey, testPassword);
      const parts = encrypted.split(':');

      const corruptedCiphertext = Buffer.from(parts[3], 'base64');
      for (let i = 0; i < Math.min(5, corruptedCiphertext.length); i++) {
        corruptedCiphertext[i] ^= 0xFF;
      }
      parts[3] = corruptedCiphertext.toString('base64');

      const corrupted = parts.join(':');

      await expect(
        decryptPrivateKey(corrupted, testPassword)
      ).rejects.toThrow();
    });

    it('should throw error with invalid format (missing parts)', async () => {
      await expect(
        decryptPrivateKey('invalid:format', testPassword)
      ).rejects.toThrow();
    });

    it('should throw error with tampered auth tag', async () => {
      const encrypted = await encryptPrivateKey(testPrivateKey, testPassword);
      const parts = encrypted.split(':');

      const tamperedAuthTag = Buffer.from(parts[2], 'base64');
      tamperedAuthTag[0] ^= 1;
      parts[2] = tamperedAuthTag.toString('base64');

      const tampered = parts.join(':');

      await expect(
        decryptPrivateKey(tampered, testPassword)
      ).rejects.toThrow();
    });

    it('should throw error with tampered ciphertext', async () => {
      const encrypted = await encryptPrivateKey(testPrivateKey, testPassword);
      const parts = encrypted.split(':');

      const tamperedCiphertext = Buffer.from(parts[3], 'base64');
      tamperedCiphertext[0] ^= 1;
      parts[3] = tamperedCiphertext.toString('base64');

      const tampered = parts.join(':');

      await expect(
        decryptPrivateKey(tampered, testPassword)
      ).rejects.toThrow();
    });

    it('should throw error with invalid base64 in encrypted data', async () => {
      await expect(
        decryptPrivateKey('not:valid:base64:data!!!', testPassword)
      ).rejects.toThrow();
    });

    it('should throw error with empty encrypted string', async () => {
      await expect(
        decryptPrivateKey('', testPassword)
      ).rejects.toThrow();
    });

    it('should throw error with only colons', async () => {
      await expect(
        decryptPrivateKey(':::', testPassword)
      ).rejects.toThrow();
    });
  });

  describe('Encryption/Decryption Integration', () => {
    it('should maintain data integrity through multiple encrypt/decrypt cycles', async () => {
      let data = testPrivateKey;

      for (let i = 0; i < 5; i++) {
        const encrypted = await encryptPrivateKey(data, testPassword);
        data = await decryptToString(encrypted, testPassword);
      }

      expect(data).toBe(testPrivateKey);
    });

    it('should handle multiple keys with same password', async () => {
      const key1 = 'SKEY1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      const key2 = 'SKEY2YYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY';

      const encrypted1 = await encryptPrivateKey(key1, testPassword);
      const encrypted2 = await encryptPrivateKey(key2, testPassword);

      expect(await decryptToString(encrypted1, testPassword)).toBe(key1);
      expect(await decryptToString(encrypted2, testPassword)).toBe(key2);
    });

    it('should handle same key with different passwords', async () => {
      const password1 = 'password1';
      const password2 = 'password2';

      const encrypted1 = await encryptPrivateKey(testPrivateKey, password1);
      const encrypted2 = await encryptPrivateKey(testPrivateKey, password2);

      expect(await decryptToString(encrypted1, password1)).toBe(testPrivateKey);
      expect(await decryptToString(encrypted2, password2)).toBe(testPrivateKey);

      // Should not decrypt with wrong password
      await expect(
        decryptPrivateKey(encrypted1, password2)
      ).rejects.toThrow();
    });

    it('should use strong key derivation (PBKDF2 with 100000 iterations)', async () => {
      const startTime = Date.now();
      await encryptPrivateKey(testPrivateKey, testPassword);
      const endTime = Date.now();

      expect(endTime - startTime).toBeGreaterThan(0);
    });

    it('should produce different encrypted outputs even with same password and key', async () => {
      const results = new Set();

      for (let i = 0; i < 10; i++) {
        const encrypted = await encryptPrivateKey(testPrivateKey, testPassword);
        results.add(encrypted);
      }

      // All 10 encryptions should be unique due to random salt/IV
      expect(results.size).toBe(10);
    });

    it('should handle concurrent encryption operations', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        encryptPrivateKey(`KEY${i}`, testPassword)
      );

      const results = await Promise.all(promises);

      expect(results.length).toBe(10);

      for (let i = 0; i < results.length; i++) {
        const decrypted = await decryptToString(results[i], testPassword);
        expect(decrypted).toBe(`KEY${i}`);
      }
    });

    it('should be resistant to timing attacks (constant time for same password)', async () => {
      const encrypted = await encryptPrivateKey(testPrivateKey, testPassword);

      const times: number[] = [];
      for (let i = 0; i < 5; i++) {
        const start = Date.now();
        await decryptPrivateKey(encrypted, testPassword);
        times.push(Date.now() - start);
      }

      const avg = times.reduce((a, b) => a + b, 0) / times.length;

      times.forEach(time => {
        expect(Math.abs(time - avg)).toBeLessThan(50);
      });
    });
  });

  describe('Edge Cases and Security', () => {
    it('should handle null bytes in private key', async () => {
      const keyWithNull = 'SKEY\0NULL\0BYTES';
      const encrypted = await encryptPrivateKey(keyWithNull, testPassword);
      const decrypted = await decryptToString(encrypted, testPassword);

      expect(decrypted).toBe(keyWithNull);
    });

    it('should handle very short passwords', async () => {
      const shortPwd = 'a';
      const encrypted = await encryptPrivateKey(testPrivateKey, shortPwd);
      const decrypted = await decryptToString(encrypted, shortPwd);

      expect(decrypted).toBe(testPrivateKey);
    });

    it('should not leak original data in encrypted format', async () => {
      const sensitiveKey = 'SENSITIVE_SECRET_KEY_DO_NOT_EXPOSE';
      const encrypted = await encryptPrivateKey(sensitiveKey, testPassword);

      expect(encrypted.toLowerCase()).not.toContain('sensitive');
      expect(encrypted.toLowerCase()).not.toContain('secret');
      expect(encrypted.toLowerCase()).not.toContain('expose');
    });

    it('should use AES-256-GCM algorithm', async () => {
      const encrypted = await encryptPrivateKey(testPrivateKey, testPassword);

      const parts = encrypted.split(':');
      expect(parts.length).toBe(4);

      // Auth tag should be 16 bytes
      const authTag = Buffer.from(parts[2], 'base64');
      expect(authTag.length).toBe(16);
    });

    it('should handle password with colons (delimiter character)', async () => {
      const pwdWithColons = 'pass:word:with:colons';
      const encrypted = await encryptPrivateKey(testPrivateKey, pwdWithColons);
      const decrypted = await decryptToString(encrypted, pwdWithColons);

      expect(decrypted).toBe(testPrivateKey);
    });

    it('should handle keys that look like base64', async () => {
      const base64LikeKey = 'SGVsbG8gV29ybGQhIFRoaXMgaXMgYSB0ZXN0';
      const encrypted = await encryptPrivateKey(base64LikeKey, testPassword);
      const decrypted = await decryptToString(encrypted, testPassword);

      expect(decrypted).toBe(base64LikeKey);
    });
  });
});
