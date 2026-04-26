/**
 * @fileoverview Account Info panel — Horizon account lookup
 * @description Fetches account data (balances, signers, data entries, thresholds)
 *   from the Stellar Horizon REST API and renders it in the playground panel.
 *   Works on both testnet and mainnet depending on the active network selection.
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-04-26
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const HORIZON_TESTNET = 'https://horizon-testnet.stellar.org';
const HORIZON_MAINNET = 'https://horizon.stellar.org';

// ─── Types ────────────────────────────────────────────────────────────────────

export type NetworkType = 'testnet' | 'mainnet';

export interface HorizonBalance {
  balance: string;
  limit?: string;
  buying_liabilities: string;
  selling_liabilities: string;
  last_modified_ledger?: number;
  is_authorized?: boolean;
  is_authorized_to_maintain_liabilities?: boolean;
  asset_type: 'native' | 'credit_alphanum4' | 'credit_alphanum12' | 'liquidity_pool_shares';
  asset_code?: string;
  asset_issuer?: string;
  liquidity_pool_id?: string;
}

export interface HorizonSigner {
  weight: number;
  key: string;
  type: string;
}

export interface HorizonThresholds {
  low_threshold: number;
  med_threshold: number;
  high_threshold: number;
}

export interface HorizonFlags {
  auth_required: boolean;
  auth_revocable: boolean;
  auth_immutable: boolean;
  auth_clawback_enabled: boolean;
}

export interface HorizonAccount {
  id: string;
  account_id: string;
  sequence: string;
  subentry_count: number;
  last_modified_ledger: number;
  last_modified_time: string;
  thresholds: HorizonThresholds;
  flags: HorizonFlags;
  balances: HorizonBalance[];
  signers: HorizonSigner[];
  data: Record<string, string>; // base64-encoded values
  num_sponsoring: number;
  num_sponsored: number;
  paging_token: string;
}

export interface AccountInfoResult {
  account: HorizonAccount;
  network: NetworkType;
  fetchedAt: string;
}

export interface AccountInfoError {
  type: 'not_found' | 'invalid_address' | 'network_error' | 'rate_limited';
  message: string;
  statusCode?: number;
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Basic Stellar public key validation.
 * A valid Stellar public key starts with 'G' and is exactly 56 characters.
 */
export function isValidStellarAddress(address: string): boolean {
  return typeof address === 'string' &&
    address.startsWith('G') &&
    address.length === 56 &&
    /^[A-Z2-7]+$/.test(address); // Base32 alphabet
}

// ─── API layer ────────────────────────────────────────────────────────────────

/**
 * Resolve the correct Horizon base URL for the given network.
 */
export function getHorizonUrl(network: NetworkType): string {
  return network === 'mainnet' ? HORIZON_MAINNET : HORIZON_TESTNET;
}

/**
 * Fetch raw account data from Horizon.
 *
 * @throws {AccountInfoError} on validation failure, HTTP errors, or network issues.
 */
export async function fetchHorizonAccount(
  address: string,
  network: NetworkType = 'testnet',
  signal?: AbortSignal,
): Promise<HorizonAccount> {
  if (!isValidStellarAddress(address)) {
    throw {
      type: 'invalid_address',
      message: `"${address}" is not a valid Stellar public key. It must start with G and be 56 characters long.`,
    } satisfies AccountInfoError;
  }

  const url = `${getHorizonUrl(network)}/accounts/${encodeURIComponent(address)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw {
      type: 'network_error',
      message: `Failed to reach Horizon (${network}): ${message}`,
    } satisfies AccountInfoError;
  }

  if (response.status === 404) {
    throw {
      type: 'not_found',
      statusCode: 404,
      message: `Account ${address} does not exist on ${network}. You can fund it via Friendbot (testnet only).`,
    } satisfies AccountInfoError;
  }

  if (response.status === 429) {
    throw {
      type: 'rate_limited',
      statusCode: 429,
      message: 'Horizon rate limit reached. Please wait a moment and try again.',
    } satisfies AccountInfoError;
  }

  if (!response.ok) {
    throw {
      type: 'network_error',
      statusCode: response.status,
      message: `Horizon returned HTTP ${response.status}: ${response.statusText}`,
    } satisfies AccountInfoError;
  }

  return response.json() as Promise<HorizonAccount>;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

/**
 * Decode a base64 Horizon data entry value to a UTF-8 string.
 * Falls back to the raw base64 if the decoded value contains non-printable chars.
 */
export function decodeDataEntry(base64Value: string): string {
  try {
    const decoded = atob(base64Value);
    // Only return as string if it looks like printable text
    if (/^[\x20-\x7E]*$/.test(decoded)) return decoded;
    return `<binary: ${base64Value}>`;
  } catch {
    return base64Value;
  }
}

/**
 * Format a raw Horizon balance entry into a human-readable label.
 * e.g. "100.0000000 XLM" or "50.0000000 USDC (GA...)"
 */
export function formatBalance(balance: HorizonBalance): string {
  if (balance.asset_type === 'native') {
    return `${balance.balance} XLM`;
  }
  if (balance.asset_type === 'liquidity_pool_shares') {
    return `${balance.balance} LP shares (pool: ${balance.liquidity_pool_id ?? 'unknown'})`;
  }
  const issuerShort = balance.asset_issuer
    ? `${balance.asset_issuer.slice(0, 6)}…${balance.asset_issuer.slice(-4)}`
    : 'unknown issuer';
  return `${balance.balance} ${balance.asset_code} (${issuerShort})`;
}

/**
 * Summarise an account into a flat record for easy display / testing.
 */
export function summariseAccount(account: HorizonAccount): {
  address: string;
  sequence: string;
  xlmBalance: string;
  otherBalances: string[];
  signerCount: number;
  dataEntryCount: number;
  subentryCount: number;
  lastModifiedLedger: number;
  decodedData: Record<string, string>;
} {
  const xlmEntry = account.balances.find((b) => b.asset_type === 'native');
  const otherEntries = account.balances.filter((b) => b.asset_type !== 'native');

  const decodedData: Record<string, string> = {};
  for (const [key, value] of Object.entries(account.data)) {
    decodedData[key] = decodeDataEntry(value);
  }

  return {
    address: account.account_id,
    sequence: account.sequence,
    xlmBalance: xlmEntry ? `${xlmEntry.balance} XLM` : '0 XLM',
    otherBalances: otherEntries.map(formatBalance),
    signerCount: account.signers.length,
    dataEntryCount: Object.keys(account.data).length,
    subentryCount: account.subentry_count,
    lastModifiedLedger: account.last_modified_ledger,
    decodedData,
  };
}

// ─── Panel class ──────────────────────────────────────────────────────────────

export interface AccountInfoPanelOptions {
  /** Default network to query. Can be changed at runtime via setNetwork(). */
  network?: NetworkType;
  /** Timeout in milliseconds for each Horizon request (default: 10 000). */
  timeoutMs?: number;
}

/**
 * AccountInfoPanel — stateful panel that manages Horizon account lookups.
 *
 * Usage:
 * ```ts
 * const panel = new AccountInfoPanel({ network: 'testnet' });
 * const result = await panel.lookup('GABC...XYZ');
 * console.log(result.account.balances);
 * ```
 */
export class AccountInfoPanel {
  private network: NetworkType;
  private timeoutMs: number;
  private abortController: AbortController | null = null;

  constructor(options: AccountInfoPanelOptions = {}) {
    this.network = options.network ?? 'testnet';
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  /** Switch the active network. */
  setNetwork(network: NetworkType): void {
    this.network = network;
  }

  getNetwork(): NetworkType {
    return this.network;
  }

  /**
   * Look up a Stellar account on the active network.
   *
   * Cancels any in-flight request before starting a new one.
   * On success, returns a typed AccountInfoResult.
   * On failure, throws a typed AccountInfoError.
   */
  async lookup(address: string): Promise<AccountInfoResult> {
    // Cancel any previous in-flight request
    this.abortController?.abort();
    this.abortController = new AbortController();

    const timeoutId = setTimeout(
      () => this.abortController?.abort(),
      this.timeoutMs,
    );

    try {
      const account = await fetchHorizonAccount(
        address,
        this.network,
        this.abortController.signal,
      );

      return {
        account,
        network: this.network,
        fetchedAt: new Date().toISOString(),
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /** Cancel any in-flight request. */
  cancel(): void {
    this.abortController?.abort();
    this.abortController = null;
  }
}

// ─── Default singleton export ─────────────────────────────────────────────────

/** Pre-configured testnet panel — ready to use without instantiation. */
export const accountInfoPanel = new AccountInfoPanel({ network: 'testnet' });

export default AccountInfoPanel;