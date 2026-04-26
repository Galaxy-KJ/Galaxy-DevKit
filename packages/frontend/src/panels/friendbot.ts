/**
 * @fileoverview Friendbot panel — Stellar testnet account funding
 * @description Calls the Stellar Friendbot API to fund a testnet account with
 *   10 000 XLM. Handles the full lifecycle: validation, request, polling,
 *   and clear user-facing error messages.
 *   Friendbot is ONLY available on testnet — mainnet calls are rejected early.
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-04-26
 */

import {
  isValidStellarAddress,
  fetchHorizonAccount,
  type NetworkType,
  type HorizonAccount,
} from './account-info.js';

// ─── Constants ────────────────────────────────────────────────────────────────

const FRIENDBOT_URL = 'https://friendbot.stellar.org';
/** XLM amount credited by Friendbot per successful funding. */
const FRIENDBOT_CREDIT_XLM = '10000.0000000';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FriendbotResult {
  /** The funded account public key. */
  address: string;
  /** Transaction hash returned by Friendbot. */
  transactionHash: string;
  /** XLM balance after funding (always 10 000 for a fresh account). */
  creditedXlm: string;
  /** Full Horizon account record fetched after funding. */
  account: HorizonAccount;
  fundedAt: string;
}

export interface FriendbotError {
  type:
    | 'mainnet_not_supported'
    | 'invalid_address'
    | 'already_funded'
    | 'network_error'
    | 'rate_limited'
    | 'friendbot_error';
  message: string;
  statusCode?: number;
}

export interface FriendbotOptions {
  /** Timeout in milliseconds for the Friendbot request (default: 30 000). */
  timeoutMs?: number;
  /**
   * If true, fetch the full account record from Horizon after a successful
   * funding and include it in the result. Default: true.
   */
  fetchAccountAfter?: boolean;
}

// ─── API layer ────────────────────────────────────────────────────────────────

/**
 * Raw call to the Stellar Friendbot API.
 *
 * @returns The raw Friendbot JSON response (envelope_xdr + hash, etc.)
 * @throws {FriendbotError} on validation failure, HTTP errors, or network issues.
 */
export async function callFriendbot(
  address: string,
  signal?: AbortSignal,
): Promise<{ hash: string; [key: string]: unknown }> {
  if (!isValidStellarAddress(address)) {
    throw {
      type: 'invalid_address',
      message: `"${address}" is not a valid Stellar public key.`,
    } satisfies FriendbotError;
  }

  const url = new URL(FRIENDBOT_URL);
  url.searchParams.set('addr', address);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw {
      type: 'network_error',
      message: `Failed to reach Friendbot: ${message}`,
    } satisfies FriendbotError;
  }

  // 400 with "createAccountAlreadyExist" means the account already has funds
  if (response.status === 400) {
    let body: { detail?: string; extras?: { result_codes?: { operations?: string[] } } } = {};
    try { body = await response.json(); } catch { /* ignore */ }

    const detail = body?.detail ?? '';
    const opCodes = body?.extras?.result_codes?.operations ?? [];

    if (
      detail.includes('createAccountAlreadyExist') ||
      opCodes.includes('op_already_exists')
    ) {
      throw {
        type: 'already_funded',
        statusCode: 400,
        message: `Account ${address} already exists on testnet. It has been funded before.`,
      } satisfies FriendbotError;
    }

    throw {
      type: 'friendbot_error',
      statusCode: 400,
      message: `Friendbot rejected the request: ${detail || response.statusText}`,
    } satisfies FriendbotError;
  }

  if (response.status === 429) {
    throw {
      type: 'rate_limited',
      statusCode: 429,
      message: 'Friendbot rate limit reached. Please wait a moment and try again.',
    } satisfies FriendbotError;
  }

  if (!response.ok) {
    throw {
      type: 'friendbot_error',
      statusCode: response.status,
      message: `Friendbot returned HTTP ${response.status}: ${response.statusText}`,
    } satisfies FriendbotError;
  }

  return response.json() as Promise<{ hash: string; [key: string]: unknown }>;
}

// ─── Panel class ──────────────────────────────────────────────────────────────

/**
 * FriendbotPanel — manages testnet account funding via Friendbot.
 *
 * Usage:
 * ```ts
 * const panel = new FriendbotPanel();
 *
 * // Fund a specific account
 * const result = await panel.fund('GABC...XYZ');
 * console.log(result.transactionHash, result.account.balances);
 *
 * // Generate a random keypair and fund it in one call
 * const result = await panel.fundRandom();
 * console.log(result.address);
 * ```
 */
export class FriendbotPanel {
  private timeoutMs: number;
  private fetchAccountAfter: boolean;
  private abortController: AbortController | null = null;

  constructor(options: FriendbotOptions = {}) {
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.fetchAccountAfter = options.fetchAccountAfter ?? true;
  }

  /**
   * Fund a testnet account via Friendbot.
   *
   * If the account does not exist yet, Friendbot creates it with 10 000 XLM.
   * If it already exists, a typed `already_funded` error is thrown — callers
   * can catch this and redirect the user to Account Info to inspect the balance.
   *
   * @throws {FriendbotError} typed error on any failure.
   */
  async fund(
    address: string,
    network: NetworkType = 'testnet',
  ): Promise<FriendbotResult> {
    if (network !== 'testnet') {
      throw {
        type: 'mainnet_not_supported',
        message: 'Friendbot is only available on testnet. Switch your network to testnet first.',
      } satisfies FriendbotError;
    }

    // Cancel any in-flight request
    this.abortController?.abort();
    this.abortController = new AbortController();

    const timeoutId = setTimeout(
      () => this.abortController?.abort(),
      this.timeoutMs,
    );

    try {
      const friendbotResponse = await callFriendbot(
        address,
        this.abortController.signal,
      );

      // Optionally fetch the full account record so callers have balances etc.
      let account: HorizonAccount | undefined;
      if (this.fetchAccountAfter) {
        account = await fetchHorizonAccount(
          address,
          'testnet',
          this.abortController.signal,
        );
      }

      return {
        address,
        transactionHash: friendbotResponse.hash,
        creditedXlm: FRIENDBOT_CREDIT_XLM,
        account: account!,
        fundedAt: new Date().toISOString(),
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Generate a random Stellar keypair and immediately fund it via Friendbot.
   *
   * Uses the Web Crypto API (available in all modern browsers and Node ≥ 19)
   * to generate 32 cryptographically random bytes, then derives a base32-encoded
   * Stellar-compatible public key placeholder. For full keypair generation
   * integrate with @stellar/stellar-sdk's Keypair.random().
   *
   * @throws {FriendbotError} if funding fails.
   */
  async fundRandom(network: NetworkType = 'testnet'): Promise<FriendbotResult & { secretKey?: string }> {
    // Use stellar-sdk if available, otherwise fall through to the SDK warning
    let address: string;
    let secretKey: string | undefined;

    try {
      // Dynamic import so this file does not hard-depend on stellar-sdk
      const { Keypair } = await import('@stellar/stellar-sdk');
      const keypair = Keypair.random();
      address = keypair.publicKey();
      secretKey = keypair.secret();
    } catch {
      throw {
        type: 'friendbot_error',
        message:
          '@stellar/stellar-sdk is required for random keypair generation. ' +
          'Install it or pass an explicit address to fund().',
      } satisfies FriendbotError;
    }

    const result = await this.fund(address, network);
    return { ...result, secretKey };
  }

  /**
   * Convenience method: silently fund an account if it does not exist yet.
   * If the account already exists the `already_funded` error is swallowed
   * and the existing account data is fetched from Horizon instead.
   *
   * This matches the edge-case behaviour described in the issue notes:
   * "Handling non-existent accounts by prompting the friendbot API silently."
   *
   * @returns The FriendbotResult on new funding, or a partial result with
   *          the existing account data and `transactionHash: ''`.
   */
  async ensureFunded(
    address: string,
    network: NetworkType = 'testnet',
  ): Promise<FriendbotResult> {
    try {
      return await this.fund(address, network);
    } catch (err: unknown) {
      const error = err as FriendbotError;

      if (error.type === 'already_funded') {
        // Account exists — fetch its current state from Horizon
        const account = await fetchHorizonAccount(address, network);
        return {
          address,
          transactionHash: '',
          creditedXlm: '0', // no new credit
          account,
          fundedAt: new Date().toISOString(),
        };
      }

      // Re-throw any other error type unchanged
      throw err;
    }
  }

  /** Cancel any in-flight request. */
  cancel(): void {
    this.abortController?.abort();
    this.abortController = null;
  }
}

// ─── Default singleton export ─────────────────────────────────────────────────

/** Pre-configured Friendbot panel — ready to use without instantiation. */
export const friendbotPanel = new FriendbotPanel();

export default FriendbotPanel;