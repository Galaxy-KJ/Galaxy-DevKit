/**
 * @fileoverview Builder for sponsored claimable balance operations
 * @description Handles building operations for sponsored claimable balance creation
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import {
  Keypair,
  Asset,
  Operation,
  TransactionBuilder,
  Horizon,
  xdr,
  Claimant as StellarClaimant,
} from '@stellar/stellar-sdk';
import { NetworkConfig } from '../../types/stellar-types';
import {
  SponsorshipResult,
  ClaimableBalanceEntryConfig,
  Claimant,
  ClaimPredicate,
} from '../types/sponsored-reserves-types';
import {
  validatePublicKey,
  validateSecretKey,
  validateAssetCode,
  validateAmount,
  validateClaimants,
} from '../utils/sponsorship-validation';

/**
 * Builder class for sponsored claimable balance operations
 * @class SponsoredClaimableBalanceBuilder
 */
export class SponsoredClaimableBalanceBuilder {
  private server: Horizon.Server;
  private networkConfig: NetworkConfig;

  /**
   * Creates a new SponsoredClaimableBalanceBuilder instance
   * @param networkConfig - Network configuration
   */
  constructor(networkConfig: NetworkConfig) {
    this.networkConfig = networkConfig;
    this.server = new Horizon.Server(networkConfig.horizonUrl);
  }

  /**
   * Converts a ClaimPredicate to Stellar SDK format
   * @param predicate - Claim predicate
   * @returns Stellar SDK claimant predicate
   */
  private buildClaimPredicate(predicate: ClaimPredicate): xdr.ClaimPredicate {
    if ('unconditional' in predicate) {
      return StellarClaimant.predicateUnconditional();
    }

    if ('and' in predicate) {
      return StellarClaimant.predicateAnd(
        this.buildClaimPredicate(predicate.and[0]),
        this.buildClaimPredicate(predicate.and[1])
      );
    }

    if ('or' in predicate) {
      return StellarClaimant.predicateOr(
        this.buildClaimPredicate(predicate.or[0]),
        this.buildClaimPredicate(predicate.or[1])
      );
    }

    if ('not' in predicate) {
      return StellarClaimant.predicateNot(this.buildClaimPredicate(predicate.not));
    }

    if ('beforeAbsoluteTime' in predicate) {
      return StellarClaimant.predicateBeforeAbsoluteTime(predicate.beforeAbsoluteTime);
    }

    if ('beforeRelativeTime' in predicate) {
      return StellarClaimant.predicateBeforeRelativeTime(predicate.beforeRelativeTime);
    }

    throw new Error('Invalid predicate format');
  }

  /**
   * Builds a Stellar Claimant from our Claimant interface
   * @param claimant - Claimant configuration
   * @returns Stellar SDK Claimant
   */
  private buildStellarClaimant(claimant: Claimant): StellarClaimant {
    return new StellarClaimant(
      claimant.destination,
      this.buildClaimPredicate(claimant.predicate)
    );
  }

  /**
   * Builds operations for a sponsored claimable balance
   * @param sponsorPublicKey - Sponsor's public key
   * @param sourcePublicKey - Source account creating the balance
   * @param asset - Asset for the claimable balance
   * @param amount - Amount
   * @param claimants - Array of claimants
   * @returns Array of operations
   */
  buildSponsoredClaimableBalance(
    sponsorPublicKey: string,
    sourcePublicKey: string,
    asset: { code: string; issuer?: string },
    amount: string,
    claimants: Claimant[]
  ): xdr.Operation[] {
    if (!validatePublicKey(sponsorPublicKey)) {
      throw new Error('Invalid sponsor public key');
    }
    if (!validatePublicKey(sourcePublicKey)) {
      throw new Error('Invalid source public key');
    }
    if (!validateAmount(amount)) {
      throw new Error('Invalid amount');
    }

    const claimantsValidation = validateClaimants(claimants);
    if (!claimantsValidation.valid) {
      throw new Error(claimantsValidation.message);
    }

    // Build asset
    const stellarAsset =
      asset.code === 'XLM' || !asset.issuer
        ? Asset.native()
        : new Asset(asset.code, asset.issuer);

    // Convert claimants to Stellar format
    const stellarClaimants = claimants.map(c => this.buildStellarClaimant(c));

    const operations: xdr.Operation[] = [];

    // Begin sponsoring
    operations.push(
      Operation.beginSponsoringFutureReserves({
        sponsoredId: sourcePublicKey,
      })
    );

    // Create claimable balance operation
    operations.push(
      Operation.createClaimableBalance({
        asset: stellarAsset,
        amount: amount,
        claimants: stellarClaimants,
        source: sourcePublicKey,
      })
    );

    // End sponsoring
    operations.push(
      Operation.endSponsoringFutureReserves({
        source: sourcePublicKey,
      })
    );

    return operations;
  }

  /**
   * Creates a sponsored claimable balance with full transaction execution
   * @param sponsorSecret - Sponsor's secret key
   * @param sourceSecret - Source account's secret key
   * @param asset - Asset for the claimable balance
   * @param amount - Amount
   * @param claimants - Array of claimants
   * @returns Promise<SponsorshipResult>
   */
  async createSponsoredClaimableBalance(
    sponsorSecret: string,
    sourceSecret: string,
    asset: { code: string; issuer?: string },
    amount: string,
    claimants: Claimant[]
  ): Promise<SponsorshipResult> {
    if (!validateSecretKey(sponsorSecret)) {
      throw new Error('Invalid sponsor secret key');
    }
    if (!validateSecretKey(sourceSecret)) {
      throw new Error('Invalid source secret key');
    }

    const sponsorKeypair = Keypair.fromSecret(sponsorSecret);
    const sourceKeypair = Keypair.fromSecret(sourceSecret);

    // Build asset
    const stellarAsset =
      asset.code === 'XLM' || !asset.issuer
        ? Asset.native()
        : new Asset(asset.code, asset.issuer);

    // Convert claimants to Stellar format
    const stellarClaimants = claimants.map(c => this.buildStellarClaimant(c));

    // Load sponsor account
    const sponsorAccount = await this.server.loadAccount(sponsorKeypair.publicKey());

    // Build transaction
    const transaction = new TransactionBuilder(sponsorAccount, {
      fee: await this.estimateFee(3),
      networkPassphrase: this.networkConfig.passphrase,
    })
      .addOperation(
        Operation.beginSponsoringFutureReserves({
          sponsoredId: sourceKeypair.publicKey(),
        })
      )
      .addOperation(
        Operation.createClaimableBalance({
          asset: stellarAsset,
          amount: amount,
          claimants: stellarClaimants,
          source: sourceKeypair.publicKey(),
        })
      )
      .addOperation(
        Operation.endSponsoringFutureReserves({
          source: sourceKeypair.publicKey(),
        })
      )
      .setTimeout(180)
      .build();

    // Sign with both keypairs
    transaction.sign(sponsorKeypair);
    transaction.sign(sourceKeypair);

    // Submit transaction
    const result = await this.server.submitTransaction(transaction);

    return {
      hash: result.hash,
      status: result.successful ? 'success' : 'failed',
      ledger: result.ledger.toString(),
      createdAt: new Date(),
      sponsoredEntries: [{ type: 'claimable_balance' }],
      feePaid: transaction.fee.toString(),
    };
  }

  /**
   * Creates a simple unconditional claimant
   * @param destination - Claimant's public key
   * @returns Claimant object
   */
  static createUnconditionalClaimant(destination: string): Claimant {
    return {
      destination,
      predicate: { unconditional: true },
    };
  }

  /**
   * Creates a time-locked claimant (can only claim before a certain time)
   * @param destination - Claimant's public key
   * @param unlockTime - Unix timestamp when claim becomes available
   * @returns Claimant object
   */
  static createTimeLockedClaimant(
    destination: string,
    unlockTime: number | string
  ): Claimant {
    return {
      destination,
      predicate: { beforeAbsoluteTime: unlockTime.toString() },
    };
  }

  /**
   * Creates a claimant with relative time lock
   * @param destination - Claimant's public key
   * @param relativeTime - Seconds from creation
   * @returns Claimant object
   */
  static createRelativeTimeClaimant(
    destination: string,
    relativeTime: number | string
  ): Claimant {
    return {
      destination,
      predicate: { beforeRelativeTime: relativeTime.toString() },
    };
  }

  /**
   * Builds an unsigned transaction for sponsored claimable balance
   * @param sponsorPublicKey - Sponsor's public key
   * @param sourcePublicKey - Source public key
   * @param asset - Asset configuration
   * @param amount - Amount
   * @param claimants - Claimants
   * @returns Promise with transaction XDR and required signers
   */
  async buildUnsignedTransaction(
    sponsorPublicKey: string,
    sourcePublicKey: string,
    asset: { code: string; issuer?: string },
    amount: string,
    claimants: Claimant[]
  ): Promise<{ xdr: string; requiredSigners: string[] }> {
    if (!validatePublicKey(sponsorPublicKey)) {
      throw new Error('Invalid sponsor public key');
    }
    if (!validatePublicKey(sourcePublicKey)) {
      throw new Error('Invalid source public key');
    }

    const stellarAsset =
      asset.code === 'XLM' || !asset.issuer
        ? Asset.native()
        : new Asset(asset.code, asset.issuer);

    const stellarClaimants = claimants.map(c => this.buildStellarClaimant(c));

    const sponsorAccount = await this.server.loadAccount(sponsorPublicKey);

    const transaction = new TransactionBuilder(sponsorAccount, {
      fee: await this.estimateFee(3),
      networkPassphrase: this.networkConfig.passphrase,
    })
      .addOperation(
        Operation.beginSponsoringFutureReserves({
          sponsoredId: sourcePublicKey,
        })
      )
      .addOperation(
        Operation.createClaimableBalance({
          asset: stellarAsset,
          amount: amount,
          claimants: stellarClaimants,
          source: sourcePublicKey,
        })
      )
      .addOperation(
        Operation.endSponsoringFutureReserves({
          source: sourcePublicKey,
        })
      )
      .setTimeout(180)
      .build();

    return {
      xdr: transaction.toXDR(),
      requiredSigners: [sponsorPublicKey, sourcePublicKey],
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
