/**
 * @fileoverview Template for sponsored claimable balance operations
 * @description Provides templates for common claimable balance patterns like airdrops and vesting
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import {
  Keypair,
  Asset,
  Operation,
  TransactionBuilder,
  Memo,
  Horizon,
  Claimant as StellarClaimant,
  xdr,
} from '@stellar/stellar-sdk';
import { NetworkConfig } from '../../types/stellar-types.js';
import {
  ClaimableBalanceSponsorshipConfig,
  SponsorshipResult,
  Claimant,
  ClaimPredicate,
} from '../types/sponsored-reserves-types.js';
import {
  validatePublicKey,
  validateSecretKey,
  validateAmount,
  validateClaimants,
} from '../utils/sponsorship-validation.js';

/**
 * Template class for sponsored claimable balance operations
 * @class ClaimableBalanceTemplate
 */
export class ClaimableBalanceTemplate {
  private server: Horizon.Server;
  private networkConfig: NetworkConfig;

  /**
   * Creates a new ClaimableBalanceTemplate instance
   * @param networkConfig - Network configuration
   */
  constructor(networkConfig: NetworkConfig) {
    this.networkConfig = networkConfig;
    this.server = new Horizon.Server(networkConfig.horizonUrl);
  }

  /**
   * Converts a ClaimPredicate to Stellar SDK format
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
   */
  private buildStellarClaimant(claimant: Claimant): StellarClaimant {
    return new StellarClaimant(
      claimant.destination,
      this.buildClaimPredicate(claimant.predicate)
    );
  }

  /**
   * Creates a sponsored airdrop using claimable balances
   * Recipients can claim their airdrop without needing any XLM
   * @param sponsorSecret - Sponsor's secret key
   * @param sourceSecret - Source account's secret key (holds the tokens)
   * @param asset - Asset to airdrop
   * @param recipients - Array of recipient addresses with amounts
   * @param expirationTime - Optional expiration timestamp
   * @returns Promise<SponsorshipResult[]>
   */
  async createSponsoredAirdrop(
    sponsorSecret: string,
    sourceSecret: string,
    asset: { code: string; issuer?: string },
    recipients: Array<{ destination: string; amount: string }>,
    expirationTime?: number
  ): Promise<SponsorshipResult[]> {
    if (!validateSecretKey(sponsorSecret)) {
      throw new Error('Invalid sponsor secret key');
    }
    if (!validateSecretKey(sourceSecret)) {
      throw new Error('Invalid source secret key');
    }

    const sponsorKeypair = Keypair.fromSecret(sponsorSecret);
    const sourceKeypair = Keypair.fromSecret(sourceSecret);

    const stellarAsset =
      asset.code === 'XLM' || !asset.issuer
        ? Asset.native()
        : new Asset(asset.code, asset.issuer);

    const results: SponsorshipResult[] = [];

    // Process in batches to avoid transaction size limits
    const batchSize = 10;
    for (let i = 0; i < recipients.length; i += batchSize) {
      const batch = recipients.slice(i, i + batchSize);

      const sponsorAccount = await this.server.loadAccount(sponsorKeypair.publicKey());

      const builder = new TransactionBuilder(sponsorAccount, {
        fee: await this.estimateFee(batch.length * 3),
        networkPassphrase: this.networkConfig.passphrase,
      });

      for (const recipient of batch) {
        if (!validatePublicKey(recipient.destination)) {
          throw new Error(`Invalid recipient address: ${recipient.destination}`);
        }
        if (!validateAmount(recipient.amount)) {
          throw new Error(`Invalid amount for ${recipient.destination}`);
        }

        // Build claimant with optional expiration
        let claimants: StellarClaimant[];
        if (expirationTime) {
          claimants = [
            new StellarClaimant(
              recipient.destination,
              StellarClaimant.predicateBeforeAbsoluteTime(expirationTime.toString())
            ),
          ];
        } else {
          claimants = [
            new StellarClaimant(
              recipient.destination,
              StellarClaimant.predicateUnconditional()
            ),
          ];
        }

        // Begin sponsoring
        builder.addOperation(
          Operation.beginSponsoringFutureReserves({
            sponsoredId: sourceKeypair.publicKey(),
          })
        );

        // Create claimable balance
        builder.addOperation(
          Operation.createClaimableBalance({
            asset: stellarAsset,
            amount: recipient.amount,
            claimants: claimants,
            source: sourceKeypair.publicKey(),
          })
        );

        // End sponsoring
        builder.addOperation(
          Operation.endSponsoringFutureReserves({
            source: sourceKeypair.publicKey(),
          })
        );
      }

      const transaction = builder.setTimeout(180).build();
      transaction.sign(sponsorKeypair);
      transaction.sign(sourceKeypair);

      const result = await this.server.submitTransaction(transaction);

      results.push({
        hash: result.hash,
        status: result.successful ? 'success' : 'failed',
        ledger: result.ledger.toString(),
        createdAt: new Date(),
        sponsoredEntries: batch.map(() => ({ type: 'claimable_balance' as const })),
        feePaid: transaction.fee.toString(),
      });
    }

    return results;
  }

  /**
   * Creates a sponsored vesting schedule using claimable balances
   * @param sponsorSecret - Sponsor's secret key
   * @param sourceSecret - Source account's secret key
   * @param asset - Asset to vest
   * @param recipient - Recipient address
   * @param vestingSchedule - Array of vesting tranches
   * @returns Promise<SponsorshipResult>
   */
  async createSponsoredVesting(
    sponsorSecret: string,
    sourceSecret: string,
    asset: { code: string; issuer?: string },
    recipient: string,
    vestingSchedule: Array<{ amount: string; unlockTime: number }>
  ): Promise<SponsorshipResult> {
    if (!validateSecretKey(sponsorSecret)) {
      throw new Error('Invalid sponsor secret key');
    }
    if (!validateSecretKey(sourceSecret)) {
      throw new Error('Invalid source secret key');
    }
    if (!validatePublicKey(recipient)) {
      throw new Error('Invalid recipient address');
    }

    const sponsorKeypair = Keypair.fromSecret(sponsorSecret);
    const sourceKeypair = Keypair.fromSecret(sourceSecret);

    const stellarAsset =
      asset.code === 'XLM' || !asset.issuer
        ? Asset.native()
        : new Asset(asset.code, asset.issuer);

    const sponsorAccount = await this.server.loadAccount(sponsorKeypair.publicKey());

    const builder = new TransactionBuilder(sponsorAccount, {
      fee: await this.estimateFee(vestingSchedule.length * 3),
      networkPassphrase: this.networkConfig.passphrase,
    });

    for (const tranche of vestingSchedule) {
      if (!validateAmount(tranche.amount)) {
        throw new Error('Invalid vesting amount');
      }

      // Create claimant that can only claim after unlock time
      // Using NOT(beforeAbsoluteTime) to create "after time" predicate
      const claimants = [
        new StellarClaimant(
          recipient,
          StellarClaimant.predicateNot(
            StellarClaimant.predicateBeforeAbsoluteTime(tranche.unlockTime.toString())
          )
        ),
      ];

      builder.addOperation(
        Operation.beginSponsoringFutureReserves({
          sponsoredId: sourceKeypair.publicKey(),
        })
      );

      builder.addOperation(
        Operation.createClaimableBalance({
          asset: stellarAsset,
          amount: tranche.amount,
          claimants: claimants,
          source: sourceKeypair.publicKey(),
        })
      );

      builder.addOperation(
        Operation.endSponsoringFutureReserves({
          source: sourceKeypair.publicKey(),
        })
      );
    }

    builder.addMemo(Memo.text('Vesting schedule'));
    const transaction = builder.setTimeout(180).build();

    transaction.sign(sponsorKeypair);
    transaction.sign(sourceKeypair);

    const result = await this.server.submitTransaction(transaction);

    return {
      hash: result.hash,
      status: result.successful ? 'success' : 'failed',
      ledger: result.ledger.toString(),
      createdAt: new Date(),
      sponsoredEntries: vestingSchedule.map(() => ({
        type: 'claimable_balance' as const,
      })),
      feePaid: transaction.fee.toString(),
    };
  }

  /**
   * Creates a sponsored escrow-style claimable balance
   * Can be claimed by either party under different conditions
   * @param sponsorSecret - Sponsor's secret key
   * @param sourceSecret - Source account's secret key
   * @param asset - Asset to escrow
   * @param amount - Amount to escrow
   * @param partyA - First party's public key
   * @param partyB - Second party's public key
   * @param releaseTime - Time when partyA can claim (partyB can claim anytime)
   * @returns Promise<SponsorshipResult>
   */
  async createSponsoredEscrow(
    sponsorSecret: string,
    sourceSecret: string,
    asset: { code: string; issuer?: string },
    amount: string,
    partyA: string,
    partyB: string,
    releaseTime: number
  ): Promise<SponsorshipResult> {
    if (!validateSecretKey(sponsorSecret)) {
      throw new Error('Invalid sponsor secret key');
    }
    if (!validateSecretKey(sourceSecret)) {
      throw new Error('Invalid source secret key');
    }
    if (!validatePublicKey(partyA)) {
      throw new Error('Invalid party A address');
    }
    if (!validatePublicKey(partyB)) {
      throw new Error('Invalid party B address');
    }
    if (!validateAmount(amount)) {
      throw new Error('Invalid amount');
    }

    const sponsorKeypair = Keypair.fromSecret(sponsorSecret);
    const sourceKeypair = Keypair.fromSecret(sourceSecret);

    const stellarAsset =
      asset.code === 'XLM' || !asset.issuer
        ? Asset.native()
        : new Asset(asset.code, asset.issuer);

    // PartyA can claim after releaseTime
    // PartyB can claim anytime (could be used for refund scenarios)
    const claimants = [
      new StellarClaimant(
        partyA,
        StellarClaimant.predicateNot(
          StellarClaimant.predicateBeforeAbsoluteTime(releaseTime.toString())
        )
      ),
      new StellarClaimant(partyB, StellarClaimant.predicateUnconditional()),
    ];

    const sponsorAccount = await this.server.loadAccount(sponsorKeypair.publicKey());

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
          claimants: claimants,
          source: sourceKeypair.publicKey(),
        })
      )
      .addOperation(
        Operation.endSponsoringFutureReserves({
          source: sourceKeypair.publicKey(),
        })
      )
      .addMemo(Memo.text('Escrow'))
      .setTimeout(180)
      .build();

    transaction.sign(sponsorKeypair);
    transaction.sign(sourceKeypair);

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
   * Helper to create a linear vesting schedule
   * @param totalAmount - Total amount to vest
   * @param tranches - Number of vesting tranches
   * @param startTime - Unix timestamp of first unlock
   * @param intervalSeconds - Seconds between each tranche
   * @returns Array of vesting tranches
   */
  static createLinearVestingSchedule(
    totalAmount: string,
    tranches: number,
    startTime: number,
    intervalSeconds: number
  ): Array<{ amount: string; unlockTime: number }> {
    const amountPerTranche = (parseFloat(totalAmount) / tranches).toFixed(7);
    const schedule: Array<{ amount: string; unlockTime: number }> = [];

    for (let i = 0; i < tranches; i++) {
      schedule.push({
        amount: amountPerTranche,
        unlockTime: startTime + i * intervalSeconds,
      });
    }

    return schedule;
  }

  /**
   * Estimates transaction fee
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
