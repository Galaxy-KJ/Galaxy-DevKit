import * as StellarSdk from '@stellar/stellar-sdk';

// ─── Public types ────────────────────────────────────────────────────────────

export interface SessionKey {
  publicKey: string; // Ed25519 public key (Stellar G-address)
  expiresAt: number; // Unix timestamp (seconds)
}

export interface CreateSessionOptions {
  smartWalletAddress: string;
  passkeyCredentialId: string; // Base64-encoded WebAuthn credential ID
  ttlSeconds: number;          // e.g. 3600 for 1 hour
}

// ─── Dependency interfaces ────────────────────────────────────────────────────
//
// These mirror the relevant parts of WebAuthNProvider and SmartWalletService
// (#123) so SessionKeyManager can be unit-tested with mocks without importing
// the concrete classes (avoids circular deps and browser-env requirements).

/**
 * The subset of WebAuthNProvider that SessionKeyManager needs.
 *
 * WebAuthNProvider.authenticate() discards the raw assertion, which is fine
 * for login flows. But registering a session key requires the assertion
 * response itself (authenticatorData + clientDataJSON + signature) so the
 * Soroban contract can verify it inside __check_auth (#120).
 *
 * We therefore call navigator.credentials.get() directly here, using the same
 * challenge-derivation and base64 helpers that WebAuthNProvider uses internally.
 * The rpId is forwarded from the provider instance so tests can override it.
 */
export interface IWebAuthnProvider {
  readonly rpId: string;
}

/**
 * The subset of SmartWalletService (#123) that SessionKeyManager needs.
 * Both methods accept a pre-built WebAuthn assertion so they can produce and
 * submit the authorised Soroban invocation.
 */
export interface ISmartWalletService {
  /**
   * Build, authorise (via the WebAuthn assertion), and submit an add-signer
   * transaction that registers `sessionPublicKey` on the smart wallet with a
   * Soroban TTL of `ttlSeconds`.
   */
  addSigner(params: {
    walletAddress: string;
    sessionPublicKey: string;
    ttlSeconds: number;
    webAuthnAssertion: PublicKeyCredential;
  }): Promise<void>;

  /**
   * Build, authorise (via a fresh WebAuthn assertion), and submit a
   * remove-signer transaction.  A new biometric prompt is acceptable here
   * because revocation is an intentional, infrequent user action.
   */
  removeSigner(params: {
    walletAddress: string;
    signerPublicKey: string;
    webAuthnAssertion: PublicKeyCredential;
  }): Promise<void>;
}

// ─── SessionKeyManager ────────────────────────────────────────────────────────

/**
 * SessionKeyManager
 *
 * Manages short-lived Ed25519 session keys that act as temporary delegates on
 * a Soroban smart wallet, eliminating repeated biometric prompts for
 * high-frequency operations (DCA, automated swaps, small payments).
 *
 * ## Security contract
 * - Private key lives ONLY in memory — never localStorage, sessionStorage,
 *   Supabase, or any other persistent store.
 * - The private key buffer is zeroed with `Buffer.fill(0)` on `revoke()` and
 *   on any error path during `createSession()`.
 * - A fresh keypair is generated on every `createSession()` call.
 * - The WebAuthn challenge is derived from the add-signer transaction payload,
 *   not a random nonce, so the authenticator assertion binds to that specific
 *   operation (prevents replay across different txs).
 *
 * ## Integration with WebAuthNProvider
 * WebAuthNProvider.authenticate() returns only `{ success: boolean }` and
 * discards the raw `AuthenticatorAssertionResponse`.  For session key
 * registration we need that response (authenticatorData + clientDataJSON +
 * signature) so the Soroban contract can verify it in __check_auth (#120).
 * We therefore call `navigator.credentials.get()` directly, mirroring the
 * same pattern used in WebAuthNProvider — same rpId, same base64 helpers,
 * same `allowCredentials` construction from the credentialId.
 *
 * ## Dependencies (injected via constructor)
 * - `webAuthnProvider`   – supplies `rpId`; future versions may expose
 *                          `assertRaw()` so we stop calling the Web API directly.
 * - `smartWalletService` – builds + submits the authorised Soroban tx (#123).
 */
export class SessionKeyManager {
  private readonly _webAuthnProvider: IWebAuthnProvider;
  private readonly _smartWalletService: ISmartWalletService;

  /** Raw Ed25519 seed bytes — zeroed on revoke / expiry / error. */
  private _privateKeyBytes: Buffer | null = null;
  private _sessionKey: SessionKey | null = null;

  constructor(
    webAuthnProvider: IWebAuthnProvider,
    smartWalletService: ISmartWalletService
  ) {
    this._webAuthnProvider = webAuthnProvider;
    this._smartWalletService = smartWalletService;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * createSession
   *
   * Flow:
   *  1. Destroy any existing in-memory session key.
   *  2. Generate a fresh Ed25519 keypair with `StellarSdk.Keypair.random()`.
   *  3. Derive a WebAuthn challenge from the add-signer tx payload so the
   *     authenticator assertion is bound to this specific operation.
   *  4. Prompt the user once (biometric) via `navigator.credentials.get()`,
   *     using the supplied `passkeyCredentialId` to target the right credential.
   *  5. Forward the assertion to `SmartWalletService.addSigner()`, which builds
   *     and submits the Soroban invocation.  The contract stores the signer with
   *     `instance().extend_ttl()` — no server-side cleanup needed.
   *  6. On any failure after step 2, zero the private key and rethrow.
   *
   * @returns SessionKey  { publicKey (G-address), expiresAt (unix seconds) }
   */
  async createSession(options: CreateSessionOptions): Promise<SessionKey> {
    const { smartWalletAddress, passkeyCredentialId, ttlSeconds } = options;

    // Step 1 — destroy any pre-existing session
    this._destroyPrivateKey();

    // Step 2 — fresh Ed25519 keypair (never secp256r1 for session keys)
    const keypair = StellarSdk.Keypair.random();
    this._privateKeyBytes = Buffer.from(keypair.rawSecretKey());

    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    this._sessionKey = { publicKey: keypair.publicKey(), expiresAt };

    try {
      // Step 3 — derive a deterministic challenge from the operation payload.
      //   Hash of (walletAddress ‖ sessionPublicKey ‖ ttlSeconds) so the
      //   WebAuthn assertion cryptographically binds to THIS add-signer tx.
      const challenge = await this._deriveChallenge({
        smartWalletAddress,
        sessionPublicKey: keypair.publicKey(),
        ttlSeconds,
      });

      // Step 4 — biometric prompt (the ONE prompt per session)
      const assertion = await this._assertCredential({
        credentialId: passkeyCredentialId,
        challenge,
      });

      // Step 5 — register signer on-chain via SmartWalletService (#123)
      await this._smartWalletService.addSigner({
        walletAddress: smartWalletAddress,
        sessionPublicKey: keypair.publicKey(),
        ttlSeconds,
        webAuthnAssertion: assertion,
      });
    } catch (err) {
      // Step 6 — roll back: zero key so we never hold an orphaned private key
      // for a signer that was never registered on-chain.
      this._destroyPrivateKey();
      throw err;
    }

    return { ...this._sessionKey };
  }

  /**
   * sign
   *
   * Signs a Soroban transaction hash with the active in-memory session key.
   *
   * @param txHash  32-byte Soroban transaction hash
   * @returns       64-byte Ed25519 signature
   * @throws        If no valid session exists or the session has expired.
   */
  sign(txHash: Buffer): Buffer {
    if (!this.isActive()) {
      // Auto-zero on expiry so the dead key doesn't linger.
      this._destroyPrivateKey();
      throw new Error(
        'No active session. Call createSession() first.'
      );
    }

    const keypair = StellarSdk.Keypair.fromRawEd25519Seed(
      this._privateKeyBytes as Buffer
    );

    return Buffer.from(keypair.sign(txHash));
  }

  /**
   * isActive
   *
   * @returns true iff an unexpired session is held in memory.
   */
  isActive(): boolean {
    if (!this._sessionKey || !this._privateKeyBytes) return false;
    return Math.floor(Date.now() / 1000) < this._sessionKey.expiresAt;
  }

  /**
   * revoke
   *
   * Zeros the private key from memory FIRST, then removes the signer from the
   * smart wallet contract.  Zeroing before the async call ensures the key is
   * gone even if the network call throws.
   *
   * A fresh biometric prompt is issued for the remove-signer tx — this is
   * intentional: revocation is a deliberate, infrequent user action, so
   * requiring re-authentication is the correct security posture.
   *
   * Safe to call when no session is active (no-op).
   *
   * @param smartWalletAddress  The contract address to remove the signer from.
   * @param passkeyCredentialId The credential to use for the remove-signer auth.
   */
  async revoke(
    smartWalletAddress: string,
    passkeyCredentialId: string
  ): Promise<void> {
    if (!this._sessionKey) return;

    const publicKey = this._sessionKey.publicKey;

    // Zero BEFORE the network call — key is gone regardless of what follows.
    this._destroyPrivateKey();

    // Build a challenge for the remove-signer operation so the assertion is
    // bound to this specific revocation (not replayable for add-signer).
    const challenge = await this._deriveChallenge({
      smartWalletAddress,
      sessionPublicKey: publicKey,
      ttlSeconds: 0, // sentinel: revoke operations have no TTL
    });

    const assertion = await this._assertCredential({
      credentialId: passkeyCredentialId,
      challenge,
    });

    await this._smartWalletService.removeSigner({
      walletAddress: smartWalletAddress,
      signerPublicKey: publicKey,
      webAuthnAssertion: assertion,
    });
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  /**
   * Derives a 32-byte WebAuthn challenge from the operation parameters.
   *
   * Using a deterministic, operation-specific challenge (rather than a random
   * nonce) means the WebAuthn assertion is cryptographically bound to THIS
   * add-signer / remove-signer invocation, preventing replay attacks where a
   * captured assertion could be replayed against a different tx.
   *
   * Encoding: SHA-256( walletAddress ‖ ":" ‖ sessionPublicKey ‖ ":" ‖ ttlSeconds )
   */
  private async _deriveChallenge(params: {
    smartWalletAddress: string;
    sessionPublicKey: string;
    ttlSeconds: number;
  }): Promise<ArrayBuffer> {
    const payload = `${params.smartWalletAddress}:${params.sessionPublicKey}:${params.ttlSeconds}`;
    const encoded = new TextEncoder().encode(payload);
    return crypto.subtle.digest('SHA-256', encoded);
  }

  /**
   * Calls `navigator.credentials.get()` to obtain a WebAuthn assertion for the
   * supplied credential and challenge.
   *
   * This mirrors WebAuthNProvider.authenticate() but returns the raw
   * `PublicKeyCredential` instead of discarding it, because the Soroban
   * contract's __check_auth (#120) needs the authenticatorData + signature to
   * verify the passkey authorisation on-chain.
   *
   * - `rpId` is taken from the injected webAuthnProvider so the same relying
   *   party origin is used consistently.
   * - `userVerification: 'required'` ensures the biometric check always happens.
   * - `timeout: 60_000` matches WebAuthNProvider's existing convention.
   */
  private async _assertCredential(params: {
    credentialId: string;   // base64-encoded
    challenge: ArrayBuffer;
  }): Promise<PublicKeyCredential> {
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: params.challenge,
        rpId: this._webAuthnProvider.rpId,
        allowCredentials: [
          {
            type: 'public-key',
            id: this._base64ToArrayBuffer(params.credentialId),
          },
        ],
        userVerification: 'required',
        timeout: 60_000,
      },
    });

    if (!credential) {
      throw new Error('WebAuthn assertion cancelled or returned null.');
    }

    return credential as PublicKeyCredential;
  }

  /**
   * Zeros the private key buffer and nulls out all session state.
   * Safe to call multiple times (idempotent).
   */
  private _destroyPrivateKey(): void {
    if (this._privateKeyBytes) {
      this._privateKeyBytes.fill(0);
      this._privateKeyBytes = null;
    }
    this._sessionKey = null;
  }

  /** Mirrors the base64ToArrayBuffer helper in WebAuthNProvider. */
  private _base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}