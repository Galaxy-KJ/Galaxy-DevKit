/**
 * @fileoverview Oracle Pusher Service
 * @description Off-chain bot that fetches asset prices from external providers
 *   (CoinGecko by default) and submits them to the on-chain Soroban Price
 *   Oracle contract. Implements retry logic, exponential back-off, and a
 *   configurable push interval.
 *
 * Architecture:
 *   External API  →  fetchPrice()  →  scalePrice()  →  pushToContract()
 *                                                    ↑ retry with back-off
 *
 * @author Galaxy DevKit Team
 * @version 1.0.0
 */

import {
  Contract,
  Keypair,
  nativeToScVal,
  Networks,
  rpc as SorobanRpc,
  scValToNative,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';

import type {
  AssetPair,
  FetchedPrice,
  OraclePusherConfig,
  PriceProvider,
  PushCycleSummary,
  PushResult,
} from '../types/oracle-pusher.types.js';

/** Price scale factor: 7 implied decimal places (matches on-chain contract). */
const PRICE_SCALE = 1_000_000n;

/** Default push interval: 60 seconds. */
const DEFAULT_INTERVAL_MS = 60_000;

/** Default maximum retry attempts per push. */
const DEFAULT_MAX_RETRIES = 3;

/** Default base delay between retries (ms). */
const DEFAULT_RETRY_DELAY_MS = 1_000;

/** CoinGecko simple-price API endpoint. */
const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3/simple/price';

// ---------------------------------------------------------------------------
// OraclePusherService
// ---------------------------------------------------------------------------

/**
 * Off-chain service that periodically pushes market prices to the
 * on-chain Soroban Price Oracle contract.
 *
 * @example
 * ```ts
 * const pusher = new OraclePusherService({
 *   sorobanRpcUrl:      'https://soroban-testnet.stellar.org',
 *   networkPassphrase:  Networks.TESTNET,
 *   oracleContractId:   'CA…',
 *   pusherSecretKey:    'S…',
 *   pairs: [
 *     {
 *       base: 'XLM', quote: 'USDC',
 *       providerBaseId: 'stellar', providerQuoteId: 'usd-coin',
 *     },
 *   ],
 *   provider:   'coingecko',
 *   intervalMs: 60_000,
 * });
 *
 * await pusher.start();   // begins periodic push loop
 * // later…
 * pusher.stop();
 * ```
 */
export class OraclePusherService {
  private readonly config: Required<OraclePusherConfig>;
  private readonly keypair: Keypair;
  private readonly rpc: SorobanRpc.Server;
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(config: OraclePusherConfig) {
    this.config = {
      intervalMs: DEFAULT_INTERVAL_MS,
      maxRetries: DEFAULT_MAX_RETRIES,
      retryDelayMs: DEFAULT_RETRY_DELAY_MS,
      ...config,
    };

    this.keypair = Keypair.fromSecret(this.config.pusherSecretKey);
    this.rpc = new SorobanRpc.Server(this.config.sorobanRpcUrl, {
      allowHttp: this.config.sorobanRpcUrl.startsWith('http://'),
    });
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /**
   * Execute one push cycle immediately and then start a periodic interval.
   * Calling `start()` while already running is a no-op.
   */
  async start(): Promise<void> {
    if (this.running) {
      console.warn('[OraclePusher] Already running — ignoring start() call.');
      return;
    }

    this.running = true;
    console.log(
      `[OraclePusher] Starting. Interval: ${this.config.intervalMs}ms, ` +
        `pairs: ${this.config.pairs.map((p) => `${p.base}/${p.quote}`).join(', ')}`
    );

    // Run once immediately, then on the configured interval
    await this.runCycle();
    this.intervalHandle = setInterval(() => {
      this.runCycle().catch((err) =>
        console.error('[OraclePusher] Unhandled error in push cycle:', err)
      );
    }, this.config.intervalMs);
  }

  /**
   * Stop the periodic push loop.
   */
  stop(): void {
    if (this.intervalHandle !== null) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    this.running = false;
    console.log('[OraclePusher] Stopped.');
  }

  /** Whether the pusher is currently active. */
  get isRunning(): boolean {
    return this.running;
  }

  // -------------------------------------------------------------------------
  // Push cycle
  // -------------------------------------------------------------------------

  /**
   * Execute a full push cycle: fetch prices for all pairs and submit them.
   */
  async runCycle(): Promise<PushCycleSummary> {
    const cycleAt = new Date();
    console.log(`[OraclePusher] Push cycle started at ${cycleAt.toISOString()}`);

    const results: PushResult[] = await Promise.all(
      this.config.pairs.map((pair) => this.pushPair(pair))
    );

    const summary: PushCycleSummary = {
      results,
      successCount: results.filter((r) => r.success).length,
      failureCount: results.filter((r) => !r.success).length,
      cycleAt,
    };

    console.log(
      `[OraclePusher] Cycle complete — ` +
        `✓ ${summary.successCount} succeeded, ✗ ${summary.failureCount} failed.`
    );

    return summary;
  }

  // -------------------------------------------------------------------------
  // Per-pair helpers
  // -------------------------------------------------------------------------

  /**
   * Fetch → scale → push for a single asset pair, with retry logic.
   */
  async pushPair(pair: AssetPair): Promise<PushResult> {
    const pairKey = `${pair.base}_${pair.quote}`;
    let attempts = 0;
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      attempts = attempt;
      try {
        const fetched = await this.fetchPrice(pair);
        const scaledPrice = this.scalePrice(fetched.price);
        const txHash = await this.pushToContract(pair, scaledPrice);

        console.log(
          `[OraclePusher] ✓ ${pairKey} | ` +
            `price=${fetched.price} scaled=${scaledPrice} | tx=${txHash}`
        );

        return {
          pairKey,
          scaledPrice,
          success: true,
          txHash,
          attempts,
          pushedAt: new Date(),
        };
      } catch (err: unknown) {
        lastError = err instanceof Error ? err.message : String(err);
        console.warn(
          `[OraclePusher] ✗ ${pairKey} attempt ${attempt}/${this.config.maxRetries}: ${lastError}`
        );

        if (attempt < this.config.maxRetries) {
          // Exponential back-off: delay = base * 2^(attempt-1)
          const delay = this.config.retryDelayMs * Math.pow(2, attempt - 1);
          await this.sleep(delay);
        }
      }
    }

    return {
      pairKey,
      scaledPrice: 0n,
      success: false,
      error: lastError,
      attempts,
      pushedAt: new Date(),
    };
  }

  // -------------------------------------------------------------------------
  // Price fetching
  // -------------------------------------------------------------------------

  /**
   * Fetch the current price for a pair from the configured provider.
   */
  async fetchPrice(pair: AssetPair): Promise<FetchedPrice> {
    switch (this.config.provider) {
      case 'coingecko':
        return this.fetchFromCoinGecko(pair);
      default:
        throw new Error(`Unsupported price provider: ${this.config.provider as string}`);
    }
  }

  /**
   * Fetch price from the CoinGecko simple-price API.
   *
   * GET /simple/price?ids=<base>&vs_currencies=<quote>
   */
  async fetchFromCoinGecko(pair: AssetPair): Promise<FetchedPrice> {
    const url = new URL(COINGECKO_API_URL);
    url.searchParams.set('ids', pair.providerBaseId);
    url.searchParams.set('vs_currencies', pair.providerQuoteId);

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(
        `CoinGecko request failed: ${response.status} ${response.statusText}`
      );
    }

    const json = (await response.json()) as Record<string, Record<string, number>>;
    const price = json[pair.providerBaseId]?.[pair.providerQuoteId];

    if (price === undefined || price === null) {
      throw new Error(
        `CoinGecko returned no price for ${pair.providerBaseId}/${pair.providerQuoteId}`
      );
    }

    return {
      pairKey: `${pair.base}_${pair.quote}`,
      price,
      fetchedAt: new Date(),
      provider: 'coingecko' as PriceProvider,
    };
  }

  // -------------------------------------------------------------------------
  // Price scaling
  // -------------------------------------------------------------------------

  /**
   * Convert a floating-point price to the 7-decimal integer representation
   * used on-chain.
   *
   * @example scalePrice(1.2345678) → 1_234_568n
   */
  scalePrice(price: number): bigint {
    // Multiply by scale, round to nearest integer
    return BigInt(Math.round(price * Number(PRICE_SCALE)));
  }

  // -------------------------------------------------------------------------
  // On-chain submission
  // -------------------------------------------------------------------------

  /**
   * Build, simulate, sign, and submit the `push_price` contract invocation.
   * Returns the transaction hash on success.
   */
  async pushToContract(pair: AssetPair, scaledPrice: bigint): Promise<string> {
    const account = await this.rpc.getAccount(this.keypair.publicKey());

    const contract = new Contract(this.config.oracleContractId);

    // Encode arguments as Soroban XDR ScVals
    const args = [
      nativeToScVal(this.keypair.publicKey(), { type: 'address' }), // pusher
      xdr.ScVal.scvSymbol(pair.base),                               // base
      xdr.ScVal.scvSymbol(pair.quote),                              // quote
      nativeToScVal(scaledPrice, { type: 'i128' }),                 // price
    ];

    const tx = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: this.config.networkPassphrase,
    })
      .addOperation(contract.call('push_price', ...args))
      .setTimeout(30)
      .build();

    // Simulate to get resource footprint & updated sequence
    const simResult = await this.rpc.simulateTransaction(tx);
    if (SorobanRpc.Api.isSimulationError(simResult)) {
      throw new Error(`Simulation failed: ${simResult.error}`);
    }

    // Assemble the final transaction with resource fees
    const preparedTx = SorobanRpc.assembleTransaction(tx, simResult).build();
    preparedTx.sign(this.keypair);

    const sendResult = await this.rpc.sendTransaction(preparedTx);

    if (sendResult.status === 'ERROR') {
      throw new Error(`sendTransaction failed: ${JSON.stringify(sendResult.errorResult)}`);
    }

    // Poll until the transaction is confirmed or times out
    const hash = sendResult.hash;
    let getResult = await this.rpc.getTransaction(hash);
    const deadline = Date.now() + 15_000; // 15-second timeout

    while (
      getResult.status === SorobanRpc.Api.GetTransactionStatus.NOT_FOUND &&
      Date.now() < deadline
    ) {
      await this.sleep(1_000);
      getResult = await this.rpc.getTransaction(hash);
    }

    if (getResult.status !== SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
      throw new Error(
        `Transaction did not succeed. Status: ${getResult.status}, hash: ${hash}`
      );
    }

    return hash;
  }

  // -------------------------------------------------------------------------
  // Utilities
  // -------------------------------------------------------------------------

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
