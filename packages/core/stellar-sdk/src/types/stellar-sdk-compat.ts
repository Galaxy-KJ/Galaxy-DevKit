/**
 * @fileoverview Stellar SDK Compatibility Layer
 * @description Type shims for backward compatibility with older Stellar SDK versions
 */

import * as StellarSdk from '@stellar/stellar-sdk';

// Re-export everything from stellar-sdk
export * from '@stellar/stellar-sdk';

// Type shim for SorobanRpc (legacy compatibility)
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace SorobanRpc {
  export class Server {
    constructor(serverURL: string, opts?: any) {
      // @ts-ignore - Using internal API for compatibility
      const sdk = StellarSdk as any;
      if (sdk.SorobanRpc && sdk.SorobanRpc.Server) {
        return new sdk.SorobanRpc.Server(serverURL, opts);
      } else if (sdk.rpc && sdk.rpc.Server) {
        return new sdk.rpc.Server(serverURL, opts);
      } else if (sdk.Server) {
        return new sdk.Server(serverURL, opts);
      }
      throw new Error('SorobanRpc.Server not found in Stellar SDK');
    }

    getEvents(...args: any[]): Promise<any> {
      return Promise.resolve({} as any);
    }

    getLatestLedger(...args: any[]): Promise<any> {
      return Promise.resolve({} as any);
    }

    getTransaction(...args: any[]): Promise<any> {
      return Promise.resolve({} as any);
    }

    sendTransaction(...args: any[]): Promise<any> {
      return Promise.resolve({} as any);
    }

    simulateTransaction(...args: any[]): Promise<any> {
      return Promise.resolve({} as any);
    }
  }

  export interface GetEventsResponse {
    events: any[];
    latestLedger: number;
  }

  export interface EventFilter {
    contractIds?: string[];
    topics?: Array<string[]>;
    type?: string;
  }
}
