import {
  Transaction,
  xdr,
  StrKey,
  Networks,
  Contract,
  TransactionBuilder,
  BASE_FEE,
  nativeToScVal,
  Address,
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
// addSigner params type
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Validated DeFi Router contract IDs */
const VALIDATED_DEFI_ROUTERS = [
  "CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD", // Soroswap Testnet
  "CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH", // Soroswap Mainnet
];

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

    // Process all authorization entries
    for (let i = 0; i < simResult.result.auth.length; i++) {
      const authEntry: xdr.SorobanAuthorizationEntry = simResult.result.auth[i];

      // 1. Validate DeFi authorization entries (Soroswap, etc.)
      this.validateDeFiAuthorization(authEntry, contractAddress);

      // 2. Obtain Passkey signature
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

      simResult.result.auth[i] = authEntry;
    }

    const signedTx = assembleTransaction(sorobanTx, simResult).build();
    return signedTx.toEnvelope().toXDR("base64");
  }

  /**
   * Validates that DeFi-related authorization entries are safe (e.g. swap 'to' address
   * matches the wallet address).
   */
  private validateDeFiAuthorization(
    authEntry: xdr.SorobanAuthorizationEntry,
    walletAddress: string
  ): void {
    const rootInvocation = authEntry.rootInvocation();
    const functionAuth = rootInvocation.function();

    if (
      functionAuth.switch() !==
      xdr.SorobanAuthorizedFunctionType.sorobanAuthorizedFunctionTypeContractFn()
    ) {
      return;
    }

    const contractFn = functionAuth.contractFn();
    const contractId = Address.fromScVal(
      xdr.ScVal.scvAddress(contractFn.contractAddress())
    ).toString();
    const functionName = contractFn.functionName().toString();

    if (VALIDATED_DEFI_ROUTERS.includes(contractId)) {
      const args = contractFn.args();

      if (functionName.includes("swap")) {
        // Router swap functions: swap_exact_tokens_for_tokens(amount_in, amount_out_min, path, to, deadline)
        // 'to' is commonly the 4th argument (index 3)
        if (args.length >= 4) {
          const toAddress = Address.fromScVal(args[3]).toString();
          if (toAddress !== walletAddress) {
            throw new Error(
              `DeFi Validation Failed: Swap 'to' address (${toAddress}) does not match wallet address (${walletAddress})`
            );
          }
        }
      } else if (functionName.includes("add_liquidity")) {
        // add_liquidity(token_a, token_b, amount_a_desired, amount_b_desired, amount_a_min, amount_b_min, to, deadline)
        // 'to' is index 6
        if (args.length >= 7) {
          const toAddress = Address.fromScVal(args[6]).toString();
          if (toAddress !== walletAddress) {
            throw new Error(
              `DeFi Validation Failed: Liquidity 'to' address (${toAddress}) does not match wallet address (${walletAddress})`
            );
          }
        }
      }
    }
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