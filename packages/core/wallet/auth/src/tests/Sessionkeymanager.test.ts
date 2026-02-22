/**
 * SessionKeyManager.test.ts
 *
 * All browser APIs (navigator.credentials, crypto.subtle, crypto.getRandomValues)
 * are mocked so this suite runs in Jest's jsdom / Node environment without a
 * real authenticator.
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import {
  SessionKeyManager,
  IWebAuthnProvider,
  ISmartWalletService,
} from '../session/SessionKeyManager';

// ─── Browser API mocks ────────────────────────────────────────────────────────

/** Minimal PublicKeyCredential stub returned by our mocked credentials.get() */
function makeMockAssertion(credentialId = 'cred-abc'): PublicKeyCredential {
  return {
    id: credentialId,
    rawId: new ArrayBuffer(16),
    type: 'public-key',
    response: {
      clientDataJSON: new ArrayBuffer(32),
      authenticatorData: new ArrayBuffer(32),
      signature: new ArrayBuffer(64),
      userHandle: null,
    } as AuthenticatorAssertionResponse,
    getClientExtensionResults: () => ({}),
  } as unknown as PublicKeyCredential;
}

/** Stable mock for crypto.subtle.digest that returns 32 zero bytes */
const mockDigest = jest.fn(async () => new ArrayBuffer(32));

/** Capture the credential passed to credentials.get() for assertion */
let mockCredentialsGet: jest.Mock;

beforeEach(() => {
  mockCredentialsGet = jest.fn(async () => makeMockAssertion());

  Object.defineProperty(global, 'navigator', {
    value: { credentials: { get: mockCredentialsGet } },
    writable: true,
    configurable: true,
  });

  Object.defineProperty(global, 'crypto', {
    value: {
      subtle: { digest: mockDigest },
      getRandomValues: (arr: Uint8Array) => {
        arr.fill(0xaa);
        return arr;
      },
    },
    writable: true,
    configurable: true,
  });

  // atob / btoa available in jsdom; define fallbacks for pure Node runs
  if (typeof atob === 'undefined') {
    (global as any).atob = (s: string) =>
      Buffer.from(s, 'base64').toString('binary');
    (global as any).btoa = (s: string) =>
      Buffer.from(s, 'binary').toString('base64');
  }

  // TextEncoder available in Node >= 11; jsdom provides it automatically
  if (typeof TextEncoder === 'undefined') {
    (global as any).TextEncoder = require('util').TextEncoder;
  }
});

afterEach(() => {
  jest.clearAllMocks();
});

// ─── Test helpers ─────────────────────────────────────────────────────────────

const MOCK_WALLET    = 'GABC1234SMARTWALLET';
const MOCK_CRED_ID  = 'Y3JlZC1hYmMtMTIz'; // base64("cred-abc-123")
const MOCK_OPTIONS   = {
  smartWalletAddress:  MOCK_WALLET,
  passkeyCredentialId: MOCK_CRED_ID,
  ttlSeconds:          3600,
};

function mockTxHash(): Buffer {
  return Buffer.alloc(32, 0xab);
}

function makeDependencies(overrides: {
  rpId?:         string;
  addSigner?:    jest.Mock;
  removeSigner?: jest.Mock;
} = {}) {
  const webAuthnProvider: IWebAuthnProvider = {
    rpId: overrides.rpId ?? 'localhost',
  };
  const smartWalletService: ISmartWalletService = {
    addSigner:    overrides.addSigner    ?? jest.fn(async () => {}),
    removeSigner: overrides.removeSigner ?? jest.fn(async () => {}),
  };
  return { webAuthnProvider, smartWalletService };
}

function makeManager(overrides: Parameters<typeof makeDependencies>[0] = {}) {
  const { webAuthnProvider, smartWalletService } = makeDependencies(overrides);
  return {
    mgr: new SessionKeyManager(webAuthnProvider, smartWalletService),
    webAuthnProvider,
    smartWalletService,
  };
}

// ─── createSession() ──────────────────────────────────────────────────────────

describe('createSession()', () => {
  it('returns a SessionKey with a valid Ed25519 G-address and future expiresAt', async () => {
    const { mgr } = makeManager();
    const before = Math.floor(Date.now() / 1000);
    const key = await mgr.createSession(MOCK_OPTIONS);
    const after = Math.floor(Date.now() / 1000);

    expect(() => StellarSdk.Keypair.fromPublicKey(key.publicKey)).not.toThrow();
    expect(key.expiresAt).toBeGreaterThanOrEqual(before + MOCK_OPTIONS.ttlSeconds);
    expect(key.expiresAt).toBeLessThanOrEqual(after + MOCK_OPTIONS.ttlSeconds);
  });

  it('generates a different keypair on each call', async () => {
    const { mgr } = makeManager();
    const k1 = await mgr.createSession(MOCK_OPTIONS);
    const k2 = await mgr.createSession(MOCK_OPTIONS);
    expect(k1.publicKey).not.toBe(k2.publicKey);
  });

  it('sets isActive() to true after successful creation', async () => {
    const { mgr } = makeManager();
    await mgr.createSession(MOCK_OPTIONS);
    expect(mgr.isActive()).toBe(true);
  });

  it('calls credentials.get() exactly once with the correct rpId and userVerification', async () => {
    const { mgr } = makeManager({ rpId: 'wallet.example.com' });
    await mgr.createSession(MOCK_OPTIONS);

    expect(mockCredentialsGet).toHaveBeenCalledTimes(1);
    const callArg = mockCredentialsGet.mock.calls[0][0] as CredentialRequestOptions;
    expect(callArg.publicKey?.rpId).toBe('wallet.example.com');
    expect(callArg.publicKey?.userVerification).toBe('required');
    expect(callArg.publicKey?.allowCredentials).toHaveLength(1);
    expect(callArg.publicKey?.allowCredentials?.[0]?.type).toBe('public-key');
  });

  it('passes the WebAuthn assertion and correct params to SmartWalletService.addSigner()', async () => {
    const addSigner = jest.fn(async () => {});
    const { mgr } = makeManager({ addSigner });
    const key = await mgr.createSession(MOCK_OPTIONS);

    expect(addSigner).toHaveBeenCalledTimes(1);
    expect(addSigner).toHaveBeenCalledWith(
      expect.objectContaining({
        walletAddress:    MOCK_WALLET,
        sessionPublicKey: key.publicKey,
        ttlSeconds:       MOCK_OPTIONS.ttlSeconds,
        webAuthnAssertion: expect.objectContaining({ type: 'public-key' }),
      })
    );
  });

  it('uses a deterministic operation-bound challenge, not random bytes', async () => {
    const { mgr } = makeManager();
    await mgr.createSession(MOCK_OPTIONS);

    expect(mockDigest).toHaveBeenCalledTimes(1);
    const [algo, data] = mockDigest.mock.calls[0] as [string, ArrayBuffer];
    expect(algo).toBe('SHA-256');
    const payload = new TextDecoder().decode(data);
    // Challenge must encode all three operation parameters
    expect(payload).toContain(MOCK_WALLET);
    expect(payload).toContain(String(MOCK_OPTIONS.ttlSeconds));
  });

  it('zeros the private key and rethrows if credentials.get() rejects', async () => {
    mockCredentialsGet.mockRejectedValueOnce(new Error('User cancelled'));
    const { mgr } = makeManager();

    await expect(mgr.createSession(MOCK_OPTIONS)).rejects.toThrow('User cancelled');
    expect(mgr.isActive()).toBe(false);
    expect((mgr as any)._privateKeyBytes).toBeNull();
  });

  it('zeros the private key and rethrows if addSigner() rejects', async () => {
    const addSigner = jest.fn(async () => { throw new Error('Network error'); });
    const { mgr } = makeManager({ addSigner });

    await expect(mgr.createSession(MOCK_OPTIONS)).rejects.toThrow('Network error');
    expect(mgr.isActive()).toBe(false);
    expect((mgr as any)._privateKeyBytes).toBeNull();
  });
});

// ─── isActive() ───────────────────────────────────────────────────────────────

describe('isActive()', () => {
  it('returns false before any session is created', () => {
    const { mgr } = makeManager();
    expect(mgr.isActive()).toBe(false);
  });

  it('returns false after TTL has elapsed', async () => {
    const { mgr } = makeManager();
    await mgr.createSession({ ...MOCK_OPTIONS, ttlSeconds: 1 });

    const realNow = Date.now;
    Date.now = () => realNow() + 2_000;
    try {
      expect(mgr.isActive()).toBe(false);
    } finally {
      Date.now = realNow;
    }
  });
});

// ─── sign() ───────────────────────────────────────────────────────────────────

describe('sign()', () => {
  it('returns a 64-byte Ed25519 signature', async () => {
    const { mgr } = makeManager();
    await mgr.createSession(MOCK_OPTIONS);
    const sig = mgr.sign(mockTxHash());
    expect(sig).toBeInstanceOf(Buffer);
    expect(sig.byteLength).toBe(64);
  });

  it('produces a signature verifiable with the session public key', async () => {
    const { mgr } = makeManager();
    const { publicKey } = await mgr.createSession(MOCK_OPTIONS);

    const txHash = mockTxHash();
    const sig    = mgr.sign(txHash);

    const keypair = StellarSdk.Keypair.fromPublicKey(publicKey);
    expect(keypair.verify(txHash, sig)).toBe(true);
  });

  it('throws when no session exists', () => {
    const { mgr } = makeManager();
    expect(() => mgr.sign(mockTxHash())).toThrow('No active session');
  });

  it('throws and zeros the private key after TTL expiry', async () => {
    const { mgr } = makeManager();
    await mgr.createSession({ ...MOCK_OPTIONS, ttlSeconds: 1 });

    const realNow = Date.now;
    Date.now = () => realNow() + 2_000;
    try {
      expect(() => mgr.sign(mockTxHash())).toThrow('No active session');
      expect((mgr as any)._privateKeyBytes).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });
});

// ─── revoke() ────────────────────────────────────────────────────────────────

describe('revoke()', () => {
  it('zeros the private key synchronously before the network call completes', async () => {
    let resolveRemove!: () => void;
    const removeSigner = jest.fn(
      () => new Promise<void>(resolve => { resolveRemove = resolve; })
    );
    const { mgr } = makeManager({ removeSigner });

    await mgr.createSession(MOCK_OPTIONS);
    const revokePromise = mgr.revoke(MOCK_WALLET, MOCK_CRED_ID);

    // The private key must be zeroed before the promise resolves
    expect(mgr.isActive()).toBe(false);
    expect((mgr as any)._privateKeyBytes).toBeNull();

    resolveRemove();
    await revokePromise;
  });

  it('prevents signing after revocation', async () => {
    const { mgr } = makeManager();
    await mgr.createSession(MOCK_OPTIONS);
    await mgr.revoke(MOCK_WALLET, MOCK_CRED_ID);
    expect(() => mgr.sign(mockTxHash())).toThrow('No active session');
  });

  it('calls SmartWalletService.removeSigner() with the correct public key and assertion', async () => {
    const removeSigner = jest.fn(async () => {});
    const { mgr } = makeManager({ removeSigner });
    const { publicKey } = await mgr.createSession(MOCK_OPTIONS);

    await mgr.revoke(MOCK_WALLET, MOCK_CRED_ID);

    expect(removeSigner).toHaveBeenCalledWith(
      expect.objectContaining({
        walletAddress:    MOCK_WALLET,
        signerPublicKey:  publicKey,
        webAuthnAssertion: expect.objectContaining({ type: 'public-key' }),
      })
    );
  });

  it('uses ttlSeconds=0 sentinel in the revoke challenge', async () => {
    const { mgr } = makeManager();
    await mgr.createSession(MOCK_OPTIONS);

    mockDigest.mockClear();
    await mgr.revoke(MOCK_WALLET, MOCK_CRED_ID);

    const payload = new TextDecoder().decode(
      mockDigest.mock.calls[0][1] as ArrayBuffer
    );
    // Revoke challenges must end with :0 (sentinel for no TTL)
    expect(payload).toMatch(/:0$/);
  });

  it('is a no-op when no session is active', async () => {
    const removeSigner = jest.fn();
    const { mgr } = makeManager({ removeSigner });
    await expect(mgr.revoke(MOCK_WALLET, MOCK_CRED_ID)).resolves.toBeUndefined();
    expect(removeSigner).not.toHaveBeenCalled();
    expect(mockCredentialsGet).not.toHaveBeenCalled();
  });
});

// ─── Memory safety ────────────────────────────────────────────────────────────

describe('Memory safety', () => {
  it('nulls _privateKeyBytes after revoke()', async () => {
    const { mgr } = makeManager();
    await mgr.createSession(MOCK_OPTIONS);
    expect((mgr as any)._privateKeyBytes).not.toBeNull();

    await mgr.revoke(MOCK_WALLET, MOCK_CRED_ID);

    expect((mgr as any)._privateKeyBytes).toBeNull();
    expect((mgr as any)._sessionKey).toBeNull();
  });

  it('zeroes (fills with 0x00) the previous Buffer on revoke()', async () => {
    const { mgr } = makeManager();
    await mgr.createSession(MOCK_OPTIONS);
    // Grab a reference to the live buffer BEFORE revoke
    const buf = (mgr as any)._privateKeyBytes as Buffer;
    const hadNonZero = buf.some((b: number) => b !== 0);
    expect(hadNonZero).toBe(true); // sanity: it contained real key material

    await mgr.revoke(MOCK_WALLET, MOCK_CRED_ID);

    // Every byte of the original buffer must now be 0
    expect(buf.every((b: number) => b === 0)).toBe(true);
  });

  it('zeroes the first buffer when createSession() is called a second time', async () => {
    const { mgr } = makeManager();
    await mgr.createSession(MOCK_OPTIONS);
    const firstBuf = (mgr as any)._privateKeyBytes as Buffer;

    await mgr.createSession(MOCK_OPTIONS);

    expect(firstBuf.every((b: number) => b === 0)).toBe(true);
  });

  it('nulls _privateKeyBytes on error during createSession()', async () => {
    mockCredentialsGet.mockRejectedValueOnce(new Error('aborted'));
    const { mgr } = makeManager();

    await expect(mgr.createSession(MOCK_OPTIONS)).rejects.toThrow();
    expect((mgr as any)._privateKeyBytes).toBeNull();
  });
});