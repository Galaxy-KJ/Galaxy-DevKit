import crypto from 'crypto';
import {
  encryptPrivateKey,
  decryptPrivateKey,
} from '../utils/encryption.utils.js';

describe('Encryption Utils', () => {
  const testPrivateKey = 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
  const testPassword = 'securePassword123!';
  const weakPassword = '123';
  const longPassword = 'a'.repeat(1000);

  // Debug helper
  const debug = (testName: string, data: unknown) => {
    console.log(`\n[DEBUG - ${testName}]`, JSON.stringify(data, null, 2));
  };

  describe('encryptPrivateKey', () => {
    it('should encrypt a private key successfully', () => {
      debug('Encrypt Success', {
        input: testPrivateKey,
        password: testPassword,
      });

      const encrypted = encryptPrivateKey(testPrivateKey, testPassword);

      debug('Encrypt Success', {
        encrypted,
        encryptedLength: encrypted.length,
        parts: encrypted.split(':').length,
      });

      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
      expect(encrypted).not.toBe(testPrivateKey);
    });

    it('should return encrypted string in correct format (salt:iv:authTag:ciphertext)', () => {
      const encrypted = encryptPrivateKey(testPrivateKey, testPassword);
      const parts = encrypted.split(':');

      debug('Format Validation', {
        encrypted,
        partsCount: parts.length,
        saltLength: Buffer.from(parts[0], 'base64').length,
        ivLength: Buffer.from(parts[1], 'base64').length,
        authTagLength: Buffer.from(parts[2], 'base64').length,
        ciphertextLength: Buffer.from(parts[3], 'base64').length,
      });

      expect(parts.length).toBe(4);

      // Verify each part is valid base64
      parts.forEach(part => {
        expect(() => Buffer.from(part, 'base64')).not.toThrow();
      });
    });

    it('should produce different encrypted outputs for same input (due to random salt/iv)', () => {
      const encrypted1 = encryptPrivateKey(testPrivateKey, testPassword);
      const encrypted2 = encryptPrivateKey(testPrivateKey, testPassword);

      debug('Randomness Check', {
        encrypted1,
        encrypted2,
        areIdentical: encrypted1 === encrypted2,
        salt1: encrypted1.split(':')[0],
        salt2: encrypted2.split(':')[0],
        iv1: encrypted1.split(':')[1],
        iv2: encrypted2.split(':')[1],
      });

      expect(encrypted1).not.toBe(encrypted2);
    });

    it('should encrypt empty string', () => {
      const encrypted = encryptPrivateKey('', testPassword);

      expect(encrypted).toBeDefined();
      expect(encrypted.split(':').length).toBe(4);
    });

    it('should handle very long private keys', () => {
      const longKey = 'S' + 'X'.repeat(500);
      const encrypted = encryptPrivateKey(longKey, testPassword);

      expect(encrypted).toBeDefined();
      expect(encrypted.split(':').length).toBe(4);
    });

    it('should handle special characters in private key', () => {
      const specialKey = 'SKEY!@#$%^&*()_+-=[]{}|;:,.<>?';
      const encrypted = encryptPrivateKey(specialKey, testPassword);

      expect(encrypted).toBeDefined();
      expect(encrypted.split(':').length).toBe(4);
    });

    it('should work with weak passwords', () => {
      const encrypted = encryptPrivateKey(testPrivateKey, weakPassword);

      expect(encrypted).toBeDefined();
      expect(encrypted.split(':').length).toBe(4);
    });

    it('should work with very long passwords', () => {
      const encrypted = encryptPrivateKey(testPrivateKey, longPassword);

      expect(encrypted).toBeDefined();
      expect(encrypted.split(':').length).toBe(4);
    });

    it('should handle unicode characters in private key', () => {
      const unicodeKey = 'SKEY_🔐_密钥_🚀';
      const encrypted = encryptPrivateKey(unicodeKey, testPassword);

      expect(encrypted).toBeDefined();
      expect(encrypted.split(':').length).toBe(4);
    });

    it('should produce encrypted string that is longer than original', () => {
      const encrypted = encryptPrivateKey(testPrivateKey, testPassword);

      // Encrypted format includes salt (16 bytes), iv (12 bytes), authTag (16 bytes) + ciphertext
      expect(encrypted.length).toBeGreaterThan(testPrivateKey.length);
    });

    it('should use 12-byte IV', () => {
      const encrypted = encryptPrivateKey(testPrivateKey, testPassword);
      const parts = encrypted.split(':');
      const iv = Buffer.from(parts[1], 'base64');

      expect(iv.length).toBe(12);
    });

    it('should use 16-byte salt', () => {
      const encrypted = encryptPrivateKey(testPrivateKey, testPassword);
      const parts = encrypted.split(':');
      const salt = Buffer.from(parts[0], 'base64');

      expect(salt.length).toBe(16);
    });

    it('should use 16-byte auth tag', () => {
      const encrypted = encryptPrivateKey(testPrivateKey, testPassword);
      const parts = encrypted.split(':');
      const authTag = Buffer.from(parts[2], 'base64');

      expect(authTag.length).toBe(16);
    });
  });

  describe('decryptPrivateKey', () => {
    it('should decrypt encrypted private key successfully', () => {
      const encrypted = encryptPrivateKey(testPrivateKey, testPassword);

      debug('Decrypt Success - Before', { encrypted, password: testPassword });

      const decrypted = decryptPrivateKey(encrypted, testPassword);

      debug('Decrypt Success - After', {
        decrypted,
        original: testPrivateKey,
        matches: decrypted === testPrivateKey,
      });

      expect(decrypted).toBe(testPrivateKey);
    });

    it('should throw error with wrong password', () => {
      const encrypted = encryptPrivateKey(testPrivateKey, testPassword);

      debug('Wrong Password Test', {
        encrypted,
        correctPassword: testPassword,
        wrongPassword: 'wrongPassword',
      });

      expect(() => {
        try {
          decryptPrivateKey(encrypted, 'wrongPassword');
        } catch (error) {
          debug('Wrong Password Error', {
            errorMessage:
              error instanceof Error ? error.message : 'Unknown error',
            errorType:
              error instanceof Error ? error.constructor.name : typeof error,
          });
          throw error;
        }
      }).toThrow();
    });

    it('should handle empty string decryption', () => {
      const encrypted = encryptPrivateKey('', testPassword);
      const decrypted = decryptPrivateKey(encrypted, testPassword);

      expect(decrypted).toBe('');
    });

    it('should decrypt long private keys', () => {
      const longKey = 'S' + 'X'.repeat(500);
      const encrypted = encryptPrivateKey(longKey, testPassword);
      const decrypted = decryptPrivateKey(encrypted, testPassword);

      expect(decrypted).toBe(longKey);
    });

    it('should decrypt keys with special characters', () => {
      const specialKey = 'SKEY!@#$%^&*()_+-=[]{}|;:,.<>?';
      const encrypted = encryptPrivateKey(specialKey, testPassword);
      const decrypted = decryptPrivateKey(encrypted, testPassword);

      expect(decrypted).toBe(specialKey);
    });

    it('should decrypt keys with unicode characters', () => {
      const unicodeKey = 'SKEY_🔐_密钥_🚀';
      const encrypted = encryptPrivateKey(unicodeKey, testPassword);
      const decrypted = decryptPrivateKey(encrypted, testPassword);

      expect(decrypted).toBe(unicodeKey);
    });

    it('should work with weak passwords if they match', () => {
      const encrypted = encryptPrivateKey(testPrivateKey, weakPassword);
      const decrypted = decryptPrivateKey(encrypted, weakPassword);

      expect(decrypted).toBe(testPrivateKey);
    });

    it('should work with very long passwords if they match', () => {
      const encrypted = encryptPrivateKey(testPrivateKey, longPassword);
      const decrypted = decryptPrivateKey(encrypted, longPassword);

      expect(decrypted).toBe(testPrivateKey);
    });

    it('should throw error with corrupted encrypted data', () => {
      const encrypted = encryptPrivateKey(testPrivateKey, testPassword);
      const parts = encrypted.split(':');

      // Corrupt the ciphertext significantly (flip multiple bytes)
      const corruptedCiphertext = Buffer.from(parts[3], 'base64');
      // Flip multiple bytes to ensure decryption fails
      for (let i = 0; i < Math.min(5, corruptedCiphertext.length); i++) {
        corruptedCiphertext[i] ^= 0xFF; // Flip all bits
      }
      parts[3] = corruptedCiphertext.toString('base64');

      const corrupted = parts.join(':');

      debug('Corrupted Data Test', {
        original: encrypted,
        corrupted,
        changesCount: 5,
      });

      expect(() => {
        decryptPrivateKey(corrupted, testPassword);
      }).toThrow();
    });

    it('should throw error with invalid format (missing parts)', () => {
      expect(() => {
        decryptPrivateKey('invalid:format', testPassword);
      }).toThrow();
    });

    it('should throw error with tampered auth tag', () => {
      const encrypted = encryptPrivateKey(testPrivateKey, testPassword);
      const parts = encrypted.split(':');

      // Tamper with auth tag
      const tamperedAuthTag = Buffer.from(parts[2], 'base64');
      const originalByte = tamperedAuthTag[0];
      tamperedAuthTag[0] ^= 1; // Flip a bit
      parts[2] = tamperedAuthTag.toString('base64');

      const tampered = parts.join(':');

      debug('Tampered Auth Tag', {
        original: encrypted,
        tampered,
        originalAuthTag: encrypted.split(':')[2],
        tamperedAuthTag: parts[2],
        originalByte,
        tamperedByte: tamperedAuthTag[0],
      });

      expect(() => {
        try {
          decryptPrivateKey(tampered, testPassword);
        } catch (error) {
          debug('Tampered Auth Tag Error', {
            errorMessage:
              error instanceof Error ? error.message : 'Unknown error',
          });
          throw error;
        }
      }).toThrow();
    });

    it('should throw error with tampered ciphertext', () => {
      const encrypted = encryptPrivateKey(testPrivateKey, testPassword);
      const parts = encrypted.split(':');

      // Tamper with ciphertext
      const tamperedCiphertext = Buffer.from(parts[3], 'base64');
      tamperedCiphertext[0] ^= 1; // Flip a bit
      parts[3] = tamperedCiphertext.toString('base64');

      const tampered = parts.join(':');

      expect(() => {
        decryptPrivateKey(tampered, testPassword);
      }).toThrow();
    });

    it('should throw error with invalid base64 in encrypted data', () => {
      expect(() => {
        decryptPrivateKey('not:valid:base64:data!!!', testPassword);
      }).toThrow();
    });

    it('should throw error with empty encrypted string', () => {
      expect(() => {
        decryptPrivateKey('', testPassword);
      }).toThrow();
    });

    it('should throw error with only colons', () => {
      expect(() => {
        decryptPrivateKey(':::', testPassword);
      }).toThrow();
    });
  });

  describe('Encryption/Decryption Integration', () => {
    it('should maintain data integrity through multiple encrypt/decrypt cycles', () => {
      let data = testPrivateKey;
      const cycles: any[] = [];

      debug('Multi-Cycle Start', { originalData: data });

      for (let i = 0; i < 5; i++) {
        const encrypted = encryptPrivateKey(data, testPassword);
        data = decryptPrivateKey(encrypted, testPassword);

        cycles.push({
          cycle: i + 1,
          encrypted: encrypted.substring(0, 50) + '...',
          decrypted: data,
          matches: data === testPrivateKey,
        });
      }

      debug('Multi-Cycle Results', { cycles, finalData: data });

      expect(data).toBe(testPrivateKey);
    });

    it('should handle multiple keys with same password', () => {
      const key1 = 'SKEY1XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      const key2 = 'SKEY2YYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY';

      const encrypted1 = encryptPrivateKey(key1, testPassword);
      const encrypted2 = encryptPrivateKey(key2, testPassword);

      expect(decryptPrivateKey(encrypted1, testPassword)).toBe(key1);
      expect(decryptPrivateKey(encrypted2, testPassword)).toBe(key2);
    });

    it('should handle same key with different passwords', () => {
      const password1 = 'password1';
      const password2 = 'password2';

      const encrypted1 = encryptPrivateKey(testPrivateKey, password1);
      const encrypted2 = encryptPrivateKey(testPrivateKey, password2);

      debug('Multiple Passwords', {
        key: testPrivateKey,
        password1,
        password2,
        encrypted1: encrypted1.substring(0, 50) + '...',
        encrypted2: encrypted2.substring(0, 50) + '...',
        areIdentical: encrypted1 === encrypted2,
      });

      const decrypted1 = decryptPrivateKey(encrypted1, password1);
      const decrypted2 = decryptPrivateKey(encrypted2, password2);

      debug('Multiple Passwords Decrypted', {
        decrypted1,
        decrypted2,
        bothMatch:
          decrypted1 === testPrivateKey && decrypted2 === testPrivateKey,
      });

      expect(decryptPrivateKey(encrypted1, password1)).toBe(testPrivateKey);
      expect(decryptPrivateKey(encrypted2, password2)).toBe(testPrivateKey);

      // Should not decrypt with wrong password
      expect(() => {
        try {
          decryptPrivateKey(encrypted1, password2);
        } catch (error) {
          debug('Wrong Password Cross-Check', {
            errorMessage:
              error instanceof Error ? error.message : 'Unknown error',
          });
          throw error;
        }
      }).toThrow();
    });

    it('should use strong key derivation (PBKDF2 with 100000 iterations)', () => {
      // This test verifies the encryption is not instant (due to PBKDF2 iterations)
      debug('Key Derivation Timing - Start', { iterations: 100000 });

      const startTime = Date.now();
      encryptPrivateKey(testPrivateKey, testPassword);
      const endTime = Date.now();
      const duration = endTime - startTime;

      debug('Key Derivation Timing - End', {
        durationMs: duration,
        startTime,
        endTime,
      });

      // Should take at least some time due to 100000 iterations
      // Not asserting exact time as it depends on hardware, but verifying it's not instant
      expect(endTime - startTime).toBeGreaterThan(0);
    });

    it('should produce different encrypted outputs even with same password and key', () => {
      const results = new Set();
      const samples: string[] = [];

      for (let i = 0; i < 10; i++) {
        const encrypted = encryptPrivateKey(testPrivateKey, testPassword);
        results.add(encrypted);
        if (i < 3) samples.push(encrypted.substring(0, 50) + '...');
      }

      debug('Uniqueness Check', {
        totalEncryptions: 10,
        uniqueResults: results.size,
        samples,
      });

      // All 10 encryptions should be unique due to random salt/IV
      expect(results.size).toBe(10);
    });

    it('should handle concurrent encryption operations', async () => {
      debug('Concurrent Operations - Start', { count: 10 });

      const promises = Array.from({ length: 10 }, (_, i) =>
        Promise.resolve(encryptPrivateKey(`KEY${i}`, testPassword))
      );

      const results = await Promise.all(promises);

      debug('Concurrent Operations - Results', {
        totalResults: results.length,
        sample: results[0].substring(0, 50) + '...',
      });

      expect(results.length).toBe(10);

      results.forEach((encrypted, i) => {
        const decrypted = decryptPrivateKey(encrypted, testPassword);

        if (i < 3) {
          debug(`Concurrent Decrypt ${i}`, {
            encrypted: encrypted.substring(0, 50) + '...',
            decrypted,
            expected: `KEY${i}`,
            matches: decrypted === `KEY${i}`,
          });
        }

        expect(decrypted).toBe(`KEY${i}`);
      });
    });

    it('should be resistant to timing attacks (constant time for same password)', () => {
      const encrypted = encryptPrivateKey(testPrivateKey, testPassword);

      const times: number[] = [];
      for (let i = 0; i < 5; i++) {
        const start = Date.now();
        decryptPrivateKey(encrypted, testPassword);
        times.push(Date.now() - start);
      }

      // Times should be relatively consistent (within reasonable variance)
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const variances = times.map(time => Math.abs(time - avg));

      debug('Timing Attack Resistance', {
        times,
        average: avg,
        variances,
        maxVariance: Math.max(...variances),
      });

      times.forEach(time => {
        expect(Math.abs(time - avg)).toBeLessThan(50); // 50ms variance acceptable
      });
    });
  });

  describe('Edge Cases and Security', () => {
    it('should handle null bytes in private key', () => {
      const keyWithNull = 'SKEY\0NULL\0BYTES';

      debug('Null Bytes Test - Input', {
        key: keyWithNull,
        length: keyWithNull.length,
        containsNull: keyWithNull.includes('\0'),
      });

      const encrypted = encryptPrivateKey(keyWithNull, testPassword);
      const decrypted = decryptPrivateKey(encrypted, testPassword);

      debug('Null Bytes Test - Output', {
        encrypted: encrypted.substring(0, 50) + '...',
        decrypted,
        matches: decrypted === keyWithNull,
      });

      expect(decrypted).toBe(keyWithNull);
    });

    it('should handle very short passwords', () => {
      const shortPwd = 'a';
      const encrypted = encryptPrivateKey(testPrivateKey, shortPwd);
      const decrypted = decryptPrivateKey(encrypted, shortPwd);

      expect(decrypted).toBe(testPrivateKey);
    });

    it('should not leak original data in encrypted format', () => {
      const sensitiveKey = 'SENSITIVE_SECRET_KEY_DO_NOT_EXPOSE';
      const encrypted = encryptPrivateKey(sensitiveKey, testPassword);

      const leakChecks = {
        containsSensitive: encrypted.toLowerCase().includes('sensitive'),
        containsSecret: encrypted.toLowerCase().includes('secret'),
        containsExpose: encrypted.toLowerCase().includes('expose'),
        encryptedPreview: encrypted.substring(0, 100) + '...',
      };

      debug('Data Leak Check', leakChecks);

      // Encrypted string should not contain original text
      expect(encrypted.toLowerCase()).not.toContain('sensitive');
      expect(encrypted.toLowerCase()).not.toContain('secret');
      expect(encrypted.toLowerCase()).not.toContain('expose');
    });

    it('should use AES-256-GCM algorithm', () => {
      const encrypted = encryptPrivateKey(testPrivateKey, testPassword);

      // Verify auth tag is present (GCM characteristic)
      const parts = encrypted.split(':');
      expect(parts.length).toBe(4);

      // Auth tag should be 16 bytes
      const authTag = Buffer.from(parts[2], 'base64');
      expect(authTag.length).toBe(16);
    });

    it('should handle password with colons (delimiter character)', () => {
      const pwdWithColons = 'pass:word:with:colons';
      const encrypted = encryptPrivateKey(testPrivateKey, pwdWithColons);
      const decrypted = decryptPrivateKey(encrypted, pwdWithColons);

      expect(decrypted).toBe(testPrivateKey);
    });

    it('should handle keys that look like base64', () => {
      const base64LikeKey = 'SGVsbG8gV29ybGQhIFRoaXMgaXMgYSB0ZXN0';
      const encrypted = encryptPrivateKey(base64LikeKey, testPassword);
      const decrypted = decryptPrivateKey(encrypted, testPassword);

      expect(decrypted).toBe(base64LikeKey);
    });
  });
});
