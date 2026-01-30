/**
 * @fileoverview Stream Manager for Galaxy CLI
 * @description Handles real-time data streaming from Stellar network using RxJS
 * @author Galaxy DevKit Team
 * @version 1.1.0
 */

import { Observable, Subject, timer, throwError } from 'rxjs';
import { retry, takeUntil, timeout, catchError, tap } from 'rxjs/operators';
import * as StellarSDK from '@stellar/stellar-sdk';

export interface StreamOptions {
  network: 'testnet' | 'mainnet';
  horizonUrl?: string;
  rpcUrl?: string;
}

export interface RetryConfig {
  maxAttempts: number;
  delayMs: number;
  backoffMultiplier: number;
}

export interface StreamConfig {
  timeoutMs?: number;
  retryConfig?: RetryConfig;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  delayMs: 1000,
  backoffMultiplier: 2,
};

const DEFAULT_TIMEOUT_MS = 60000; // 60 seconds

export class StreamManager {
  private server: StellarSDK.Horizon.Server;
  private network: string;
  private horizonUrl: string;
  private rpcUrl: string;
  private retryConfig: RetryConfig;
  private rateLimitDelay = 0;
  private lastRateLimitTime = 0;

  constructor(options: StreamOptions) {
    this.network = (options.network || 'testnet').trim();
    this.horizonUrl =
      options.horizonUrl ||
      (this.network === 'mainnet'
        ? 'https://horizon.stellar.org'
        : 'https://horizon-testnet.stellar.org');
    this.rpcUrl =
      options.rpcUrl ||
      (this.network === 'mainnet'
        ? 'https://soroban-rpc.mainnet.stellar.gateway.fm'
        : 'https://soroban-testnet.stellar.org');
    this.server = new StellarSDK.Horizon.Server(this.horizonUrl);
    this.retryConfig = DEFAULT_RETRY_CONFIG;
  }

  /**
   * Get the Horizon server instance
   */
  getServer(): StellarSDK.Horizon.Server {
    return this.server;
  }

  /**
   * Get the RPC URL for Soroban
   */
  getRpcUrl(): string {
    return this.rpcUrl;
  }

  /**
   * Load account details
   */
  async loadAccount(address: string) {
    await this.checkRateLimit();
    return this.server.loadAccount(address.trim());
  }

  /**
   * Check and handle rate limiting
   */
  private async checkRateLimit(): Promise<void> {
    if (this.rateLimitDelay > 0) {
      const timeSinceLimit = Date.now() - this.lastRateLimitTime;
      if (timeSinceLimit < this.rateLimitDelay) {
        await new Promise(resolve =>
          setTimeout(resolve, this.rateLimitDelay - timeSinceLimit)
        );
      }
      this.rateLimitDelay = 0;
    }
  }

  /**
   * Handle rate limit response from Horizon
   */
  private handleRateLimit(error: any): void {
    if (error?.response?.status === 429) {
      const retryAfter = error.response.headers?.['retry-after'];
      this.rateLimitDelay = retryAfter ? parseInt(retryAfter) * 1000 : 5000;
      this.lastRateLimitTime = Date.now();
    }
  }

  /**
   * Create a stream with auto-reconnection and error handling
   */
  private createReconnectingStream<T>(
    streamFactory: (onMessage: (data: T) => void, onError: (err: any) => void) => () => void,
    config: StreamConfig = {}
  ): Observable<T> {
    const retryConfig = config.retryConfig || this.retryConfig;

    return new Observable<T>(subscriber => {
      let closeStream: (() => void) | null = null;
      let attemptCount = 0;
      let isClosed = false;

      const connect = () => {
        if (isClosed) return;

        closeStream = streamFactory(
          (data: T) => {
            attemptCount = 0; // Reset on successful message
            subscriber.next(data);
          },
          (error: any) => {
            this.handleRateLimit(error);

            attemptCount++;
            if (attemptCount < retryConfig.maxAttempts) {
              const delay =
                retryConfig.delayMs *
                Math.pow(retryConfig.backoffMultiplier, attemptCount - 1);
              console.log(
                `Stream disconnected, reconnecting in ${delay}ms (attempt ${attemptCount}/${retryConfig.maxAttempts})...`
              );
              setTimeout(connect, delay);
            } else {
              const msg =
                (error as any).message ||
                `Stream failed after ${retryConfig.maxAttempts} reconnection attempts`;
              subscriber.error(new Error(msg));
            }
          }
        );
      };

      connect();

      return () => {
        isClosed = true;
        if (closeStream) closeStream();
      };
    });
  }

  /**
   * Stream account payments with auto-reconnection
   */
  watchAccountPayments(
    address: string,
    config: StreamConfig = {}
  ): Observable<StellarSDK.Horizon.ServerApi.PaymentOperationRecord> {
    const cleanAddress = address.trim();

    return this.createReconnectingStream<StellarSDK.Horizon.ServerApi.PaymentOperationRecord>(
      (onMessage, onError) => {
        return this.server
          .payments()
          .forAccount(cleanAddress)
          .cursor('now')
          .stream({
            onmessage: payment =>
              onMessage(
                payment as StellarSDK.Horizon.ServerApi.PaymentOperationRecord
              ),
            onerror: error => onError(error),
          });
      },
      config
    );
  }

  /**
   * Stream account transactions with auto-reconnection
   */
  watchAccountTransactions(
    address: string,
    config: StreamConfig = {}
  ): Observable<StellarSDK.Horizon.ServerApi.TransactionRecord> {
    const cleanAddress = address.trim();

    return this.createReconnectingStream<StellarSDK.Horizon.ServerApi.TransactionRecord>(
      (onMessage, onError) => {
        return this.server
          .transactions()
          .forAccount(cleanAddress)
          .cursor('now')
          .stream({
            onmessage: tx => onMessage(tx),
            onerror: error => onError(error),
          });
      },
      config
    );
  }

  /**
   * Watch a specific transaction until settled with configurable timeout
   */
  watchTransaction(
    hash: string,
    timeoutMs: number = DEFAULT_TIMEOUT_MS
  ): Observable<StellarSDK.Horizon.ServerApi.TransactionRecord> {
    const cleanHash = hash.trim();
    const stopPolling$ = new Subject<void>();

    return new Observable<StellarSDK.Horizon.ServerApi.TransactionRecord>(
      subscriber => {
        let isClosed = false;
        const startTime = Date.now();

        const poll = async () => {
          while (!isClosed) {
            // Check timeout
            if (Date.now() - startTime > timeoutMs) {
              subscriber.error(
                new Error(
                  `Transaction not confirmed within ${timeoutMs / 1000}s timeout`
                )
              );
              return;
            }

            try {
              await this.checkRateLimit();
              const tx = await this.server
                .transactions()
                .transaction(cleanHash)
                .call();
              subscriber.next(tx);
              subscriber.complete();
              return;
            } catch (error: any) {
              this.handleRateLimit(error);

              // Transaction not found yet, keep polling
              if (error?.response?.status !== 404) {
                // Real error, not just "not found yet"
                subscriber.error(error);
                return;
              }
              await new Promise(resolve => setTimeout(resolve, 2000));
            }
          }
        };

        poll();

        return () => {
          isClosed = true;
          stopPolling$.next();
          stopPolling$.complete();
        };
      }
    );
  }

  /**
   * Stream ledger updates with auto-reconnection
   */
  watchLedgers(
    config: StreamConfig = {}
  ): Observable<StellarSDK.Horizon.ServerApi.LedgerRecord> {
    return this.createReconnectingStream<StellarSDK.Horizon.ServerApi.LedgerRecord>(
      (onMessage, onError) => {
        return this.server.ledgers().cursor('now').stream({
          onmessage: ledger => onMessage(ledger),
          onerror: error => onError(error),
        });
      },
      config
    );
  }

  /**
   * Stream all network transactions with auto-reconnection
   */
  watchAllTransactions(
    config: StreamConfig = {}
  ): Observable<StellarSDK.Horizon.ServerApi.TransactionRecord> {
    return this.createReconnectingStream<StellarSDK.Horizon.ServerApi.TransactionRecord>(
      (onMessage, onError) => {
        return this.server.transactions().cursor('now').stream({
          onmessage: tx => onMessage(tx),
          onerror: error => onError(error),
        });
      },
      config
    );
  }

  /**
   * Watch Soroban contract events
   * Note: This uses polling since Soroban RPC doesn't have native streaming yet
   */
  watchContractEvents(
    contractId: string,
    options: {
      eventType?: string;
      intervalMs?: number;
      startLedger?: number;
    } = {}
  ): Observable<any> {
    const { eventType, intervalMs = 5000 } = options;

    return new Observable(subscriber => {
      let isClosed = false;
      let cursor: string | undefined;

      const poll = async () => {
        while (!isClosed) {
          try {
            await this.checkRateLimit();

            // Use fetch to call Soroban RPC getEvents
            const response = await fetch(this.rpcUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'getEvents',
                params: {
                  startLedger: options.startLedger || 'now',
                  filters: [
                    {
                      type: 'contract',
                      contractIds: [contractId],
                      ...(eventType && { topics: [[eventType]] }),
                    },
                  ],
                  pagination: {
                    limit: 100,
                    ...(cursor && { cursor }),
                  },
                },
              }),
            });

            const data = await response.json();

            if (data.result?.events) {
              for (const event of data.result.events) {
                subscriber.next(event);
              }
              if (data.result.events.length > 0) {
                cursor =
                  data.result.events[data.result.events.length - 1].pagingToken;
              }
            }

            await new Promise(resolve => setTimeout(resolve, intervalMs));
          } catch (error: any) {
            this.handleRateLimit(error);
            // Log error but continue polling
            console.error('Contract event polling error:', error.message);
            await new Promise(resolve => setTimeout(resolve, intervalMs));
          }
        }
      };

      poll();

      return () => {
        isClosed = true;
      };
    });
  }

  /**
   * Update retry configuration
   */
  setRetryConfig(config: Partial<RetryConfig>): void {
    this.retryConfig = { ...this.retryConfig, ...config };
  }

  /**
   * Get current retry configuration
   */
  getRetryConfig(): RetryConfig {
    return { ...this.retryConfig };
  }
}
