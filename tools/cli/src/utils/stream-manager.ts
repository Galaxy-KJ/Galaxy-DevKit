/**
 * @fileoverview Stream Manager for Galaxy CLI
 * @description Handles real-time data streaming from Stellar network using RxJS
 * @author Galaxy DevKit Team
 * @version 1.0.0
 */

import { Observable } from 'rxjs';
import * as StellarSDK from '@stellar/stellar-sdk';

export interface StreamOptions {
  network: 'testnet' | 'mainnet';
  horizonUrl?: string;
  rpcUrl?: string;
}

export class StreamManager {
  private server: StellarSDK.Horizon.Server;
  private network: string;

  constructor(options: StreamOptions) {
    this.network = (options.network || 'testnet').trim();
    const url =
      options.horizonUrl ||
      (this.network === 'mainnet'
        ? 'https://horizon.stellar.org'
        : 'https://horizon-testnet.stellar.org');
    this.server = new StellarSDK.Horizon.Server(url);
  }

  /**
   * Get the Horizon server instance
   */
  getServer(): StellarSDK.Horizon.Server {
    return this.server;
  }

  /**
   * Load account details
   */
  async loadAccount(address: string) {
    return this.server.loadAccount(address.trim());
  }

  /**
   * Stream account payments
   */
  watchAccountPayments(
    address: string
  ): Observable<StellarSDK.Horizon.ServerApi.PaymentOperationRecord> {
    const cleanAddress = address.trim();
    return new Observable(subscriber => {
      const closeStream = this.server
        .payments()
        .forAccount(cleanAddress)
        .cursor('now')
        .stream({
          onmessage: payment =>
            subscriber.next(
              payment as StellarSDK.Horizon.ServerApi.PaymentOperationRecord
            ),
          onerror: error => {
            // Better error info
            const msg = (error as any).message || 'Stream connection error';
            subscriber.error(new Error(msg));
          },
        });

      return () => closeStream();
    });
  }

  /**
   * Stream account transactions
   */
  watchAccountTransactions(
    address: string
  ): Observable<StellarSDK.Horizon.ServerApi.TransactionRecord> {
    const cleanAddress = address.trim();
    return new Observable(subscriber => {
      const closeStream = this.server
        .transactions()
        .forAccount(cleanAddress)
        .cursor('now')
        .stream({
          onmessage: tx => subscriber.next(tx),
          onerror: error => subscriber.error(error),
        });

      return () => closeStream();
    });
  }

  /**
   * Watch a specific transaction until settled
   */
  watchTransaction(
    hash: string
  ): Observable<StellarSDK.Horizon.ServerApi.TransactionRecord> {
    const cleanHash = hash.trim();
    return new Observable(subscriber => {
      let isClosed = false;
      const poll = async () => {
        while (!isClosed) {
          try {
            const tx = await this.server
              .transactions()
              .transaction(cleanHash)
              .call();
            subscriber.next(tx);
            subscriber.complete();
            break;
          } catch (error) {
            // Transaction not found yet, keep polling
            await new Promise(resolve => setTimeout(resolve, 2000));
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
   * Stream ledger updates
   */
  watchLedgers(): Observable<StellarSDK.Horizon.ServerApi.LedgerRecord> {
    return new Observable(subscriber => {
      const closeStream = this.server
        .ledgers()
        .cursor('now')
        .stream({
          onmessage: ledger => subscriber.next(ledger),
          onerror: error => subscriber.error(error),
        });

      return () => closeStream();
    });
  }
}
