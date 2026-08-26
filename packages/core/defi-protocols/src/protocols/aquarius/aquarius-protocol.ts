/**
 * @fileoverview Aquarius Protocol implementation
 * @description Aquarius DEX adapter with reward claiming
 */

import { Asset, TransactionResult, ProtocolConfig, ProtocolType } from '../../types/defi-types.js';
import { SdexProtocol } from '../sdex/sdex-protocol.js';
import { Operation, TransactionBuilder, BASE_FEE, Keypair } from '@stellar/stellar-sdk';
import { InvalidOperationError } from '../../errors/index.js';

export class AquariusProtocol extends SdexProtocol {
  private readonly baseUrl = 'https://amm-api.aquarius.network';

  constructor(config: ProtocolConfig) {
    super(config);
  }

  protected getProtocolType(): ProtocolType {
    return ProtocolType.DEX;
  }

  public async getIncentivizedPools(): Promise<any> {
    this.ensureInitialized();
    const res = await fetch(`${this.baseUrl}/pools`);
    if (!res.ok) {
      throw new Error(`Failed to fetch Aquarius pools: ${res.statusText}`);
    }
    return res.json();
  }

  public async claimRewards(
    walletAddress: string,
    privateKey: string,
    balanceIds: string[]
  ): Promise<TransactionResult> {
    this.ensureInitialized();
    this.validateAddress(walletAddress);

    if (!balanceIds || balanceIds.length === 0) {
      throw new Error('No balance IDs provided for claiming rewards');
    }

    try {
      const sourceKeypair = privateKey ? Keypair.fromSecret(privateKey) : undefined;
      const account = await this.horizonServer.loadAccount(walletAddress);

      let txBuilder = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      });

      for (const balanceId of balanceIds) {
        txBuilder = txBuilder.addOperation(
          Operation.claimClaimableBalance({ balanceId })
        );
      }

      const transaction = txBuilder.setTimeout(180).build();

      if (!sourceKeypair) {
        return this.buildTransactionResult(transaction.toXDR(), 'pending', 0, {
          operation: 'claimRewards',
          protocol: 'aquarius'
        });
      }

      transaction.sign(sourceKeypair);
      const res = await this.horizonServer.submitTransaction(transaction);

      return this.buildTransactionResult(
        res.hash,
        res.successful ? 'success' : 'failed',
        res.ledger,
        { operation: 'claimRewards', protocol: 'aquarius' }
      );
    } catch (error) {
      this.handleError(error, 'claimRewards');
    }
  }
}
