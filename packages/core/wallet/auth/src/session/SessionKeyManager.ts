import * as StellarSdk from '@stellar/stellar-sdk';
import type { Transaction } from '@stellar/stellar-sdk';

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

export interface IWebAuthnProvider {
  readonly rpId: string;
}

/**
 * The subset of SmartWalletService that SessionKeyManager needs.
 *
 * `addSigner` / `removeSigner` handle the on-chain registration and removal of
 * session keys (triggered by the admin passkey on creation/revocation).
 *
 * `signWithSessionKey` handles signing subsequent transactions with the
 * in-memory session key — no biometric prompt, just the Ed25519 callback.
 */
export interface ISmartWalletService {
  addSigner(params: {
    walletAddress: string;
    sessionPublicKey: string;
    ttlSeconds: number;
    webAuthnAssertion: PublicKeyCredential;
  }): Promise<string>;

  removeSigner(params: {
    walletAddress: string;
    signerPublicKey: string;
    webAuthnAssertion: PublicKeyCredential;
  }): Promise<void>;

  /**
   * Signs `sorobanTx` using the session key identified by `credentialId`.
   *
   * The service simulates the tx to obtain the auth-entry hash, calls
   * `signFn` with that hash (this is the single place where the in-memory
   * private key is used), builds `AccountSignature::SessionKey(...)`, and
   * returns the assembled fee-less XDR for the fee sponsor.
   */
  signWithSessionKey(
    contractAddress: string,
    sorobanTx: Transaction,
    credentialId: string,
    signFn: (authEntryHash: Buffer) => Buffer,
  ): Promise<string>;
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
 * - The WebAuthn challenge is derived from the add-signer operation parameters,
 *   not a random nonce, so the authenticator assertion is cryptographically
 *   bound to this specific tx (prevents replay across different txs).
 *
 * ## Integration with SmartWalletService
 * `createSession()` derives the challenge, obtains the WebAuthn assertion once
 * (the single biometric prompt per session), and forwards the raw
 * `PublicKeyCredential` to `SmartWalletService.addSigner()` via
 * `webAuthnAssertion`.  SmartWalletService then simulates the Soroban tx,
 * attaches the assertion to the auth entry, and returns the fee-less XDR for
 * the sponsor — no second prompt needed.
 *
 * `signTransaction()` uses the in-memory session key (no biometric) to sign
 * subsequent txs via `SmartWalletService.signWithSessionKey()`.
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
   *  3. Derive a deterministic WebAuthn challenge from the operation parameters
   *     (walletAddress ‖ sessionPublicKey ‖ ttlSeconds) so the assertion is
   *     bound to this specific add-signer invocation.
   *  4. Prompt the user ONCE (biometric) via `navigator.credentials.get()`.
   *  5. Forward the assertion to `SmartWalletService.addSigner()`, which
   *     simulates, attaches the signature, and submits the Soroban tx.
   *     The contract stores the signer with Soroban temporary TTL storage —
   *     no server-side cleanup needed after expiry.
   *  6. On any failure after step 2, zero the private key and rethrow so we
   *     never hold an orphaned in-memory key for an unregistered signer.
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
      const challenge = await this._deriveChallenge({
        smartWalletAddress,
        sessionPublicKey: keypair.publicKey(),
        ttlSeconds,
      });

      // Step 4 — ONE biometric prompt per session
      const assertion = await this._assertCredential({
        credentialId: passkeyCredentialId,
        challenge,
      });

      // Step 5 — register signer on-chain via SmartWalletService.addSigner()
      await this._smartWalletService.addSigner({
        walletAddress: smartWalletAddress,
        sessionPublicKey: keypair.publicKey(),
        ttlSeconds,
        webAuthnAssertion: assertion,
      });
    } catch (err) {
      // Step 6 — zero key so we never hold an orphaned private key for a
      // signer that was never successfully registered on-chain.
      this._destroyPrivateKey();
      throw err;
    }

    return { ...this._sessionKey };
  }

  /**
   * sign
   *
   * Signs a 32-byte hash (typically a Soroban auth-entry hash) with the
   * active in-memory session key.
   *
   * This is a low-level primitive; prefer `signTransaction()` for the
   * full Soroban tx-signing flow.
   *
   * @param txHash  32-byte buffer to sign (Soroban auth-entry hash).
   * @returns       64-byte Ed25519 signature.
   * @throws        If no valid session exists or the session has expired.
   */
  sign(txHash: Buffer): Buffer {
    if (!this.isActive()) {
      this._destroyPrivateKey();
      throw new Error('No active session. Call createSession() first.');
    }

    const keypair = StellarSdk.Keypair.fromRawEd25519Seed(
      this._privateKeyBytes as Buffer
    );

    return Buffer.from(keypair.sign(txHash));
  }

  /**
   * signTransaction
   *
   * High-level convenience method: signs `sorobanTx` using the active
   * session key and returns fee-less Soroban XDR for the fee sponsor.
   *
   * ## Flow
   *  1. Verify the session is still active (throws if expired or missing).
   *  2. Delegate to `SmartWalletService.signWithSessionKey()`, passing a
   *     sign callback that uses the in-memory Ed25519 key.
   *     The service simulates the tx, computes the auth-entry hash, calls
   *     the callback, builds `AccountSignature::SessionKey(...)`, and
   *     assembles the XDR — all without a biometric prompt.
   *
   * @param sorobanTx      The Soroban invocation transaction to sign.
   * @param contractAddress Bech32 address of the smart wallet contract.
   * @param credentialId   Base64-encoded session-key credential ID.
   * @returns              Fee-less Soroban XDR (base64) for the fee sponsor.
   */
  async signTransaction(
    sorobanTx: Transaction,
    contractAddress: string,
    credentialId: string,
  ): Promise<string> {
    if (!this.isActive()) {
      this._destroyPrivateKey();
      throw new Error('No active session. Call createSession() first.');
    }

    // Bind `this` so the private key reference is captured safely inside the
    // callback.  The callback is called synchronously by signWithSessionKey
    // after simulation, so the key is guaranteed to still be in scope.
    const signFn = (authEntryHash: Buffer): Buffer => this.sign(authEntryHash);

    return this._smartWalletService.signWithSessionKey(
      contractAddress,
      sorobanTx,
      credentialId,
      signFn,
    );
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
   * A fresh biometric prompt is issued for the remove-signer tx — intentional,
   * since revocation is a deliberate infrequent user action.
   *
   * Safe to call when no session is active (no-op).
   */
  async revoke(
    smartWalletAddress: string,
    passkeyCredentialId: string
  ): Promise<void> {
    if (!this._sessionKey) return;

    const publicKey = this._sessionKey.publicKey;

    // Zero BEFORE the network call — key is gone regardless of what follows.
    this._destroyPrivateKey();

    const challenge = await this._deriveChallenge({
      smartWalletAddress,
      sessionPublicKey: publicKey,
      ttlSeconds: 0,
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

  private async _deriveChallenge(params: {
    smartWalletAddress: string;
    sessionPublicKey: string;
    ttlSeconds: number;
  }): Promise<ArrayBuffer> {
    const payload = `${params.smartWalletAddress}:${params.sessionPublicKey}:${params.ttlSeconds}`;
    const encoded = new TextEncoder().encode(payload);
    return crypto.subtle.digest('SHA-256', encoded);
  }

  private async _assertCredential(params: {
    credentialId: string;
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

  private _destroyPrivateKey(): void {
    if (this._privateKeyBytes) {
      this._privateKeyBytes.fill(0);
      this._privateKeyBytes = null;
    }
    this._sessionKey = null;
  }

  private _base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
