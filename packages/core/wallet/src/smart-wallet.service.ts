import {
  Address,
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
import { convertSignatureDERtoCompact } from "../auth/src/providers/WebAuthNProvider";
import { BrowserCredentialBackend } from "./credential-backends/browser.backend";
import type {
  CredentialBackend,
  SmartWalletWebAuthnProvider,
} from "./types/smart-wallet.types";

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
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function base64ToUint8Array(base64: string): Uint8Array {
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

// ---------------------------------------------------------------------------
// ScVal builders for AccountSignature enum
// ---------------------------------------------------------------------------
//
// The Soroban `AccountSignature` contracttype enum is encoded as a single-entry
// ScMap: { key: scvSymbol("VariantName"), val: <variant payload> }.
//
// AccountSignature::WebAuthn(Signature)    → {WebAuthn:   <Signature map>}
// AccountSignature::SessionKey(SessionSig) → {SessionKey: <SessionSig map>}

/**
 * Build the ScVal for `AccountSignature::WebAuthn(sig)`.
 * Wraps the four WebAuthn fields (authenticator_data, client_data_json, id,
 * signature) in the discriminated-union encoding expected by __check_auth.
 */
function buildWebAuthnSignatureScVal(
  authenticatorData: Uint8Array,
  clientDataJSON: Uint8Array,
  credentialIdBytes: Uint8Array,
  compactSig: Uint8Array
): xdr.ScVal {
  const innerSig = xdr.ScVal.scvMap([
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
      val: xdr.ScVal.scvBytes(Buffer.from(credentialIdBytes)),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("signature"),
      val: xdr.ScVal.scvBytes(Buffer.from(compactSig)),
    }),
  ]);

  // Wrap in AccountSignature::WebAuthn enum variant
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("WebAuthn"),
      val: innerSig,
    }),
  ]);
}

/**
 * Build the ScVal for `AccountSignature::SessionKey(sig)`.
 * Wraps the credential ID and 64-byte Ed25519 signature in the
 * discriminated-union encoding expected by __check_auth.
 */
function buildSessionKeySignatureScVal(
  credentialIdBytes: Uint8Array,
  ed25519Sig: Uint8Array
): xdr.ScVal {
  const innerSig = xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("id"),
      val: xdr.ScVal.scvBytes(Buffer.from(credentialIdBytes)),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("signature"),
      val: xdr.ScVal.scvBytes(Buffer.from(ed25519Sig)),
    }),
  ]);

  // Wrap in AccountSignature::SessionKey enum variant
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol("SessionKey"),
      val: innerSig,
    }),
  ]);
}

// ---------------------------------------------------------------------------
// Shared helper — attach a signature ScVal to a Soroban auth entry
// ---------------------------------------------------------------------------

function attachSignatureToAuthEntry(
  authEntry: xdr.SorobanAuthorizationEntry,
  contractAddress: string,
  signatureScVal: xdr.ScVal
): void {
  const contractScAddress = new Address(contractAddress).toScAddress();
  const currentCredentials = authEntry.credentials().address();

  authEntry.credentials(
    xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: contractScAddress,
        nonce: currentCredentials.nonce(),
        signatureExpirationLedger: currentCredentials.signatureExpirationLedger(),
        signature: signatureScVal,
      })
    )
  );
}

function isAuthenticatorAssertionResponse(
  response: AuthenticatorResponse
): response is AuthenticatorAssertionResponse {
  return (
    "authenticatorData" in response &&
    "clientDataJSON" in response &&
    "signature" in response
  );
}

function getAssertionResponse(
  credential: PublicKeyCredential
): AuthenticatorAssertionResponse {
  if (!isAuthenticatorAssertionResponse(credential.response)) {
    throw new Error(
      "SmartWalletService expected an AuthenticatorAssertionResponse from the credential backend."
    );
  }

  return credential.response;
}

function getAuthEntryArrayBuffer(
  authEntry: xdr.SorobanAuthorizationEntry
): ArrayBuffer {
  const authEntryBytes = authEntry.toXDR();
  return Uint8Array.from(authEntryBytes).buffer;
}

function getContractAddressFromSimulation(
  deployResult: Awaited<ReturnType<Server["simulateTransaction"]>>
): string | null {
  const retval = deployResult.result?.retval;
  if (!retval || typeof retval !== "object" || !("address" in retval)) {
    return null;
  }

  const addressFn = retval.address;
  if (typeof addressFn !== "function") {
    return null;
  }

  const addressResult = addressFn.call(retval);
  if (
    !addressResult ||
    typeof addressResult !== "object" ||
    !("contractId" in addressResult)
  ) {
    return null;
  }

  const contractIdFn = addressResult.contractId;
  if (typeof contractIdFn !== "function") {
    return null;
  }

  const contractId = contractIdFn.call(addressResult);
  if (
    !contractId ||
    typeof contractId !== "object" ||
    !("toString" in contractId)
  ) {
    return null;
  }

  const toStringFn = contractId.toString;
  if (typeof toStringFn !== "function") {
    return null;
  }

  const value = toStringFn.call(contractId, "hex");
  return typeof value === "string" && value.length > 0 ? value : null;
}

// ---------------------------------------------------------------------------
// addSigner params type
// ---------------------------------------------------------------------------

/**
 * Parameters for SmartWalletService.addSigner().
 *
 * Accepts either positional-style usage (direct SDK calls) OR the object-bag
 * signature expected by ISmartWalletService in SessionKeyManager.
 *
 * The WebAuthn assertion is optional: when provided (from SessionKeyManager,
 * which already has it in hand) the method skips the internal credential
 * backend call and uses the pre-obtained assertion directly. When absent the
 * method requests an assertion through the injected credential backend — same
 * flow as sign().
 */
export interface AddSignerParams {
  /** Bech32 smart-wallet contract address (C…) */
  walletAddress: string;
  /** Base64url credential ID of the new signer to register */
  signerCredentialId: string;
  /** Base64-encoded 65-byte uncompressed SEC-1 P-256 public key */
  signerPublicKey: string;
  /** Base64url credential ID of an existing authorized signer */
  authCredentialId?: string;
  /**
   * Pre-obtained WebAuthn assertion from an existing authorized signer.
   * When provided, skips the internal navigator.credentials.get() call.
   */
  webAuthnAssertion?: PublicKeyCredential;
  /**
   * Backward-compatible session signer fields. If present, `addSigner` routes
   * to `addSessionSigner`.
   */
  sessionPublicKey?: string;
  ttlSeconds?: number;
  credentialId?: string;
}

export interface AddSessionSignerParams {
  walletAddress: string;
  sessionPublicKey: string;
  ttlSeconds: number;
  credentialId?: string;
  webAuthnAssertion?: PublicKeyCredential;
}

export interface RemoveSignerParams {
  walletAddress: string;
  signerCredentialId?: string;
  signerPublicKey?: string;
  authCredentialId?: string;
  credentialId?: string;
  webAuthnAssertion?: PublicKeyCredential;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class SmartWalletService {
  private server: Server;
  private factoryContractId: string =
    "CAX5RLKVBMYLASX546TKXCZIQSROJGQ7DUIH3LUDG3PR4UB3RRW5O5PE";
  private credentialBackend: CredentialBackend;

  constructor(
    private webAuthnProvider: SmartWalletWebAuthnProvider,
    private rpcUrl: string,
    factoryId?: string,
    private network: string = Networks.TESTNET,
    credentialBackend: CredentialBackend = new BrowserCredentialBackend()
  ) {
    this.server = new Server(rpcUrl);
    this.credentialBackend = credentialBackend;
    if (factoryId) {
      this.factoryContractId = factoryId;
    }
  }

  // -------------------------------------------------------------------------
  // addSigner()
  // -------------------------------------------------------------------------

  /**
   * Registers an additional admin signer by invoking
   * `add_signer(credential_id, public_key)`.
   *
   * The action is authorized by any already-registered signer.
   *
   * ## Flow
   *  1. Build a Soroban invocation transaction (fee-less, for simulation).
   *  2. Simulate to obtain the auth-entry hash.
   *  3. If `webAuthnAssertion` was supplied (e.g. from SessionKeyManager which
   *     already prompted the user), use it directly.
   *     Otherwise, derive the hash as a WebAuthn challenge and request a
   *     credential assertion through the configured credential backend.
   *  4. Attach the compact `AccountSignature::WebAuthn(...)` signature to the
   *     auth entry.
   *  5. Assemble and return the fee-less XDR for the sponsor.
   *
   * The TTL is stored in Soroban temporary storage so the signer auto-expires
   * after `ttlSeconds` — no manual revocation needed for normal flows.
   *
   * @returns Fully-signed Soroban transaction XDR (base64) for the fee sponsor
   */
  async addSigner(params: AddSignerParams): Promise<string> {
    const isLegacySessionPath =
      params.sessionPublicKey !== undefined ||
      params.ttlSeconds !== undefined ||
      params.credentialId !== undefined;
    if (isLegacySessionPath) {
      try {
        return await this.addSessionSigner({
          walletAddress: params.walletAddress,
          sessionPublicKey: params.sessionPublicKey ?? "",
          ttlSeconds: params.ttlSeconds ?? 0,
          credentialId: params.credentialId,
          webAuthnAssertion: params.webAuthnAssertion,
        });
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(error.message.replace(/addSessionSigner/g, "addSigner"));
        }
        throw error;
      }
    }

    const {
      walletAddress,
      signerCredentialId,
      signerPublicKey,
      authCredentialId,
      webAuthnAssertion,
    } = params;

    if (!walletAddress) throw new Error("addSigner: walletAddress is required");
    if (!signerCredentialId) throw new Error("addSigner: signerCredentialId is required");
    if (!signerPublicKey) throw new Error("addSigner: signerPublicKey is required");
    if (!webAuthnAssertion && !authCredentialId) {
      throw new Error("addSigner: either webAuthnAssertion or authCredentialId must be provided");
    }

    const signerPublicKeyBytes = base64ToUint8Array(signerPublicKey);
    if (signerPublicKeyBytes.byteLength !== 65 || signerPublicKeyBytes[0] !== 0x04) {
      throw new Error("addSigner: signerPublicKey must be a base64-encoded 65-byte uncompressed SEC-1 key");
    }

    const { sequence } = await this.server.getLatestLedger();
    const sourceAccount = {
      accountId: () => walletAddress,
      sequenceNumber: () => String(BigInt(sequence) + 1n),
      incrementSequenceNumber: () => {},
    } as unknown as ConstructorParameters<typeof TransactionBuilder>[0];

    const invokeTx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.network,
    })
      .addOperation(
        new Contract(walletAddress).call(
          "add_signer",
          xdr.ScVal.scvBytes(Buffer.from(base64UrlToUint8Array(signerCredentialId))),
          xdr.ScVal.scvBytes(Buffer.from(signerPublicKeyBytes))
        )
      )
      .setTimeout(300)
      .build();

    const simResult = await this.server.simulateTransaction(invokeTx);
    if (Api.isSimulationError(simResult)) {
      throw new Error(`addSigner simulation failed: ${simResult.error}`);
    }
    if (!simResult.result?.auth?.length) {
      throw new Error("addSigner simulation returned no auth entries.");
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

    let assertion: PublicKeyCredential | null = webAuthnAssertion ?? null;
    if (!assertion) {
      assertion = (await navigator.credentials.get({
        publicKey: {
          challenge: Buffer.from(base64UrlToUint8Array(challenge)),
          rpId: (this.webAuthnProvider as any).rpId,
          allowCredentials: [
            {
              type: "public-key" as const,
              id: Buffer.from(base64UrlToUint8Array(authCredentialId!)),
            },
          ],
          userVerification: "required",
          timeout: 60_000,
        },
      })) as PublicKeyCredential | null;
    }
    if (!assertion) {
      throw new Error("addSigner: WebAuthn authentication was cancelled or timed out.");
    }

    const resolvedAuthCredentialId = authCredentialId ?? assertion.id;
    if (!resolvedAuthCredentialId) {
      throw new Error("addSigner: unable to resolve auth credential id");
    }

    const assertionResponse = assertion.response as AuthenticatorAssertionResponse;
    const signerSignature = buildWebAuthnSignatureScVal(
      new Uint8Array(assertionResponse.authenticatorData),
      new Uint8Array(assertionResponse.clientDataJSON),
      base64UrlToUint8Array(resolvedAuthCredentialId),
      convertSignatureDERtoCompact(assertionResponse.signature)
    );

    attachSignatureToAuthEntry(authEntry, walletAddress, signerSignature);
    simResult.result.auth[0] = authEntry;
    const signedTx = assembleTransaction(invokeTx, simResult).build();
    return signedTx.toEnvelope().toXDR("base64");
  }

  async addSessionSigner(params: AddSessionSignerParams): Promise<string> {
    const {
      walletAddress,
      sessionPublicKey,
      ttlSeconds,
      credentialId,
      webAuthnAssertion,
    } = params;

    if (!walletAddress) {
      throw new Error("addSessionSigner: walletAddress is required");
    }
    if (!sessionPublicKey) {
      throw new Error("addSessionSigner: sessionPublicKey is required");
    }
    if (ttlSeconds <= 0) {
      throw new Error(`addSessionSigner: ttlSeconds must be positive, got ${ttlSeconds}`);
    }
    if (!webAuthnAssertion && !credentialId) {
      throw new Error(
        "addSessionSigner: either webAuthnAssertion or credentialId must be provided"
      );
    }

    const sessionPublicKeyBytes = StrKey.decodeEd25519PublicKey(sessionPublicKey);
    const ttlLedgers = ttlSecondsToLedgers(ttlSeconds);
    const { sequence } = await this.server.getLatestLedger();
    const sourceAccount: ConstructorParameters<typeof TransactionBuilder>[0] = {
      accountId: () => walletAddress,
      sequenceNumber: () => String(BigInt(sequence) + 1n),
      incrementSequenceNumber: () => undefined,
    };

    const contract = new Contract(walletAddress);
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
          xdr.ScVal.scvBytes(credentialBytes),
          xdr.ScVal.scvBytes(Buffer.from(sessionPublicKeyBytes)),
          nativeToScVal(ttlLedgers, { type: "u32" })
        )
      )
      .setTimeout(300)
      .build();

    const simResult = await this.server.simulateTransaction(invokeTx);
    if (Api.isSimulationError(simResult)) {
      throw new Error(`addSessionSigner simulation failed: ${simResult.error}`);
    }
    if (!simResult.result?.auth?.length) {
      throw new Error("addSessionSigner simulation returned no auth entries.");
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

    let assertionResponse: AuthenticatorAssertionResponse;
    let resolvedCredentialId: string;

    if (webAuthnAssertion) {
      assertionResponse = getAssertionResponse(webAuthnAssertion);
      resolvedCredentialId = credentialId ?? webAuthnAssertion.id ?? "";
    } else {
      const pkCredential = await this.credentialBackend.get({
        publicKey: {
          challenge: Buffer.from(base64UrlToUint8Array(challenge)),
          rpId: this.webAuthnProvider.relyingPartyId,
          allowCredentials: [
            {
              type: "public-key" as const,
              id: Buffer.from(base64UrlToUint8Array(credentialId!)),
            },
          ],
          userVerification: "required",
          timeout: 60_000,
        },
      });

      if (!pkCredential) {
        throw new Error(
          "addSessionSigner: WebAuthn authentication was cancelled or timed out."
        );
      }

      assertionResponse = getAssertionResponse(pkCredential);
      resolvedCredentialId = credentialId!;
    }

    const signerSignature = buildWebAuthnSignatureScVal(
      new Uint8Array(assertionResponse.authenticatorData),
      new Uint8Array(assertionResponse.clientDataJSON),
      resolvedCredentialId
        ? base64UrlToUint8Array(resolvedCredentialId)
        : new Uint8Array(0),
      convertSignatureDERtoCompact(assertionResponse.signature)
    );

    attachSignatureToAuthEntry(authEntry, walletAddress, signerSignature);
    simResult.result.auth[0] = authEntry;
    const signedTx = assembleTransaction(invokeTx, simResult).build();
    return signedTx.toEnvelope().toXDR("base64");
  }

  // -------------------------------------------------------------------------
  // removeSigner()
  // -------------------------------------------------------------------------

  /**
   * Removes a credential-backed signer from the smart wallet contract.
   *
   * The returned XDR is fee-less and intended to be submitted by a sponsor.
   */
  async removeSigner(params: RemoveSignerParams): Promise<string> {
    const { walletAddress, credentialId, webAuthnAssertion } = params;

    if (!walletAddress) {
      throw new Error("removeSigner: walletAddress is required");
    }
    if (!webAuthnAssertion && !credentialId) {
      throw new Error(
        "removeSigner: either webAuthnAssertion or credentialId must be provided"
      );
    }

    const { sequence } = await this.server.getLatestLedger();
    const sourceAccount: ConstructorParameters<typeof TransactionBuilder>[0] = {
      accountId: () => walletAddress,
      sequenceNumber: () => String(BigInt(sequence) + 1n),
      incrementSequenceNumber: () => undefined,
    };

    const contract = new Contract(walletAddress);
    const credentialBytes = credentialId
      ? Buffer.from(base64UrlToUint8Array(credentialId))
      : Buffer.alloc(0);

    const invokeTx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.network,
    })
      .addOperation(
        contract.call(
          "remove_signer",
          xdr.ScVal.scvBytes(credentialBytes)
        )
      )
      .setTimeout(300)
      .build();

    const simResult = await this.server.simulateTransaction(invokeTx);

    if (Api.isSimulationError(simResult)) {
      throw new Error(`removeSigner simulation failed: ${simResult.error}`);
    }

    if (!simResult.result?.auth?.length) {
      throw new Error("removeSigner simulation returned no auth entries.");
    }

    const authEntry: xdr.SorobanAuthorizationEntry = simResult.result.auth[0];

    let assertionResponse: AuthenticatorAssertionResponse;

    if (webAuthnAssertion) {
      assertionResponse = getAssertionResponse(webAuthnAssertion);
    } else {
      const authEntryHash = new Uint8Array(
        await crypto.subtle.digest(
          "SHA-256",
          getAuthEntryArrayBuffer(authEntry)
        )
      );

      const challenge = toBase64Url(authEntryHash);
      const pkCredential = await this.credentialBackend.get({
        publicKey: {
          challenge: Buffer.from(base64UrlToUint8Array(challenge)),
          rpId: this.webAuthnProvider.relyingPartyId,
          allowCredentials: [
            {
              type: "public-key" as const,
              id: Buffer.from(base64UrlToUint8Array(credentialId!)),
            },
          ],
          userVerification: "required",
          timeout: 60_000,
        },
      });

      if (!pkCredential) {
        throw new Error(
          "removeSigner: WebAuthn authentication was cancelled or timed out."
        );
      }

      assertionResponse = getAssertionResponse(pkCredential);
    }

    const authenticatorData = new Uint8Array(assertionResponse.authenticatorData);
    const clientDataJSON = new Uint8Array(assertionResponse.clientDataJSON);
    const compactSig = convertSignatureDERtoCompact(assertionResponse.signature);
    const signerSignature = buildWebAuthnSignatureScVal(
      authenticatorData,
      clientDataJSON,
      credentialBytes,
      compactSig
    );

    attachSignatureToAuthEntry(authEntry, walletAddress, signerSignature);
    simResult.result.auth[0] = authEntry;

    const signedTx = assembleTransaction(invokeTx, simResult).build();
    return signedTx.toEnvelope().toXDR("base64");
  }

  // -------------------------------------------------------------------------
  // sign()
  // -------------------------------------------------------------------------

  /**
   * Signs a Soroban transaction with a WebAuthn passkey (admin signer path).
   *
   * Simulates the tx, uses the auth entry hash as the WebAuthn challenge,
   * attaches an `AccountSignature::WebAuthn(...)` signature, and returns
   * fee-less XDR for the sponsor.
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

    const authEntryHash = new Uint8Array(
      await crypto.subtle.digest("SHA-256", getAuthEntryArrayBuffer(authEntry))
    );

    const challenge = toBase64Url(authEntryHash);

    const pkCredential = await this.credentialBackend.get({
      publicKey: {
        challenge: Buffer.from(base64UrlToUint8Array(challenge)),
        rpId: this.webAuthnProvider.relyingPartyId,
        allowCredentials: [
          {
            type: "public-key" as const,
            id: Buffer.from(base64UrlToUint8Array(credentialId)),
          },
        ],
        userVerification: "required",
        timeout: 60000,
      },
    });

    if (!pkCredential) {
      throw new Error("WebAuthn authentication was cancelled or timed out.");
    }

    const assertionResponse = getAssertionResponse(pkCredential);

    const authenticatorData = new Uint8Array(assertionResponse.authenticatorData);
    const clientDataJSON = new Uint8Array(assertionResponse.clientDataJSON);
    const compactSig = convertSignatureDERtoCompact(assertionResponse.signature);

    const signerSignature = buildWebAuthnSignatureScVal(
      authenticatorData,
      clientDataJSON,
      base64UrlToUint8Array(credentialId),
      compactSig
    );

    attachSignatureToAuthEntry(authEntry, contractAddress, signerSignature);
    simResult.result.auth[0] = authEntry;

    const signedTx = assembleTransaction(sorobanTx, simResult).build();
    return signedTx.toEnvelope().toXDR("base64");
  }

  // -------------------------------------------------------------------------
  // signWithSessionKey()
  // -------------------------------------------------------------------------

  /**
   * Signs a Soroban transaction using an active Ed25519 session key.
   *
   * This is the session-key counterpart of `sign()`.  Instead of prompting the
   * user with a biometric gesture, it accepts a `signFn` callback that signs
   * the 32-byte auth-entry hash with the in-memory session keypair.
   *
   * The typical caller is `SessionKeyManager.signTransaction()`, which holds
   * the private key in memory and provides it as a synchronous sign callback.
   *
   * ## Flow
   *  1. Simulate `sorobanTx` to obtain the auth entry (populated with nonce +
   *     expiration).
   *  2. Compute `authEntryHash = SHA-256(authEntry.toXDR())` — this is the
   *     32-byte value the contract will receive as `signature_payload`.
   *  3. Call `signFn(authEntryHash)` → 64-byte Ed25519 signature.
   *  4. Build `AccountSignature::SessionKey({id, signature})` ScVal.
   *  5. Attach to auth entry and return assembled fee-less XDR.
   *
   * @param contractAddress  Bech32 address of the smart wallet contract.
   * @param sorobanTx        The Soroban invocation transaction to sign.
   * @param credentialId     Base64-encoded credential ID of the session key.
   * @param signFn           Callback: receives 32-byte hash, returns 64-byte Ed25519 sig.
   * @returns                Signed fee-less Soroban XDR (base64) for the fee sponsor.
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
    const authEntryHash = Buffer.from(
      await crypto.subtle.digest("SHA-256", getAuthEntryArrayBuffer(authEntry))
    );

    // 3. Invoke the caller's sign callback with the hash
    const ed25519Sig = signFn(authEntryHash);

    if (!ed25519Sig || ed25519Sig.byteLength !== 64) {
      throw new Error("signWithSessionKey: signFn must return a 64-byte Ed25519 signature");
    }

    // 4. Build AccountSignature::SessionKey ScVal
    const credentialIdBytes = base64UrlToUint8Array(credentialId);
    const signerSignature = buildSessionKeySignatureScVal(credentialIdBytes, ed25519Sig);

    // 5. Attach to auth entry and assemble XDR
    attachSignatureToAuthEntry(authEntry, contractAddress, signerSignature);
    simResult.result.auth[0] = authEntry;

    const signedTx = assembleTransaction(sorobanTx, simResult).build();
    return signedTx.toEnvelope().toXDR("base64");
  }

  // -------------------------------------------------------------------------
  // deploy()
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

    const contractAddress = getContractAddressFromSimulation(deployResult);

    if (!contractAddress) {
      throw new Error("Factory did not return a contract address.");
    }

    return contractAddress;
  }
}
