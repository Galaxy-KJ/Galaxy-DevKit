/**
 * Client-side Soroban transaction assembly for the smart wallet playground.
 *
 * Responsibilities:
 *  1. Build a native XLM payment transaction envelope.
 *  2. Simulate it against the RPC to derive auth entries and fee estimate.
 *  3. Return the simulate result separately so the UI can render it before
 *     the user commits to broadcasting.
 *  4. Assemble the final signed XDR once the wallet has signed the auth entry.
 */

import {
  Asset,
  BASE_FEE,
  Networks,
  Operation,
  Transaction,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import {
  Server,
  Api,
  assembleTransaction,
} from '@stellar/stellar-sdk/rpc';

export interface PaymentParams {
  /** Bech32 contract address of the smart wallet (source) */
  walletAddress: string;
  /** Classic Stellar G-address of the recipient */
  destination: string;
  /** XLM amount as a decimal string, e.g. "10.5" */
  amount: string;
  /** Optional memo text (max 28 bytes) */
  memo?: string;
}

export interface SimulateResult {
  /** Estimated fee in stroops */
  estimatedFee: string;
  /** Raw simulation result for display */
  raw: Api.SimulateTransactionResponse;
  /** The unsigned transaction that was simulated */
  transaction: Transaction;
}

export interface BuildAndSimulateResult extends SimulateResult {
  /** Auth entries count */
  authEntryCount: number;
}

const MIN_FEE_STROOPS = 100;

export class TxBuilderClient {
  private server: Server;
  private network: string;

  constructor(rpcUrl: string, network: string = Networks.TESTNET) {
    this.server = new Server(rpcUrl);
    this.network = network;
  }

  /**
   * Builds a native XLM payment and simulates it.
   * Returns the simulation payload so the caller can render it before
   * asking the user to authorize.
   */
  async buildAndSimulate(params: PaymentParams): Promise<BuildAndSimulateResult> {
    const { walletAddress, destination, amount, memo } = params;

    if (!walletAddress) throw new Error('buildAndSimulate: walletAddress is required');
    if (!destination) throw new Error('buildAndSimulate: destination is required');
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      throw new Error('buildAndSimulate: amount must be a positive number');
    }

    const { sequence } = await this.server.getLatestLedger();
    const sourceAccount = {
      accountId: () => walletAddress,
      sequenceNumber: () => String(BigInt(sequence) + 1n),
      incrementSequenceNumber: () => {},
    } as unknown as ConstructorParameters<typeof TransactionBuilder>[0];

    const builder = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.network,
    }).addOperation(
      Operation.payment({
        destination,
        asset: Asset.native(),
        amount,
      })
    );

    if (memo) {
      builder.addMemo({ value: memo } as any);
    }

    const tx = builder.setTimeout(300).build();
    const simResult = await this.server.simulateTransaction(tx);

    if (Api.isSimulationError(simResult)) {
      throw new Error(`Transaction simulation failed: ${simResult.error}`);
    }

    const estimatedFee = String(
      Math.max(MIN_FEE_STROOPS, parseInt(simResult.minResourceFee ?? '0', 10))
    );

    return {
      estimatedFee,
      raw: simResult,
      transaction: tx,
      authEntryCount: simResult.result?.auth?.length ?? 0,
    };
  }

  /**
   * Assembles the final transaction from signed XDR returned by the wallet.
   * Broadcasts it to the network and returns the transaction hash.
   */
  async submitSignedXdr(signedXdr: string): Promise<string> {
    if (!signedXdr) throw new Error('submitSignedXdr: signedXdr is required');

    const sendResult = await this.server.sendTransaction(
      TransactionBuilder.fromXDR(signedXdr, this.network) as Transaction
    );

    if (sendResult.status === 'ERROR') {
      throw new Error(`Transaction submission failed: ${sendResult.errorResult ?? 'unknown error'}`);
    }

    return sendResult.hash;
  }

  /**
   * Assembles a fee-less signed transaction XDR from the simulate result
   * and the signed auth payload returned by the wallet service.
   */
  assembleFromSimulation(
    tx: Transaction,
    simResult: Api.SimulateTransactionResponse
  ): string {
    const assembled = assembleTransaction(tx, simResult).build();
    return assembled.toEnvelope().toXDR('base64');
  }
}
