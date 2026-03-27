import {
  Transaction,
  xdr,
  StrKey,
  Networks,
  Contract,
  TransactionBuilder,
  BASE_FEE,
  nativeToScVal,
} from "@stellar/stellar-sdk";
import { Server, Api, assembleTransaction } from "@stellar/stellar-sdk/rpc";
import { WebAuthNProvider } from "../auth/src/providers/WebAuthNProvider";
import { convertSignatureDERtoCompact } from "../auth/src/providers/WebAuthNProvider";

// ---------------------------------------------------------------------------
// TTL helpers
// ---------------------------------------------------------------------------

/**
 * Approximate ledger close time on Stellar mainnet/testnet (seconds).
 * Used to convert a wall-clock TTL into a ledger count for Soroban storage.
 */
const LEDGER_CLOSE_TIME_SECONDS = 5;

/**
 * Converts a TTL expressed in seconds to the equivalent number of ledgers.
 * Rounds up so the session never expires earlier than requested.
 */
export function ttlSecondsToLedgers(ttlSeconds: number): number {
  return Math.ceil(ttlSeconds / LEDGER_CLOSE_TIME_SECONDS);
}

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

// ---------------------------------------------------------------------------
// addSigner / removeSigner params types
// ---------------------------------------------------------------------------

/**
 * Parameters for SmartWalletService.addSigner().
 *
 * Accepts either positional-style usage (direct SDK calls) OR the object-bag
 * signature expected by ISmartWalletService in SessionKeyManager.
 *
 * The WebAuthn assertion is optional: when provided (from SessionKeyManager,
 * which already has it in hand) the method skips the internal credential.get()
 * call and uses the pre-obtained assertion directly.  When absent the method
 * calls navigator.credentials.get() itself — same flow as sign().
 */
export interface AddSignerParams {
  /** Bech32 smart-wallet contract address (C…) */
  walletAddress: string;
  /** Stellar G-address of the Ed25519 session key to register */
  sessionPublicKey: string;
  /** Desired session lifetime in wall-clock seconds */
  ttlSeconds: number;
  /** Base64-encoded WebAuthn credential id used for signing */
  credentialId?: string;
  /**
   * Pre-obtained WebAuthn assertion from SessionKeyManager.
   * When provided, skips the internal navigator.credentials.get() call.
   */
  webAuthnAssertion?: PublicKeyCredential;
}

/**
 * Parameters for SmartWalletService.removeSigner().
 *
 * Always requires a pre-obtained WebAuthn assertion because revocation is a
 * deliberate user action that must be explicitly authorized.
 */
export interface RemoveSignerParams {
  /** Bech32 smart-wallet contract address (C…) */
  walletAddress: string;
  /** Stellar G-address of the Ed25519 session key to remove */
  signerPublicKey: string;
  /** Pre-obtained WebAuthn assertion authorizing the removal */
  webAuthnAssertion: PublicKeyCredential;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class SmartWalletService {
  private server: Server;
  private factoryContractId: string =
    "CAX5RLKVBMYLASX546TKXCZIQSROJGQ7DUIH3LUDG3PR4UB3RRW5O5PE";

  constructor(
    private webAuthnProvider: WebAuthNProvider,
    private rpcUrl: string,
    factoryId?: string,
    private network: string = Networks.TESTNET
  ) {
    this.server = new Server(rpcUrl);
    if (factoryId) {
      this.factoryContractId = factoryId;
    }
  }

  // -------------------------------------------------------------------------
  // addSigner()
  // -------------------------------------------------------------------------

  /**
   * Registers a session key as an on-chain `SessionSigner` inside the smart
   * wallet contract by invoking `add_session_signer(credential_id,
   * session_public_key, ttl_ledgers)`.
   *
   * ## Flow
   *  1. Build a Soroban invocation transaction (fee-less, for simulation).
   *  2. Simulate to obtain the auth-entry hash.
   *  3. If `webAuthnAssertion` was supplied (e.g. from SessionKeyManager which
   *     already prompted the user), use it directly.
   *     Otherwise, derive the hash as a WebAuthn challenge and call
   *     `navigator.credentials.get()` — same pattern as `sign()`.
   *  4. Attach the compact signature to the auth entry.
   *  5. Assemble and return the fee-less XDR for the sponsor.
   *
   * The TTL is stored in Soroban temporary storage so the signer auto-expires
   * after `ttlSeconds` — no manual revocation needed for normal flows.
   *
   * @returns Fully-signed Soroban transaction XDR (base64) for the fee sponsor
   */
  async addSigner(params: AddSignerParams): Promise<string> {
    const {
      walletAddress,
      sessionPublicKey,
      ttlSeconds,
      credentialId,
      webAuthnAssertion,
    } = params;

    if (!walletAddress) {
      throw new Error("addSigner: walletAddress is required");
    }
    if (!sessionPublicKey) {
      throw new Error("addSigner: sessionPublicKey is required");
    }
    if (ttlSeconds <= 0) {
      throw new Error(`addSigner: ttlSeconds must be positive, got ${ttlSeconds}`);
    }
    if (!webAuthnAssertion && !credentialId) {
      throw new Error(
        "addSigner: either webAuthnAssertion or credentialId must be provided"
      );
    }

    // Decode G-address → raw 32-byte Ed25519 public key
    const sessionPublicKeyBytes = StrKey.decodeEd25519PublicKey(sessionPublicKey);

    const ttlLedgers = ttlSecondsToLedgers(ttlSeconds);

    // ------------------------------------------------------------------
    // 1. Build the Soroban invocation transaction
    // ------------------------------------------------------------------

    const { sequence } = await this.server.getLatestLedger();

    // Dummy source account for simulation — the fee sponsor replaces it.
    const sourceAccount = {
      accountId: () => walletAddress,
      sequenceNumber: () => String(BigInt(sequence) + 1n),
      incrementSequenceNumber: () => {},
    } as unknown as ConstructorParameters<typeof TransactionBuilder>[0];

    const contract = new Contract(walletAddress);

    // Derive a base64url credentialId bytes placeholder for the on-chain call.
    // When coming from SessionKeyManager the credentialId may not be passed
    // (the assertion carries it), so we use a zero-bytes sentinel in that path.
    const credentialBytes = credentialId
      ? Buffer.from(base64UrlToUint8Array(credentialId))
      : Buffer.alloc(0);

    const invokeTx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.network,
    })
      .addOperation(
        contract.call(
          "add_session_signer",
          // credential_id: Bytes
          xdr.ScVal.scvBytes(credentialBytes),
          // session_public_key: Bytes (32-byte Ed25519 raw key)
          xdr.ScVal.scvBytes(Buffer.from(sessionPublicKeyBytes)),
          // ttl_ledgers: u32
          nativeToScVal(ttlLedgers, { type: "u32" })
        )
      )
      .setTimeout(300)
      .build();

    // ------------------------------------------------------------------
    // 2. Simulate to get the auth entry
    // ------------------------------------------------------------------

    const simResult = await this.server.simulateTransaction(invokeTx);

    if (Api.isSimulationError(simResult)) {
      throw new Error(`addSigner simulation failed: ${simResult.error}`);
    }

    if (!simResult.result?.auth?.length) {
      throw new Error("addSigner simulation returned no auth entries.");
    }

    const authEntry: xdr.SorobanAuthorizationEntry = simResult.result.auth[0];

    // ------------------------------------------------------------------
    // 3. Obtain the WebAuthn assertion
    // ------------------------------------------------------------------

    let assertionResponse: AuthenticatorAssertionResponse;
    let resolvedCredentialId: string;

    if (webAuthnAssertion) {
      // Caller (SessionKeyManager) already has the assertion — use it directly.
      assertionResponse =
        webAuthnAssertion.response as AuthenticatorAssertionResponse;
      resolvedCredentialId = credentialId ?? "";
    } else {
      // No pre-obtained assertion: derive challenge from auth entry hash and
      // prompt the user via navigator.credentials.get() — same as sign().
      const authEntryBytes = authEntry.toXDR();
      const authEntryArrayBuffer = authEntryBytes.buffer.slice(
        authEntryBytes.byteOffset,
        authEntryBytes.byteOffset + authEntryBytes.byteLength
      ) as ArrayBuffer;

      const authEntryHash = new Uint8Array(
        await crypto.subtle.digest("SHA-256", authEntryArrayBuffer)
      );

      const challenge = toBase64Url(authEntryHash);

      const pkCredential = (await navigator.credentials.get({
        publicKey: {
          challenge: Buffer.from(base64UrlToUint8Array(challenge)),
          rpId: (this.webAuthnProvider as any).rpId,
          allowCredentials: [
            {
              type: "public-key" as const,
              id: Buffer.from(base64UrlToUint8Array(credentialId!)),
            },
          ],
          userVerification: "required",
          timeout: 60_000,
        },
      })) as PublicKeyCredential | null;

      if (!pkCredential) {
        throw new Error(
          "addSigner: WebAuthn authentication was cancelled or timed out."
        );
      }

      assertionResponse = pkCredential.response as AuthenticatorAssertionResponse;
      resolvedCredentialId = credentialId!;
    }

    // ------------------------------------------------------------------
    // 4. Attach the compact signature to the auth entry
    // ------------------------------------------------------------------

    const authenticatorData = new Uint8Array(assertionResponse.authenticatorData);
    const clientDataJSON = new Uint8Array(assertionResponse.clientDataJSON);
    const compactSig = convertSignatureDERtoCompact(assertionResponse.signature);

    const signerSignature = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("authenticator_data"),
        val: xdr.ScVal.scvBytes(Buffer.from(authenticatorData)),
      }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("client_data_json"),
        val: xdr.ScVal.scvBytes(Buffer.from(clientDataJSON)),
      }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("id"),
        val: xdr.ScVal.scvBytes(
          resolvedCredentialId
            ? Buffer.from(base64UrlToUint8Array(resolvedCredentialId))
            : Buffer.alloc(0)
        ),
      }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("signature"),
        val: xdr.ScVal.scvBytes(Buffer.from(compactSig)),
      }),
    ]);

    authEntry.credentials(
      xdr.SorobanCredentials.sorobanCredentialsAddress(
        new xdr.SorobanAddressCredentials({
          address: xdr.ScAddress.scAddressTypeContract(
            Buffer.from(
              StrKey.decodeContract(walletAddress)
            ) as unknown as xdr.Hash
          ),
          nonce: authEntry.credentials().address().nonce(),
          signatureExpirationLedger: authEntry
            .credentials()
            .address()
            .signatureExpirationLedger(),
          signature: signerSignature,
        })
      )
    );

    simResult.result.auth[0] = authEntry;

    // ------------------------------------------------------------------
    // 5. Assemble and return fee-less XDR for the sponsor
    // ------------------------------------------------------------------

    const signedTx = assembleTransaction(invokeTx, simResult).build();
    return signedTx.toEnvelope().toXDR("base64");
  }

  // -------------------------------------------------------------------------
  // removeSigner()
  // -------------------------------------------------------------------------

  /**
   * Removes a session key from the on-chain smart wallet contract by invoking
   * `remove_session_signer(credential_id, session_public_key)`.
   *
   * Mirrors `addSigner()` but calls the remove contract entry point.  The
   * WebAuthn assertion must be pre-obtained by the caller (e.g. from
   * `SessionKeyManager.revoke()`, which prompts the user once before calling
   * this method).
   *
   * ## Flow
   *  1. Build a Soroban invocation calling `remove_session_signer`.
   *  2. Simulate to obtain the auth-entry hash.
   *  3. Sign the auth entry with the supplied WebAuthn assertion.
   *  4. Attach the signature and return fee-less XDR for the sponsor.
   *
   * @returns Signed fee-less Soroban XDR (base64) for the fee sponsor.
   */
  async removeSigner(params: RemoveSignerParams): Promise<string> {
    const { walletAddress, signerPublicKey, webAuthnAssertion } = params;

    if (!walletAddress) {
      throw new Error("removeSigner: walletAddress is required");
    }
    if (!signerPublicKey) {
      throw new Error("removeSigner: signerPublicKey is required");
    }
    if (!webAuthnAssertion) {
      throw new Error("removeSigner: webAuthnAssertion is required");
    }

    const sessionPublicKeyBytes = StrKey.decodeEd25519PublicKey(signerPublicKey);

    // ------------------------------------------------------------------
    // 1. Build the Soroban invocation transaction
    // ------------------------------------------------------------------

    const { sequence } = await this.server.getLatestLedger();

    const sourceAccount = {
      accountId: () => walletAddress,
      sequenceNumber: () => String(BigInt(sequence) + 1n),
      incrementSequenceNumber: () => {},
    } as unknown as ConstructorParameters<typeof TransactionBuilder>[0];

    const contract = new Contract(walletAddress);

    const invokeTx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.network,
    })
      .addOperation(
        contract.call(
          "remove_session_signer",
          // credential_id: Bytes (empty sentinel — session keys registered without explicit cred ID)
          xdr.ScVal.scvBytes(Buffer.alloc(0)),
          // session_public_key: BytesN<32>
          xdr.ScVal.scvBytes(Buffer.from(sessionPublicKeyBytes))
        )
      )
      .setTimeout(300)
      .build();

    // ------------------------------------------------------------------
    // 2. Simulate to get the auth entry
    // ------------------------------------------------------------------

    const simResult = await this.server.simulateTransaction(invokeTx);

    if (Api.isSimulationError(simResult)) {
      throw new Error(`removeSigner simulation failed: ${simResult.error}`);
    }

    if (!simResult.result?.auth?.length) {
      throw new Error("removeSigner simulation returned no auth entries.");
    }

    const authEntry: xdr.SorobanAuthorizationEntry = simResult.result.auth[0];

    // ------------------------------------------------------------------
    // 3. Sign with the pre-obtained WebAuthn assertion
    // ------------------------------------------------------------------

    const assertionResponse =
      webAuthnAssertion.response as AuthenticatorAssertionResponse;
    const authenticatorData = new Uint8Array(assertionResponse.authenticatorData);
    const clientDataJSON = new Uint8Array(assertionResponse.clientDataJSON);
    const compactSig = convertSignatureDERtoCompact(assertionResponse.signature);

    // Credential ID comes from the assertion (the passkey that signed, not the session key).
    const credIdBytes = base64UrlToUint8Array(webAuthnAssertion.id);

    const signerSignature = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("authenticator_data"),
        val: xdr.ScVal.scvBytes(Buffer.from(authenticatorData)),
      }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("client_data_json"),
        val: xdr.ScVal.scvBytes(Buffer.from(clientDataJSON)),
      }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("id"),
        val: xdr.ScVal.scvBytes(Buffer.from(credIdBytes)),
      }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("signature"),
        val: xdr.ScVal.scvBytes(Buffer.from(compactSig)),
      }),
    ]);

    authEntry.credentials(
      xdr.SorobanCredentials.sorobanCredentialsAddress(
        new xdr.SorobanAddressCredentials({
          address: xdr.ScAddress.scAddressTypeContract(
            Buffer.from(
              StrKey.decodeContract(walletAddress)
            ) as unknown as xdr.Hash
          ),
          nonce: authEntry.credentials().address().nonce(),
          signatureExpirationLedger: authEntry
            .credentials()
            .address()
            .signatureExpirationLedger(),
          signature: signerSignature,
        })
      )
    );

    simResult.result.auth[0] = authEntry;

    // ------------------------------------------------------------------
    // 4. Assemble and return fee-less XDR for the sponsor
    // ------------------------------------------------------------------

    const signedTx = assembleTransaction(invokeTx, simResult).build();
    return signedTx.toEnvelope().toXDR("base64");
  }

  // -------------------------------------------------------------------------
  // signWithSessionKey()
  // -------------------------------------------------------------------------

  /**
   * Signs a Soroban transaction using an active Ed25519 session key.
   *
   * This is the session-key counterpart of `sign()`.  Instead of prompting
   * the user for a biometric gesture, it accepts a `signFn` callback that
   * signs the 32-byte auth-entry hash with the in-memory session keypair held
   * by `SessionKeyManager`.
   *
   * ## Flow
   *  1. Simulate `sorobanTx` to obtain the auth entry (nonce + expiration).
   *  2. Compute `authEntryHash = SHA-256(authEntry.toXDR())`.
   *  3. Call `signFn(authEntryHash)` → 64-byte Ed25519 signature.
   *  4. Build the session-key signature ScVal `{ id, signature }`.
   *  5. Attach to the auth entry and return assembled fee-less XDR.
   *
   * @param contractAddress  Bech32 address of the smart wallet contract.
   * @param sorobanTx        The Soroban invocation transaction to sign.
   * @param credentialId     Base64-encoded credential ID of the session key.
   * @param signFn           Signs the 32-byte auth-entry hash; must return a
   *                         64-byte Ed25519 signature.
   * @returns                Signed fee-less Soroban XDR (base64) for the sponsor.
   */
  async signWithSessionKey(
    contractAddress: string,
    sorobanTx: Transaction,
    credentialId: string,
    signFn: (authEntryHash: Buffer) => Buffer
  ): Promise<string> {
    if (!contractAddress) {
      throw new Error("signWithSessionKey: contractAddress is required");
    }
    if (!credentialId) {
      throw new Error("signWithSessionKey: credentialId is required");
    }

    // 1. Simulate to get the auth entry
    const simResult = await this.server.simulateTransaction(sorobanTx);

    if (Api.isSimulationError(simResult)) {
      throw new Error(`signWithSessionKey simulation failed: ${simResult.error}`);
    }

    if (!simResult.result?.auth?.length) {
      throw new Error("signWithSessionKey simulation returned no auth entries.");
    }

    const authEntry: xdr.SorobanAuthorizationEntry = simResult.result.auth[0];

    // 2. Compute the 32-byte auth-entry hash (= signature_payload in __check_auth)
    const authEntryBytes = authEntry.toXDR();
    const authEntryArrayBuffer = authEntryBytes.buffer.slice(
      authEntryBytes.byteOffset,
      authEntryBytes.byteOffset + authEntryBytes.byteLength
    ) as ArrayBuffer;

    const authEntryHash = Buffer.from(
      await crypto.subtle.digest("SHA-256", authEntryArrayBuffer)
    );

    // 3. Invoke the caller's sign callback with the hash
    const ed25519Sig = signFn(authEntryHash);

    if (!ed25519Sig || ed25519Sig.byteLength !== 64) {
      throw new Error(
        "signWithSessionKey: signFn must return a 64-byte Ed25519 signature"
      );
    }

    // 4. Build session-key signature ScVal { id, signature }
    const credentialIdBytes = base64UrlToUint8Array(credentialId);

    const signerSignature = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("id"),
        val: xdr.ScVal.scvBytes(Buffer.from(credentialIdBytes)),
      }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("signature"),
        val: xdr.ScVal.scvBytes(Buffer.from(ed25519Sig)),
      }),
    ]);

    authEntry.credentials(
      xdr.SorobanCredentials.sorobanCredentialsAddress(
        new xdr.SorobanAddressCredentials({
          address: xdr.ScAddress.scAddressTypeContract(
            Buffer.from(
              StrKey.decodeContract(contractAddress)
            ) as unknown as xdr.Hash
          ),
          nonce: authEntry.credentials().address().nonce(),
          signatureExpirationLedger: authEntry
            .credentials()
            .address()
            .signatureExpirationLedger(),
          signature: signerSignature,
        })
      )
    );

    simResult.result.auth[0] = authEntry;

    // 5. Assemble and return fee-less XDR
    const signedTx = assembleTransaction(sorobanTx, simResult).build();
    return signedTx.toEnvelope().toXDR("base64");
  }

  // -------------------------------------------------------------------------
  // sign()  (unchanged from original)
  // -------------------------------------------------------------------------

  /**
   * Simulates the tx, uses the auth entry hash as the WebAuthn challenge,
   * attaches the passkey signature, and returns fee-less XDR for the sponsor.
   */
  async sign(
    contractAddress: string,
    sorobanTx: Transaction,
    credentialId: string
  ): Promise<string> {
    const simResult = await this.server.simulateTransaction(sorobanTx);

    if (Api.isSimulationError(simResult)) {
      throw new Error(`Simulation failed: ${simResult.error}`);
    }

    if (!simResult.result?.auth?.length) {
      throw new Error("Simulation returned no auth entries.");
    }

    const authEntry: xdr.SorobanAuthorizationEntry = simResult.result.auth[0];

    const authEntryBytes = authEntry.toXDR();
    const authEntryArrayBuffer = authEntryBytes.buffer.slice(
      authEntryBytes.byteOffset,
      authEntryBytes.byteOffset + authEntryBytes.byteLength
    ) as ArrayBuffer;

    const authEntryHash = new Uint8Array(
      await crypto.subtle.digest("SHA-256", authEntryArrayBuffer)
    );

    const challenge = toBase64Url(authEntryHash);

    const pkCredential = (await navigator.credentials.get({
      publicKey: {
        challenge: Buffer.from(base64UrlToUint8Array(challenge)),
        rpId: (this.webAuthnProvider as any).rpId,
        allowCredentials: [
          {
            type: "public-key" as const,
            id: Buffer.from(base64UrlToUint8Array(credentialId)),
          },
        ],
        userVerification: "required",
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;

    if (!pkCredential) {
      throw new Error("WebAuthn authentication was cancelled or timed out.");
    }

    const assertionResponse =
      pkCredential.response as AuthenticatorAssertionResponse;

    const authenticatorData = new Uint8Array(assertionResponse.authenticatorData);
    const clientDataJSON = new Uint8Array(assertionResponse.clientDataJSON);
    const compactSig = convertSignatureDERtoCompact(assertionResponse.signature);

    const signerSignature = xdr.ScVal.scvMap([
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("authenticator_data"),
        val: xdr.ScVal.scvBytes(Buffer.from(authenticatorData)),
      }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("client_data_json"),
        val: xdr.ScVal.scvBytes(Buffer.from(clientDataJSON)),
      }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("id"),
        val: xdr.ScVal.scvBytes(
          Buffer.from(base64UrlToUint8Array(credentialId))
        ),
      }),
      new xdr.ScMapEntry({
        key: xdr.ScVal.scvSymbol("signature"),
        val: xdr.ScVal.scvBytes(Buffer.from(compactSig)),
      }),
    ]);

    authEntry.credentials(
      xdr.SorobanCredentials.sorobanCredentialsAddress(
        new xdr.SorobanAddressCredentials({
          address: xdr.ScAddress.scAddressTypeContract(
            Buffer.from(
              StrKey.decodeContract(contractAddress)
            ) as unknown as xdr.Hash
          ),
          nonce: authEntry.credentials().address().nonce(),
          signatureExpirationLedger: authEntry
            .credentials()
            .address()
            .signatureExpirationLedger(),
          signature: signerSignature,
        })
      )
    );

    simResult.result.auth[0] = authEntry;

    const signedTx = assembleTransaction(sorobanTx, simResult).build();
    return signedTx.toEnvelope().toXDR("base64");
  }

  // -------------------------------------------------------------------------
  // deploy()  (unchanged from original)
  // -------------------------------------------------------------------------

  /**
   * Simulates the factory tx and returns the deployed contract address.
   * Caller is responsible for building the factory invocation transaction.
   *
   * TODO: move factory tx construction here once the factory ABI is finalised.
   */
  async deploy(
    _publicKey65Bytes: Uint8Array,
    factoryTx: Transaction
  ): Promise<string> {
    const deployResult = await this.server.simulateTransaction(factoryTx);

    if (Api.isSimulationError(deployResult)) {
      throw new Error(`Deploy simulation failed: ${deployResult.error}`);
    }

    const contractAddress: string | undefined = (deployResult as any).result
      ?.retval?.address()
      ?.contractId()
      ?.toString("hex");

    if (!contractAddress) {
      throw new Error("Factory did not return a contract address.");
    }

    return contractAddress;
  }
}