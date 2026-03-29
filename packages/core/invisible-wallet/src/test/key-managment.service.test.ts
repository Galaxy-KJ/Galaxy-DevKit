// @ts-nocheck

/**
 * key-managment.service.test.ts
 *
 * Unit tests for KeyManagementService after Phase 1 non-custodial migration.
 * Verifies: keypair generation, session lifecycle, and rate limiting.
 * Verifies removal: storePrivateKey, retrievePrivateKey, changePassword DB write.
 */

import { KeyManagementService } from '../services/key-managment.service';

jest.mock('@stellar/stellar-sdk', () => ({
  Keypair: {
    random: jest.fn().mockReturnValue({
      publicKey: jest.fn().mockReturnValue('GPUB_MOCK'),
      secret: jest.fn().mockReturnValue('SSECRET_MOCK'),
    }),
    fromRawEd25519Seed: jest.fn().mockReturnValue({
      publicKey: jest.fn().mockReturnValue('GPUB_DERIVED'),
      secret: jest.fn().mockReturnValue('SSECRET_DERIVED'),
    }),
  },
}));

jest.mock('bip39', () => ({
  generateMnemonic: jest.fn().mockReturnValue('word '.repeat(24).trim()),
  validateMnemonic: jest.fn().mockReturnValue(true),
  mnemonicToSeed: jest.fn().mockResolvedValue(Buffer.alloc(64)),
}));

jest.mock('ed25519-hd-key', () => ({
  derivePath: jest.fn().mockReturnValue({ key: Buffer.alloc(32) }),
}));

const buildSupabaseMock = () => ({
  from: jest.fn().mockReturnValue({
    insert: jest.fn().mockResolvedValue({ error: null }),
    update: jest.fn().mockReturnValue({
      eq: jest.fn().mockResolvedValue({ error: null }),
    }),
  }),
});

jest.mock('../../../stellar-sdk/src/utils/supabase-client', () => ({
  supabaseClient: buildSupabaseMock(),
}));

jest.mock('../utils/encryption.utils', () => ({
  generateSessionToken: jest.fn().mockReturnValue('mock-session-token-xyz'),
  validatePassword: jest.fn(),
}));

describe('KeyManagementService – Phase 1 non-custodial', () => {
  let service: KeyManagementService;

  beforeEach(() => {
    service = new KeyManagementService(3_600_000);
  });

  afterEach(() => {
    service.dispose();
  });

  // ── Keypair generation ──────────────────────────────────────────────────────

  describe('generateKeypair()', () => {
    it('returns publicKey and secretKey', () => {
      const kp = service.generateKeypair();
      expect(kp).toHaveProperty('publicKey', 'GPUB_MOCK');
      expect(kp).toHaveProperty('secretKey', 'SSECRET_MOCK');
    });

    it('does not return encryptedPrivateKey or any server-storage field', () => {
      const kp = service.generateKeypair() as any;
      expect(kp).not.toHaveProperty('encryptedPrivateKey');
      expect(kp).not.toHaveProperty('encrypted_private_key');
    });
  });

  describe('generateMnemonic()', () => {
    it('returns a string', () => {
      expect(typeof service.generateMnemonic()).toBe('string');
    });

    it('throws on invalid strength', () => {
      expect(() => service.generateMnemonic(99)).toThrow('Invalid mnemonic strength');
    });
  });

  describe('deriveKeypairFromMnemonic()', () => {
    it('returns publicKey and secretKey', async () => {
      const kp = await service.deriveKeypairFromMnemonic('word '.repeat(24).trim());
      expect(kp).toHaveProperty('publicKey');
      expect(kp).toHaveProperty('secretKey');
    });
  });

  // ── Removed server-side methods ─────────────────────────────────────────────

  describe('Removed methods', () => {
    it('storePrivateKey does not exist on the service', () => {
      expect((service as any).storePrivateKey).toBeUndefined();
    });

    it('retrievePrivateKey does not exist on the service', () => {
      expect((service as any).retrievePrivateKey).toBeUndefined();
    });

    it('changePassword does not exist on the service', () => {
      expect((service as any).changePassword).toBeUndefined();
    });

    it('verifyPassword does not exist on the service', () => {
      // Password verification happens on the client device now
      expect((service as any).verifyPassword).toBeUndefined();
    });
  });

  // ── Rate limiting ───────────────────────────────────────────────────────────

  describe('Rate limiting', () => {
    it('does not throw on first failure', () => {
      expect(() => service.recordUnlockFailure('wallet-1')).not.toThrow();
    });

    it('throws after MAX_ATTEMPTS consecutive failures', () => {
      for (let i = 0; i < 5; i++) {
        try { service.recordUnlockFailure('wallet-2'); } catch {}
      }
      expect(() => service.recordUnlockFailure('wallet-2')).toThrow(/Account locked/);
    });

    it('resets counter after recordUnlockSuccess', () => {
      service.recordUnlockFailure('wallet-3');
      service.recordUnlockSuccess('wallet-3');
      expect(() => service.recordUnlockFailure('wallet-3')).not.toThrow();
    });
  });

  // ── Session lifecycle ───────────────────────────────────────────────────────

  describe('Session lifecycle', () => {
    it('createSession returns a valid session object', async () => {
      const session = await service.createSession('w1', 'u1');
      expect(session).toMatchObject({
        walletId: 'w1',
        userId: 'u1',
        isActive: true,
        sessionToken: 'mock-session-token-xyz',
      });
    });

    it('validateSession returns valid=true for a fresh session', async () => {
      const session = await service.createSession('w1', 'u1');
      const result = await service.validateSession(session.sessionToken);
      expect(result.valid).toBe(true);
      expect(result.session).toBeDefined();
    });

    it('validateSession returns valid=false after revokeSession', async () => {
      const session = await service.createSession('w1', 'u1');
      await service.revokeSession(session.sessionToken);
      const result = await service.validateSession(session.sessionToken);
      expect(result.valid).toBe(false);
    });

    it('revokeAllWalletSessions invalidates all sessions for a wallet', async () => {
      const s1 = await service.createSession('w2', 'u1');
      await service.revokeAllWalletSessions('w2');
      const r1 = await service.validateSession(s1.sessionToken);
      expect(r1.valid).toBe(false);
    });
  });

  // ── dispose ─────────────────────────────────────────────────────────────────

  describe('dispose()', () => {
    it('clears all sessions', async () => {
      const s = await service.createSession('w1', 'u1');
      service.dispose();
      const r = await service.validateSession(s.sessionToken);
      expect(r.valid).toBe(false);
    });
  });
});