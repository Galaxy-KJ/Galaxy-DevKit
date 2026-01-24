/**
 * @fileoverview Encryption Tests
 * @description Tests for KDF providers and encryption functionality
 */

import { PBKDF2Provider } from '../encryption/pbkdf2-provider';
import { Argon2Provider } from '../encryption/argon2-provider';
import { PBKDF2Params, Argon2Params } from '../types/backup-types';

describe('PBKDF2Provider', () => {
  let provider: PBKDF2Provider;

  beforeEach(() => {
    provider = new PBKDF2Provider();
  });

  describe('generateParams', () => {
    it('should generate valid PBKDF2 parameters', () => {
      const params = provider.generateParams();

      expect(params.salt).toBeDefined();
      expect(typeof params.salt).toBe('string');
      expect(params.iterations).toBe(100000);
      expect(params.keyLength).toBe(32);
      expect(params.digest).toBe('sha256');
    });

    it('should generate unique salts', () => {
      const params1 = provider.generateParams();
      const params2 = provider.generateParams();

      expect(params1.salt).not.toBe(params2.salt);
    });
  });

  describe('deriveKey', () => {
    it('should derive a key of correct length', async () => {
      const params = provider.generateParams();
      const key = await provider.deriveKey('test-password', params);

      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });

    it('should derive same key with same params', async () => {
      const params = provider.generateParams();
      const key1 = await provider.deriveKey('test-password', params);
      const key2 = await provider.deriveKey('test-password', params);

      expect(key1.equals(key2)).toBe(true);
    });

    it('should derive different keys with different passwords', async () => {
      const params = provider.generateParams();
      const key1 = await provider.deriveKey('password1', params);
      const key2 = await provider.deriveKey('password2', params);

      expect(key1.equals(key2)).toBe(false);
    });

    it('should derive different keys with different salts', async () => {
      const params1 = provider.generateParams();
      const params2 = provider.generateParams();
      const key1 = await provider.deriveKey('test-password', params1);
      const key2 = await provider.deriveKey('test-password', params2);

      expect(key1.equals(key2)).toBe(false);
    });
  });

  describe('deriveKeySync', () => {
    it('should derive key synchronously', () => {
      const params = provider.generateParams();
      const key = provider.deriveKeySync('test-password', params);

      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });
  });

  describe('validateParams', () => {
    it('should validate correct params', () => {
      const params = provider.generateParams();
      expect(provider.validateParams(params)).toBe(true);
    });

    it('should reject params with low iterations', () => {
      const params: PBKDF2Params = {
        salt: 'dGVzdA==',
        iterations: 100,
        keyLength: 32,
        digest: 'sha256',
      };
      expect(provider.validateParams(params)).toBe(false);
    });

    it('should reject params with invalid digest', () => {
      const params: PBKDF2Params = {
        salt: 'dGVzdA==',
        iterations: 100000,
        keyLength: 32,
        digest: 'md5',
      };
      expect(provider.validateParams(params)).toBe(false);
    });
  });
});

describe('Argon2Provider', () => {
  let provider: Argon2Provider;

  beforeEach(() => {
    provider = new Argon2Provider();
  });

  describe('generateParams', () => {
    it('should generate valid Argon2 parameters', () => {
      const params = provider.generateParams();

      expect(params.salt).toBeDefined();
      expect(typeof params.salt).toBe('string');
      expect(params.memoryCost).toBe(65536);
      expect(params.timeCost).toBe(3);
      expect(params.parallelism).toBe(4);
      expect(params.hashLength).toBe(32);
      expect(params.type).toBe('argon2id');
    });
  });

  describe('deriveKey', () => {
    it('should derive a key of correct length', async () => {
      const params = provider.generateParams();
      const key = await provider.deriveKey('test-password', params);

      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });

    it('should derive same key with same params', async () => {
      const params = provider.generateParams();
      const key1 = await provider.deriveKey('test-password', params);
      const key2 = await provider.deriveKey('test-password', params);

      expect(key1.equals(key2)).toBe(true);
    });

    it('should derive different keys with different passwords', async () => {
      const params = provider.generateParams();
      const key1 = await provider.deriveKey('password1', params);
      const key2 = await provider.deriveKey('password2', params);

      expect(key1.equals(key2)).toBe(false);
    });
  });

  describe('validateParams', () => {
    it('should validate correct params', () => {
      const params = provider.generateParams();
      expect(provider.validateParams(params)).toBe(true);
    });

    it('should reject params with low memory cost', () => {
      const params: Argon2Params = {
        salt: 'dGVzdA==',
        memoryCost: 100,
        timeCost: 3,
        parallelism: 4,
        hashLength: 32,
        type: 'argon2id',
      };
      expect(provider.validateParams(params)).toBe(false);
    });

    it('should reject params with invalid type', () => {
      const params = {
        salt: 'dGVzdA==',
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
        hashLength: 32,
        type: 'invalid',
      } as unknown as Argon2Params;
      expect(provider.validateParams(params)).toBe(false);
    });
  });
});
