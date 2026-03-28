import {
  Address,
  Asset,
  Transaction,
  xdr,
  StrKey,
  Networks,
  Contract,
  Operation,
  TransactionBuilder,
  BASE_FEE,
  nativeToScVal,
} from '@stellar/stellar-sdk';
import { Server, Api, assembleTransaction } from '@stellar/stellar-sdk/rpc';
import { convertSignatureDERtoCompact } from '../auth/src/providers/WebAuthNProvider';
import { BrowserCredentialBackend } from './credential-backends/browser.backend';
import type {
  CredentialBackend,
  DeployResult,
  DeployWithTrustlineOptions,
  SmartWalletWebAuthnProvider,
  USDCNetwork,
} from './types/smart-wallet.types';
import { USDC_ISSUERS } from './types/smart-wallet.types';

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
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlToUint8Array(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

function base64ToUint8Array(base64: string): Uint8Array {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

function getAssertionCredentialId(assertion: PublicKeyCredential): string {
  if (assertion.rawId && assertion.rawId.byteLength > 0) {
    return uint8ArrayToBase64(new Uint8Array(assertion.rawId));
  }
  if (assertion.id) {
    return assertion.id;
  }
  throw new Error('WebAuthn assertion is missing a credential ID.');
}

function deriveSessionCredentialId(sessionPublicKey: string): string {
  return uint8ArrayToBase64(StrKey.decodeEd25519PublicKey(sessionPublicKey));
}

function buildSourceAccount(accountId: string, sequence: bigint) {
  return {
    accountId: () => accountId,
    sequenceNumber: () => sequence.toString(),
    incrementSequenceNumber: () => {},
  } as unknown as ConstructorParameters<typeof TransactionBuilder>[0];
}

function buildAccountAddressScVal(accountId: string): xdr.ScVal {
  return nativeToScVal(accountId, { type: 'address' }) as xdr.ScVal;
}

function getStoredCredentialId(): string | null {
  try {
    const stored = localStorage.getItem('webauthn_credentials');
    if (!stored) return null;

    const credentialIds = JSON.parse(stored);
    return Array.isArray(credentialIds) && credentialIds[0]
      ? String(credentialIds[0])
      : null;
  } catch {
    return null;
  }
}

const SIMULATION_DEPLOYER_ADDRESS = StrKey.encodeEd25519PublicKey(
  Buffer.alloc(32, 7)
);

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
      key: xdr.ScVal.scvSymbol('authenticator_data'),
      val: xdr.ScVal.scvBytes(Buffer.from(authenticatorData)),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('client_data_json'),
      val: xdr.ScVal.scvBytes(Buffer.from(clientDataJSON)),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('id'),
      val: xdr.ScVal.scvBytes(Buffer.from(credentialIdBytes)),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('signature'),
      val: xdr.ScVal.scvBytes(Buffer.from(compactSig)),
    }),
  ]);

  // Wrap in AccountSignature::WebAuthn enum variant
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('WebAuthn'),
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
      key: xdr.ScVal.scvSymbol('id'),
      val: xdr.ScVal.scvBytes(Buffer.from(credentialIdBytes)),
    }),
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('signature'),
      val: xdr.ScVal.scvBytes(Buffer.from(ed25519Sig)),
    }),
  ]);

  // Wrap in AccountSignature::SessionKey enum variant
  return xdr.ScVal.scvMap([
    new xdr.ScMapEntry({
      key: xdr.ScVal.scvSymbol('SessionKey'),
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
        signatureExpirationLedger:
          currentCredentials.signatureExpirationLedger(),
        signature: signatureScVal,
      })
    )
  );
}

function isAuthenticatorAssertionResponse(
  response: AuthenticatorResponse
): response is AuthenticatorAssertionResponse {
  return (
    'authenticatorData' in response &&
    'clientDataJSON' in response &&
    'signature' in response
  );
}

function getAssertionResponse(
  credential: PublicKeyCredential
): AuthenticatorAssertionResponse {
  if (!isAuthenticatorAssertionResponse(credential.response)) {
    throw new Error(
      'SmartWalletService expected an AuthenticatorAssertionResponse from the credential backend.'
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
  deployResult: Awaited<ReturnType<Server['simulateTransaction']>>
): string | null {
  if (Api.isSimulationError(deployResult)) {
    return null;
  }
  const retval = deployResult.result?.retval;
  if (!retval || typeof retval !== 'object' || !('address' in retval)) {
    return null;
  }

  const addressFn = retval.address;
  if (typeof addressFn !== 'function') {
    return null;
  }

  const addressResult = addressFn.call(retval);
  if (
    !addressResult ||
    typeof addressResult !== 'object' ||
    !('contractId' in addressResult)
  ) {
    return null;
  }

  const contractIdFn = addressResult.contractId;
  if (typeof contractIdFn !== 'function') {
    return null;
  }

  const contractId = contractIdFn.call(addressResult);
  if (
    !contractId ||
    typeof contractId !== 'object' ||
    !('toString' in contractId)
  ) {
    return null;
  }

  const toStringFn = contractId.toString;
  if (typeof toStringFn !== 'function') {
    return null;
  }

  const value = toStringFn.call(contractId, 'hex');
  return typeof value === 'string' && value.length > 0 ? value : null;
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
// Constants
// ---------------------------------------------------------------------------

/** Validated DeFi Router contract IDs */
const VALIDATED_DEFI_ROUTERS = [
  'CCJUD55AG6W5HAI5LRVNKAE5WDP5XGZBUDS5WNTIVDU7O264UZZE7BRD', // Soroswap Testnet
  'CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH', // Soroswap Mainnet
];

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class SmartWalletService {
  private server: Server;
  private factoryContractId: string =
    'CAX5RLKVBMYLASX546TKXCZIQSROJGQ7DUIH3LUDG3PR4UB3RRW5O5PE';
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
          sessionPublicKey: params.sessionPublicKey ?? '',
          ttlSeconds: params.ttlSeconds ?? 0,
          credentialId: params.credentialId,
          webAuthnAssertion: params.webAuthnAssertion,
        });
      } catch (error) {
        if (error instanceof Error) {
          throw new Error(
            error.message.replace(/addSessionSigner/g, 'addSigner')
          );
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

    if (!walletAddress) throw new Error('addSigner: walletAddress is required');
    if (!signerCredentialId)
      throw new Error('addSigner: signerCredentialId is required');
    if (!signerPublicKey)
      throw new Error('addSigner: signerPublicKey is required');
    if (!webAuthnAssertion && !authCredentialId) {
      throw new Error(
        'addSigner: either webAuthnAssertion or authCredentialId must be provided'
      );
    }

    const signerPublicKeyBytes = base64ToUint8Array(signerPublicKey);
    if (
      signerPublicKeyBytes.byteLength !== 65 ||
      signerPublicKeyBytes[0] !== 0x04
    ) {
      throw new Error(
        'addSigner: signerPublicKey must be a base64-encoded 65-byte uncompressed SEC-1 key'
      );
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
          'add_signer',
          xdr.ScVal.scvBytes(
            Buffer.from(base64UrlToUint8Array(signerCredentialId))
          ),
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
      throw new Error('addSigner simulation returned no auth entries.');
    }

    const authEntry: xdr.SorobanAuthorizationEntry = simResult.result.auth[0];
    const authEntryBytes = authEntry.toXDR();
    const authEntryArrayBuffer = authEntryBytes.buffer.slice(
      authEntryBytes.byteOffset,
      authEntryBytes.byteOffset + authEntryBytes.byteLength
    ) as ArrayBuffer;
    const authEntryHash = new Uint8Array(
      await crypto.subtle.digest('SHA-256', authEntryArrayBuffer)
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
              type: 'public-key' as const,
              id: Buffer.from(base64UrlToUint8Array(authCredentialId!)),
            },
          ],
          userVerification: 'required',
          timeout: 60_000,
        },
      })) as PublicKeyCredential | null;
    }
    if (!assertion) {
      throw new Error(
        'addSigner: WebAuthn authentication was cancelled or timed out.'
      );
    }

    const resolvedAuthCredentialId = authCredentialId ?? assertion.id;
    if (!resolvedAuthCredentialId) {
      throw new Error('addSigner: unable to resolve auth credential id');
    }

    const assertionResponse =
      assertion.response as AuthenticatorAssertionResponse;
    const signerSignature = buildWebAuthnSignatureScVal(
      new Uint8Array(assertionResponse.authenticatorData),
      new Uint8Array(assertionResponse.clientDataJSON),
      base64UrlToUint8Array(resolvedAuthCredentialId),
      convertSignatureDERtoCompact(assertionResponse.signature)
    );

    attachSignatureToAuthEntry(authEntry, walletAddress, signerSignature);
    simResult.result.auth[0] = authEntry;
    const signedTx = assembleTransaction(invokeTx, simResult).build();
    return signedTx.toEnvelope().toXDR('base64');
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
      throw new Error('addSessionSigner: walletAddress is required');
    }
    if (!sessionPublicKey) {
      throw new Error('addSessionSigner: sessionPublicKey is required');
    }
    if (ttlSeconds <= 0) {
      throw new Error(
        `addSessionSigner: ttlSeconds must be positive, got ${ttlSeconds}`
      );
    }
    if (!webAuthnAssertion && !credentialId) {
      throw new Error(
        'addSessionSigner: either webAuthnAssertion or credentialId must be provided'
      );
    }

    const sessionPublicKeyBytes =
      StrKey.decodeEd25519PublicKey(sessionPublicKey);
    const sessionCredentialId = deriveSessionCredentialId(sessionPublicKey);
    const ttlLedgers = ttlSecondsToLedgers(ttlSeconds);
    const { sequence } = await this.server.getLatestLedger();
    const sourceAccount = buildSourceAccount(
      walletAddress,
      BigInt(sequence) + 1n
    );

    const contract = new Contract(walletAddress);
    const credentialBytes = Buffer.from(
      base64UrlToUint8Array(sessionCredentialId)
    );

    const invokeTx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.network,
    })
      .addOperation(
        contract.call(
          'add_session_signer',
          xdr.ScVal.scvBytes(credentialBytes),
          xdr.ScVal.scvBytes(Buffer.from(sessionPublicKeyBytes)),
          nativeToScVal(ttlLedgers, { type: 'u32' })
        )
      )
      .setTimeout(300)
      .build();

    const simResult = await this.server.simulateTransaction(invokeTx);
    if (Api.isSimulationError(simResult)) {
      throw new Error(`addSessionSigner simulation failed: ${simResult.error}`);
    }
    if (!simResult.result?.auth?.length) {
      throw new Error('addSessionSigner simulation returned no auth entries.');
    }

    const authEntry: xdr.SorobanAuthorizationEntry = simResult.result.auth[0];
    const authEntryBytes = authEntry.toXDR();
    const authEntryArrayBuffer = authEntryBytes.buffer.slice(
      authEntryBytes.byteOffset,
      authEntryBytes.byteOffset + authEntryBytes.byteLength
    ) as ArrayBuffer;
    const authEntryHash = new Uint8Array(
      await crypto.subtle.digest('SHA-256', authEntryArrayBuffer)
    );
    const challenge = toBase64Url(authEntryHash);

    let assertionResponse: AuthenticatorAssertionResponse;
    let resolvedCredentialId: string;

    if (webAuthnAssertion) {
      assertionResponse = getAssertionResponse(webAuthnAssertion);
      resolvedCredentialId =
        credentialId ?? getAssertionCredentialId(webAuthnAssertion);
    } else {
      const pkCredential = await this.credentialBackend.get({
        publicKey: {
          challenge: Buffer.from(base64UrlToUint8Array(challenge)),
          rpId: this.webAuthnProvider.relyingPartyId,
          allowCredentials: [
            {
              type: 'public-key' as const,
              id: Buffer.from(base64UrlToUint8Array(credentialId!)),
            },
          ],
          userVerification: 'required',
          timeout: 60_000,
        },
      });

      if (!pkCredential) {
        throw new Error(
          'addSessionSigner: WebAuthn authentication was cancelled or timed out.'
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
    return signedTx.toEnvelope().toXDR('base64');
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
    const {
      walletAddress,
      signerCredentialId,
      signerPublicKey,
      authCredentialId,
      credentialId,
      webAuthnAssertion,
    } = params;

    if (!walletAddress) {
      throw new Error('removeSigner: walletAddress is required');
    }

    const authCredential = authCredentialId ?? credentialId ?? undefined;
    if (!webAuthnAssertion && !authCredential) {
      throw new Error(
        'removeSigner: either webAuthnAssertion or authCredentialId/credentialId must be provided'
      );
    }

    let removalCredentialBytes: Buffer;
    if (signerCredentialId) {
      removalCredentialBytes = Buffer.from(
        base64UrlToUint8Array(signerCredentialId)
      );
    } else if (signerPublicKey) {
      removalCredentialBytes = Buffer.from(
        base64UrlToUint8Array(deriveSessionCredentialId(signerPublicKey))
      );
    } else if (credentialId) {
      removalCredentialBytes = Buffer.from(base64UrlToUint8Array(credentialId));
    } else {
      throw new Error(
        'removeSigner: signerCredentialId, credentialId, or signerPublicKey is required'
      );
    }

    const { sequence } = await this.server.getLatestLedger();
    const sourceAccount: ConstructorParameters<typeof TransactionBuilder>[0] = {
      accountId: () => walletAddress,
      sequenceNumber: () => String(BigInt(sequence) + 1n),
      incrementSequenceNumber: () => undefined,
    };

    const contract = new Contract(walletAddress);

    const invokeTx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.network,
    })
      .addOperation(
        contract.call(
          'remove_signer',
          xdr.ScVal.scvBytes(removalCredentialBytes)
        )
      )
      .setTimeout(300)
      .build();

    const simResult = await this.server.simulateTransaction(invokeTx);

    if (Api.isSimulationError(simResult)) {
      throw new Error(`removeSigner simulation failed: ${simResult.error}`);
    }

    if (!simResult.result?.auth?.length) {
      throw new Error('removeSigner simulation returned no auth entries.');
    }

    const authEntry: xdr.SorobanAuthorizationEntry = simResult.result.auth[0];

    let assertionResponse: AuthenticatorAssertionResponse;
    let signingCredentialIdBytes: Uint8Array;

    if (webAuthnAssertion) {
      assertionResponse = getAssertionResponse(webAuthnAssertion);
      signingCredentialIdBytes = base64UrlToUint8Array(
        authCredential ?? getAssertionCredentialId(webAuthnAssertion)
      );
    } else {
      const authEntryHash = new Uint8Array(
        await crypto.subtle.digest(
          'SHA-256',
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
              type: 'public-key' as const,
              id: Buffer.from(base64UrlToUint8Array(authCredential!)),
            },
          ],
          userVerification: 'required',
          timeout: 60_000,
        },
      });

      if (!pkCredential) {
        throw new Error(
          'removeSigner: WebAuthn authentication was cancelled or timed out.'
        );
      }

      assertionResponse = getAssertionResponse(pkCredential);
      signingCredentialIdBytes = base64UrlToUint8Array(pkCredential.id);
    }

    const authenticatorData = new Uint8Array(
      assertionResponse.authenticatorData
    );
    const clientDataJSON = new Uint8Array(assertionResponse.clientDataJSON);
    const compactSig = convertSignatureDERtoCompact(
      assertionResponse.signature
    );
    const signerSignature = buildWebAuthnSignatureScVal(
      authenticatorData,
      clientDataJSON,
      signingCredentialIdBytes,
      compactSig
    );

    attachSignatureToAuthEntry(authEntry, walletAddress, signerSignature);
    simResult.result.auth[0] = authEntry;

    const signedTx = assembleTransaction(invokeTx, simResult).build();
    return signedTx.toEnvelope().toXDR('base64');
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
      throw new Error('Simulation returned no auth entries.');
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
        await crypto.subtle.digest('SHA-256', authEntryArrayBuffer)
      );

      const challenge = toBase64Url(authEntryHash);

      const pkCredential = await this.credentialBackend.get({
        publicKey: {
          challenge: Buffer.from(base64UrlToUint8Array(challenge)),
          rpId: this.webAuthnProvider.relyingPartyId,
          allowCredentials: [
            {
              type: 'public-key' as const,
              id: Buffer.from(base64UrlToUint8Array(credentialId)),
            },
          ],
          userVerification: 'required',
          timeout: 60000,
        },
      });

      if (!pkCredential) {
        throw new Error('WebAuthn authentication was cancelled or timed out.');
      }

      const assertionResponse = getAssertionResponse(pkCredential);

      const authenticatorData = new Uint8Array(
        assertionResponse.authenticatorData
      );
      const clientDataJSON = new Uint8Array(assertionResponse.clientDataJSON);
      const compactSig = convertSignatureDERtoCompact(
        assertionResponse.signature
      );

      const signerSignature = buildWebAuthnSignatureScVal(
        authenticatorData,
        clientDataJSON,
        base64UrlToUint8Array(credentialId),
        compactSig
      );

      attachSignatureToAuthEntry(authEntry, contractAddress, signerSignature);
      simResult.result.auth[i] = authEntry;
    }

    const signedTx = assembleTransaction(sorobanTx, simResult).build();
    return signedTx.toEnvelope().toXDR('base64');
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

      if (functionName.includes('swap')) {
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
      } else if (functionName.includes('add_liquidity')) {
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
      throw new Error('signWithSessionKey: contractAddress is required');
    }
    if (!credentialId) {
      throw new Error('signWithSessionKey: credentialId is required');
    }

    // 1. Simulate to get the auth entry
    const simResult = await this.server.simulateTransaction(sorobanTx);

    if (Api.isSimulationError(simResult)) {
      throw new Error(
        `signWithSessionKey simulation failed: ${simResult.error}`
      );
    }

    if (!simResult.result?.auth?.length) {
      throw new Error(
        'signWithSessionKey simulation returned no auth entries.'
      );
    }

    const authEntry: xdr.SorobanAuthorizationEntry = simResult.result.auth[0];

    // 2. Compute the 32-byte auth-entry hash (= signature_payload in __check_auth)
    const authEntryHash = Buffer.from(
      await crypto.subtle.digest('SHA-256', getAuthEntryArrayBuffer(authEntry))
    );

    // 3. Invoke the caller's sign callback with the hash
    const ed25519Sig = signFn(authEntryHash);

    if (!ed25519Sig || ed25519Sig.byteLength !== 64) {
      throw new Error(
        'signWithSessionKey: signFn must return a 64-byte Ed25519 signature'
      );
    }

    // 4. Build AccountSignature::SessionKey ScVal
    const credentialIdBytes = base64UrlToUint8Array(credentialId);
    const signerSignature = buildSessionKeySignatureScVal(
      credentialIdBytes,
      ed25519Sig
    );

    // 5. Attach to auth entry and assemble XDR
    attachSignatureToAuthEntry(authEntry, contractAddress, signerSignature);
    simResult.result.auth[0] = authEntry;

    const signedTx = assembleTransaction(sorobanTx, simResult).build();
    return signedTx.toEnvelope().toXDR('base64');
  }

  // -------------------------------------------------------------------------
  // deploy()
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // deploy() — overloads
  // -------------------------------------------------------------------------

  /**
   * Builds the factory deploy invocation internally, simulates it, and returns
   * the deployed contract address.
   */
  async deploy(
    publicKey65Bytes: Uint8Array,
    factory?: string,
    network?: Networks | string
  ): Promise<string>;

  /**
   * Deploys the smart wallet and additionally prepares a USDC trustline
   * transaction for the given account, returning both the contract address
   * and the unsigned fee-less trustline XDR for fee sponsorship.
   */
  async deploy(
    publicKey65Bytes: Uint8Array,
    factory: string | undefined,
    network: Networks | string | undefined,
    options: DeployWithTrustlineOptions
  ): Promise<DeployResult>;

  async deploy(
    publicKey65Bytes: Uint8Array,
    factory: string = this.factoryContractId,
    network: Networks | string = this.network,
    options?: DeployWithTrustlineOptions
  ): Promise<string | DeployResult> {
    if (!factory) {
      throw new Error('deploy: factory contract address is required');
    }
    if (publicKey65Bytes.byteLength !== 65) {
      throw new Error(
        `deploy: publicKey65Bytes must be 65 bytes, got ${publicKey65Bytes.byteLength}`
      );
    }
    if (publicKey65Bytes[0] !== 0x04) {
      throw new Error(
        'deploy: publicKey65Bytes must be an uncompressed P-256 key'
      );
    }

    const credentialId = getStoredCredentialId();
    if (!credentialId) {
      throw new Error(
        'deploy: no stored WebAuthn credential ID found for factory deployment'
      );
    }

    const { sequence } = await this.server.getLatestLedger();
    const sourceAccount = buildSourceAccount(
      SIMULATION_DEPLOYER_ADDRESS,
      BigInt(sequence) + 1n
    );
    const contract = new Contract(factory);
    const factoryTx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: network,
    })
      .addOperation(
        contract.call(
          'deploy',
          buildAccountAddressScVal(SIMULATION_DEPLOYER_ADDRESS),
          xdr.ScVal.scvBytes(Buffer.from(base64UrlToUint8Array(credentialId))),
          xdr.ScVal.scvBytes(Buffer.from(publicKey65Bytes))
        )
      )
      .setTimeout(300)
      .build();

    const deployResult = await this.server.simulateTransaction(factoryTx);

    if (Api.isSimulationError(deployResult)) {
      throw new Error(`Deploy simulation failed: ${deployResult.error}`);
    }

    const contractAddress = getContractAddressFromSimulation(deployResult);

    if (!contractAddress) {
      throw new Error('Factory did not return a contract address.');
    }

    if (options?.autoTrustlineUSDC) {
      const trustlineXdr = await this.setupUSDCTrustline(
        options.accountId,
        options.usdcNetwork
      );
      return { contractAddress, trustlineXdr };
    }

    return contractAddress;
  }

  // -------------------------------------------------------------------------
  // setupUSDCTrustline()
  // -------------------------------------------------------------------------

  /**
   * Builds an unsigned fee-less ChangeTrust transaction that adds a USDC
   * trustline to the given classic Stellar account.
   *
   * The returned XDR (base64) is intended for the fee sponsorship workflow:
   * the account holder must sign the transaction before it can be submitted.
   *
   * ## Flow
   *  1. Resolve the USDC issuer for the requested network.
   *  2. Fetch the account's current sequence number from the RPC node.
   *  3. Build a classic Stellar transaction with a single `ChangeTrust`
   *     operation for the USDC asset at maximum limit.
   *  4. Return the unsigned XDR for the caller to sign and submit.
   *
   * @param accountId  Classic Stellar G-address that will hold USDC.
   * @param network    `'testnet'` or `'mainnet'` — selects the USDC issuer.
   * @returns          Unsigned fee-less transaction XDR (base64).
   */
  async setupUSDCTrustline(
    accountId: string,
    network: USDCNetwork
  ): Promise<string> {
    if (!accountId) {
      throw new Error('setupUSDCTrustline: accountId is required');
    }
    if (!network || !(network in USDC_ISSUERS)) {
      throw new Error(
        "setupUSDCTrustline: network must be 'testnet' or 'mainnet'"
      );
    }

    const issuer = USDC_ISSUERS[network];
    const usdcAsset = new Asset('USDC', issuer);

    const account = await this.server.getAccount(accountId);

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.network,
    })
      .addOperation(Operation.changeTrust({ asset: usdcAsset }))
      .setTimeout(300)
      .build();

    return tx.toEnvelope().toXDR('base64');
  }
}
