/**
 * @fileoverview Builder for sponsored account creation operations
 * @description Handles building operations for sponsored account creation
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import {
  Keypair,
  Operation,
  TransactionBuilder,
  Horizon,
  xdr,
} from '@stellar/stellar-sdk';
import { NetworkConfig } from '../../types/stellar-types';
import { SponsorshipResult, AccountEntryConfig } from '../types/sponsored-reserves-types';
import { validatePublicKey, validateSecretKey, validateAmount } from '../utils/sponsorship-validation';
import { SponsoredReservesManager } from '../services/sponsored-reserves-manager';

/**
 * Builder class for sponsored account creation
 * @class SponsoredAccountBuilder
 */
export class SponsoredAccountBuilder {
  private manager: SponsoredReservesManager;
  private server: Horizon.Server;
  private networkConfig: NetworkConfig;

  /**
   * Creates a new SponsoredAccountBuilder instance
   * @param networkConfig - Network configuration
   */
  constructor(networkConfig: NetworkConfig) {
    this.networkConfig = networkConfig;
    this.server = new Horizon.Server(networkConfig.horizonUrl);
    this.manager = new SponsoredReservesManager(networkConfig);
  }

  /**
   * Builds operations for sponsored account creation
   * @param sponsorPublicKey - Sponsor's public key
   * @param newAccountPublicKey - New account's public key
   * @param startingBalance - Starting balance (can be "0" when sponsored)
   * @returns Array of operations
   */
  buildSponsoredAccountCreation(
    sponsorPublicKey: string,
    newAccountPublicKey: string,
    startingBalance: string = '0'
  ): xdr.Operation[] {
    if (!validatePublicKey(sponsorPublicKey)) {
      throw new Error('Invalid sponsor public key');
    }
    if (!validatePublicKey(newAccountPublicKey)) {
      throw new Error('Invalid new account public key');
    }
    if (!validateAmount(startingBalance, true)) {
      throw new Error('Invalid starting balance');
    }

    const operations: xdr.Operation[] = [];

    // Begin sponsoring
    operations.push(
      Operation.beginSponsoringFutureReserves({
        sponsoredId: newAccountPublicKey,
      })
    );

    // Create account operation
    operations.push(
      Operation.createAccount({
        destination: newAccountPublicKey,
        startingBalance: startingBalance,
      })
    );

    // End sponsoring (source must be the new account)
    operations.push(
      Operation.endSponsoringFutureReserves({
        source: newAccountPublicKey,
      })
    );

    return operations;
  }

  /**
   * Creates a sponsored account with full transaction execution
   * @param sponsorSecret - Sponsor's secret key
   * @param newAccountSecret - New account's secret key
   * @param startingBalance - Starting balance
   * @returns Promise<SponsorshipResult>
   */
  async createSponsoredAccount(
    sponsorSecret: string,
    newAccountSecret: string,
    startingBalance: string = '0'
  ): Promise<SponsorshipResult> {
    if (!validateSecretKey(sponsorSecret)) {
      throw new Error('Invalid sponsor secret key');
    }
    if (!validateSecretKey(newAccountSecret)) {
      throw new Error('Invalid new account secret key');
    }

    const sponsorKeypair = Keypair.fromSecret(sponsorSecret);
    const newAccountKeypair = Keypair.fromSecret(newAccountSecret);

    // Load sponsor account
    const sponsorAccount = await this.server.loadAccount(sponsorKeypair.publicKey());

    // Build transaction with sponsored account creation
    const transaction = new TransactionBuilder(sponsorAccount, {
      fee: await this.estimateFee(3),
      networkPassphrase: this.networkConfig.passphrase,
    })
      .addOperation(
        Operation.beginSponsoringFutureReserves({
          sponsoredId: newAccountKeypair.publicKey(),
        })
      )
      .addOperation(
        Operation.createAccount({
          destination: newAccountKeypair.publicKey(),
          startingBalance: startingBalance,
        })
      )
      .addOperation(
        Operation.endSponsoringFutureReserves({
          source: newAccountKeypair.publicKey(),
        })
      )
      .setTimeout(180)
      .build();

    // Sign with both keypairs
    transaction.sign(sponsorKeypair);
    transaction.sign(newAccountKeypair);

    // Submit transaction
    const result = await this.server.submitTransaction(transaction);

    return {
      hash: result.hash,
      status: result.successful ? 'success' : 'failed',
      ledger: result.ledger.toString(),
      createdAt: new Date(),
      sponsoredEntries: [{ type: 'account', id: newAccountKeypair.publicKey() }],
      feePaid: transaction.fee.toString(),
    };
  }

  /**
   * Builds an unsigned transaction for sponsored account creation
   * @param sponsorPublicKey - Sponsor's public key
   * @param newAccountPublicKey - New account's public key
   * @param startingBalance - Starting balance
   * @returns Promise with transaction XDR and required signers
   */
  async buildUnsignedTransaction(
    sponsorPublicKey: string,
    newAccountPublicKey: string,
    startingBalance: string = '0'
  ): Promise<{ xdr: string; requiredSigners: string[] }> {
    if (!validatePublicKey(sponsorPublicKey)) {
      throw new Error('Invalid sponsor public key');
    }
    if (!validatePublicKey(newAccountPublicKey)) {
      throw new Error('Invalid new account public key');
    }

    const sponsorAccount = await this.server.loadAccount(sponsorPublicKey);

    const transaction = new TransactionBuilder(sponsorAccount, {
      fee: await this.estimateFee(3),
      networkPassphrase: this.networkConfig.passphrase,
    })
      .addOperation(
        Operation.beginSponsoringFutureReserves({
          sponsoredId: newAccountPublicKey,
        })
      )
      .addOperation(
        Operation.createAccount({
          destination: newAccountPublicKey,
          startingBalance: startingBalance,
        })
      )
      .addOperation(
        Operation.endSponsoringFutureReserves({
          source: newAccountPublicKey,
        })
      )
      .setTimeout(180)
      .build();

    return {
      xdr: transaction.toXDR(),
      requiredSigners: [sponsorPublicKey, newAccountPublicKey],
    };
  }

  /**
   * Estimates transaction fee
   * @param operationCount - Number of operations
   * @returns Fee in stroops as string
   */
  private async estimateFee(operationCount: number = 1): Promise<string> {
    try {
      const feeStats = await this.server.feeStats();
      const baseFee = parseInt(feeStats.max_fee.mode, 10);
      return (baseFee * operationCount).toString();
    } catch {
      return (100 * operationCount).toString();
    }
  }
}
