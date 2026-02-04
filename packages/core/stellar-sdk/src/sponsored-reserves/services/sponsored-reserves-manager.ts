/**
 * @fileoverview Main manager class for sponsored reserves operations
 * @description Handles all Stellar sponsored reserves functionality
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import {
  Keypair,
  Asset,
  Operation,
  BASE_FEE,
  TransactionBuilder,
  Memo,
  Horizon,
  xdr,
  Claimant as StellarClaimant,
} from '@stellar/stellar-sdk';
import { NetworkConfig } from '../../types/stellar-types.js';
import {
  SponsorshipConfig,
  SponsoredEntry,
  SponsorshipResult,
  RevokeSponsorshipTarget,
  SponsorshipCost,
  SponsorshipEligibility,
  SponsoredEntriesQueryOptions,
  UnsignedTransactionOptions,
  UnsignedTransactionResult,
  Claimant,
  ClaimPredicate,
} from '../types/sponsored-reserves-types.js';
import {
  validatePublicKey,
  validateSecretKey,
  validateSponsorBalance,
} from '../utils/sponsorship-validation.js';
import {
  calculateEntryReserve,
  getDetailedBreakdown,
} from '../utils/cost-calculator.js';

/**
 * Manager class for Stellar sponsored reserves operations
 * @class SponsoredReservesManager
 * @description Provides methods for sponsoring reserves, building transactions, and querying sponsored entries
 */
export class SponsoredReservesManager {
  private server: Horizon.Server;
  private networkConfig: NetworkConfig;

  /**
   * Creates a new SponsoredReservesManager instance
   * @param networkConfig - Network configuration
   */
  constructor(networkConfig: NetworkConfig) {
    this.networkConfig = networkConfig;
    this.server = new Horizon.Server(networkConfig.horizonUrl);
  }

  /**
   * Creates a beginSponsoringFutureReserves operation
   * @param sponsoredPublicKey - Public key of the account to sponsor
   * @returns The Stellar operation
   */
  beginSponsoringFutureReserves(sponsoredPublicKey: string): xdr.Operation {
    if (!validatePublicKey(sponsoredPublicKey)) {
      throw new Error('Invalid sponsored public key');
    }

    return Operation.beginSponsoringFutureReserves({
      sponsoredId: sponsoredPublicKey,
    });
  }

  /**
   * Creates an endSponsoringFutureReserves operation
   * @param sponsoredPublicKey - Public key of the sponsored account (used as source)
   * @returns The Stellar operation
   */
  endSponsoringFutureReserves(sponsoredPublicKey: string): xdr.Operation {
    if (!validatePublicKey(sponsoredPublicKey)) {
      throw new Error('Invalid sponsored public key');
    }

    return Operation.endSponsoringFutureReserves({
      source: sponsoredPublicKey,
    });
  }

  /**
   * Creates a revoke sponsorship operation
   * @param target - Target specification for revocation
   * @returns The Stellar operation
   */
  revokeSponsorship(target: RevokeSponsorshipTarget): xdr.Operation {
    switch (target.entryType) {
      case 'account':
        if (!target.accountPublicKey) {
          throw new Error('Account public key required for account revocation');
        }
        if (!validatePublicKey(target.accountPublicKey)) {
          throw new Error('Invalid account public key');
        }
        return Operation.revokeAccountSponsorship({
          account: target.accountPublicKey,
        });

      case 'trustline':
        if (!target.accountPublicKey || !target.asset) {
          throw new Error('Account and asset required for trustline revocation');
        }
        if (!validatePublicKey(target.accountPublicKey)) {
          throw new Error('Invalid account public key');
        }
        const trustlineAsset = target.asset.issuer
          ? new Asset(target.asset.code, target.asset.issuer)
          : Asset.native();
        return Operation.revokeTrustlineSponsorship({
          account: target.accountPublicKey,
          asset: trustlineAsset,
        });

      case 'offer':
        if (!target.accountPublicKey || !target.offerId) {
          throw new Error('Account and offer ID required for offer revocation');
        }
        if (!validatePublicKey(target.accountPublicKey)) {
          throw new Error('Invalid account public key');
        }
        return Operation.revokeOfferSponsorship({
          seller: target.accountPublicKey,
          offerId: target.offerId,
        });

      case 'data':
        if (!target.accountPublicKey || !target.dataName) {
          throw new Error('Account and data name required for data revocation');
        }
        if (!validatePublicKey(target.accountPublicKey)) {
          throw new Error('Invalid account public key');
        }
        return Operation.revokeDataSponsorship({
          account: target.accountPublicKey,
          name: target.dataName,
        });

      case 'claimable_balance':
        if (!target.balanceId) {
          throw new Error('Balance ID required for claimable balance revocation');
        }
        return Operation.revokeClaimableBalanceSponsorship({
          balanceId: target.balanceId,
        });

      case 'signer':
        if (!target.accountPublicKey || !target.signerKey) {
          throw new Error('Account and signer key required for signer revocation');
        }
        if (!validatePublicKey(target.accountPublicKey)) {
          throw new Error('Invalid account public key');
        }
        return Operation.revokeSignerSponsorship({
          account: target.accountPublicKey,
          signer: {
            ed25519PublicKey: target.signerKey,
          },
        });

      default:
        throw new Error(`Unknown entry type: ${target.entryType}`);
    }
  }

  /**
   * Executes a complete sponsorship transaction
   * @param config - Sponsorship configuration
   * @param sponsorSecret - Sponsor's secret key
   * @param sponsoredSecret - Sponsored account's secret key
   * @param operations - Additional operations to include between begin and end
   * @returns Promise<SponsorshipResult>
   */
  async executeSponsorshipTransaction(
    config: SponsorshipConfig,
    sponsorSecret: string,
    sponsoredSecret: string,
    operations: xdr.Operation[]
  ): Promise<SponsorshipResult> {
    if (!validateSecretKey(sponsorSecret)) {
      throw new Error('Invalid sponsor secret key');
    }
    if (!validateSecretKey(sponsoredSecret)) {
      throw new Error('Invalid sponsored secret key');
    }

    const sponsorKeypair = Keypair.fromSecret(sponsorSecret);
    const sponsoredKeypair = Keypair.fromSecret(sponsoredSecret);

    // Load sponsor account
    const sponsorAccount = await this.server.loadAccount(sponsorKeypair.publicKey());

    // Calculate fee
    const totalOperations = operations.length + 2; // +2 for begin and end
    const fee = await this.estimateFee(totalOperations);

    // Build transaction
    const transactionBuilder = new TransactionBuilder(sponsorAccount, {
      fee,
      networkPassphrase: this.networkConfig.passphrase,
    });

    // Add begin sponsoring operation
    transactionBuilder.addOperation(
      this.beginSponsoringFutureReserves(config.sponsoredPublicKey)
    );

    // Add sponsored operations
    for (const op of operations) {
      transactionBuilder.addOperation(op);
    }

    // Add end sponsoring operation
    transactionBuilder.addOperation(
      this.endSponsoringFutureReserves(config.sponsoredPublicKey)
    );

    transactionBuilder.setTimeout(180);

    const transaction = transactionBuilder.build();

    // Sign with both keypairs
    transaction.sign(sponsorKeypair);
    transaction.sign(sponsoredKeypair);

    // Submit transaction
    const result = await this.submitWithRetry(transaction);

    return {
      hash: result.hash,
      status: result.successful ? 'success' : 'failed',
      ledger: result.ledger.toString(),
      createdAt: new Date(),
      sponsoredEntries: [{ type: config.entryType }],
      feePaid: fee,
    };
  }

  /**
   * Builds an unsigned sponsorship transaction
   * @param config - Sponsorship configuration
   * @param operations - Operations to include
   * @param options - Transaction options
   * @returns Promise<UnsignedTransactionResult>
   */
  async buildUnsignedSponsorshipTransaction(
    config: SponsorshipConfig,
    operations: xdr.Operation[],
    options: UnsignedTransactionOptions = {}
  ): Promise<UnsignedTransactionResult> {
    if (!validatePublicKey(config.sponsorPublicKey)) {
      throw new Error('Invalid sponsor public key');
    }

    // Load sponsor account
    const sponsorAccount = await this.server.loadAccount(config.sponsorPublicKey);

    // Calculate fee
    const totalOperations = operations.length + 2;
    const fee = options.fee || (await this.estimateFee(totalOperations));

    // Build transaction
    const transactionBuilder = new TransactionBuilder(sponsorAccount, {
      fee,
      networkPassphrase: this.networkConfig.passphrase,
    });

    // Add begin sponsoring operation
    transactionBuilder.addOperation(
      this.beginSponsoringFutureReserves(config.sponsoredPublicKey)
    );

    // Add sponsored operations
    for (const op of operations) {
      transactionBuilder.addOperation(op);
    }

    // Add end sponsoring operation
    transactionBuilder.addOperation(
      this.endSponsoringFutureReserves(config.sponsoredPublicKey)
    );

    // Add memo if provided
    if (options.memo) {
      transactionBuilder.addMemo(Memo.text(options.memo));
    }

    transactionBuilder.setTimeout(options.timeout || 180);

    const transaction = transactionBuilder.build();

    return {
      xdr: transaction.toXDR(),
      networkPassphrase: this.networkConfig.passphrase,
      requiredSigners: [config.sponsorPublicKey, config.sponsoredPublicKey],
      estimatedFee: fee,
    };
  }

  /**
   * Signs and submits a sponsorship transaction from XDR
   * @param transactionXdr - Transaction XDR
   * @param signerSecrets - Array of secret keys for signing
   * @returns Promise<SponsorshipResult>
   */
  async signAndSubmitSponsorshipTransaction(
    transactionXdr: string,
    signerSecrets: string[]
  ): Promise<SponsorshipResult> {
    const transaction = TransactionBuilder.fromXDR(
      transactionXdr,
      this.networkConfig.passphrase
    );

    // Sign with all provided keys
    for (const secret of signerSecrets) {
      if (!validateSecretKey(secret)) {
        throw new Error('Invalid secret key provided');
      }
      const keypair = Keypair.fromSecret(secret);
      transaction.sign(keypair);
    }

    // Submit transaction
    const result = await this.submitWithRetry(transaction);

    return {
      hash: result.hash,
      status: result.successful ? 'success' : 'failed',
      ledger: result.ledger.toString(),
      createdAt: new Date(),
      sponsoredEntries: [],
      feePaid: transaction.fee.toString(),
    };
  }

  /**
   * Gets entries sponsored FOR an account (entries where this account has sponsored reserves)
   * @param accountPublicKey - Account public key
   * @param options - Query options
   * @returns Promise<SponsoredEntry[]>
   */
  async getSponsoredEntries(
    accountPublicKey: string,
    options: SponsoredEntriesQueryOptions = {}
  ): Promise<SponsoredEntry[]> {
    if (!validatePublicKey(accountPublicKey)) {
      throw new Error('Invalid account public key');
    }

    const entries: SponsoredEntry[] = [];

    try {
      const account = await this.server.loadAccount(accountPublicKey);

      // Check for sponsored account
      if (account.sponsor) {
        if (!options.entryType || options.entryType === 'account') {
          entries.push({
            entryType: 'account',
            sponsor: account.sponsor,
            sponsoredAccount: accountPublicKey,
            entryId: accountPublicKey,
            details: { type: 'account' },
          });
        }
      }

      // Check trustlines for sponsorship
      if (!options.entryType || options.entryType === 'trustline') {
        for (const balance of account.balances) {
          if ('sponsor' in balance && (balance as any).sponsor) {
            const balanceAny = balance as any;
            const isNative = balanceAny.asset_type === 'native';
            const assetInfo = isNative
              ? { code: 'XLM' }
              : { code: balanceAny.asset_code, issuer: balanceAny.asset_issuer };

            entries.push({
              entryType: 'trustline',
              sponsor: balanceAny.sponsor as string,
              sponsoredAccount: accountPublicKey,
              entryId: `${accountPublicKey}:${assetInfo.code}:${assetInfo.issuer || 'native'}`,
              details: { asset: assetInfo },
            });
          }
        }
      }

      // Check data entries for sponsorship
      // Note: Data entry sponsorship info requires querying effects/operations
      // This is a placeholder for future implementation
      if (!options.entryType || options.entryType === 'data') {
        // Data entries with sponsors would need to be checked via effects/operations
        // Full implementation would iterate through account data and check sponsorship
      }

      // Check signers for sponsorship
      if (!options.entryType || options.entryType === 'signer') {
        for (const signer of account.signers) {
          const signerAny = signer as any;
          if ('sponsor' in signer && signerAny.sponsor) {
            entries.push({
              entryType: 'signer',
              sponsor: signerAny.sponsor as string,
              sponsoredAccount: accountPublicKey,
              entryId: `${accountPublicKey}:${signer.key}`,
              details: { signerKey: signer.key, weight: signer.weight },
            });
          }
        }
      }

      // Apply limit
      if (options.limit && entries.length > options.limit) {
        return entries.slice(0, options.limit);
      }

      return entries;
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return [];
      }
      throw new Error(
        `Failed to get sponsored entries: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Gets entries sponsored BY an account (entries this account is sponsoring)
   * @param sponsorPublicKey - Sponsor's public key
   * @param options - Query options
   * @returns Promise<SponsoredEntry[]>
   */
  async getEntriesSponsoredBy(
    sponsorPublicKey: string,
    _options: SponsoredEntriesQueryOptions = {}
  ): Promise<SponsoredEntry[]> {
    if (!validatePublicKey(sponsorPublicKey)) {
      throw new Error('Invalid sponsor public key');
    }

    // This requires querying accounts and checking their sponsors
    // A full implementation would use Horizon's effects or a dedicated API
    // For now, return empty array - would need indexer support for full implementation
    const entries: SponsoredEntry[] = [];

    // Note: Stellar Horizon doesn't provide a direct API to query entries sponsored BY an account
    // This would require either:
    // 1. An indexer that tracks sponsorship relationships
    // 2. Querying all accounts and filtering (not practical)
    // 3. Tracking sponsorship events from the transaction history
    // The _options parameter is reserved for future use with an indexer

    return entries;
  }

  /**
   * Checks if a sponsor is eligible for a sponsorship operation
   * @param sponsorPublicKey - Sponsor's public key
   * @param config - Sponsorship configuration or cost breakdown
   * @returns Promise<SponsorshipEligibility>
   */
  async checkSponsorshipEligibility(
    sponsorPublicKey: string,
    config: SponsorshipConfig | SponsorshipCost
  ): Promise<SponsorshipEligibility> {
    if (!validatePublicKey(sponsorPublicKey)) {
      throw new Error('Invalid sponsor public key');
    }

    try {
      const account = await this.server.loadAccount(sponsorPublicKey);

      // Find XLM balance
      const xlmBalance = account.balances.find(
        (b: any) => b.asset_type === 'native'
      );

      if (!xlmBalance) {
        return {
          eligible: false,
          currentBalance: '0',
          requiredBalance: '0',
          reason: 'Account has no XLM balance',
        };
      }

      const currentBalance = xlmBalance.balance;

      // Calculate required balance
      let requiredBalance: string;
      if ('totalCost' in config) {
        // SponsorshipCost
        requiredBalance = (
          parseFloat(config.totalCost) +
          parseFloat(config.transactionFee) +
          1 // Buffer
        ).toFixed(7);
      } else {
        // SponsorshipConfig
        requiredBalance = (
          parseFloat(calculateEntryReserve(config.entryType, 1)) +
          0.001 + // Estimated fee
          1 // Buffer
        ).toFixed(7);
      }

      const validation = validateSponsorBalance(currentBalance, requiredBalance, '0');

      if (validation.valid) {
        return {
          eligible: true,
          currentBalance,
          requiredBalance,
        };
      } else {
        return {
          eligible: false,
          currentBalance,
          requiredBalance,
          shortfall: validation.shortfall,
          reason: validation.message,
        };
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        return {
          eligible: false,
          currentBalance: '0',
          requiredBalance: '0',
          reason: 'Sponsor account not found or not funded',
        };
      }
      throw new Error(
        `Failed to check eligibility: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Calculates the cost of a sponsorship configuration
   * @param config - Sponsorship configuration
   * @returns SponsorshipCost
   */
  calculateSponsorshipCost(config: SponsorshipConfig): SponsorshipCost {
    return getDetailedBreakdown([{ type: config.entryType, count: 1 }]);
  }

  /**
   * Calculates the cost for multiple entries
   * @param entryTypes - Array of entry types with counts
   * @returns SponsorshipCost
   */
  calculateMultipleSponsorshipCost(
    entryTypes: Array<{ type: string; count: number }>
  ): SponsorshipCost {
    return getDetailedBreakdown(
      entryTypes.map(e => ({
        type: e.type as any,
        count: e.count,
      }))
    );
  }

  /**
   * Converts a ClaimPredicate to Stellar SDK format
   * @param predicate - Claim predicate
   * @returns Stellar SDK claimant predicate
   */
  buildClaimPredicate(predicate: ClaimPredicate): xdr.ClaimPredicate {
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
  buildStellarClaimant(claimant: Claimant): StellarClaimant {
    return new StellarClaimant(
      claimant.destination,
      this.buildClaimPredicate(claimant.predicate)
    );
  }

  /**
   * Gets the current network configuration
   * @returns NetworkConfig
   */
  getNetworkConfig(): NetworkConfig {
    return this.networkConfig;
  }

  /**
   * Switches to a different network
   * @param networkConfig - New network configuration
   */
  switchNetwork(networkConfig: NetworkConfig): void {
    this.networkConfig = networkConfig;
    this.server = new Horizon.Server(networkConfig.horizonUrl);
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
      return (parseInt(BASE_FEE, 10) * operationCount).toString();
    }
  }

  /**
   * Submits transaction with retry logic
   * @param transaction - Transaction to submit
   * @param maxRetries - Maximum retry attempts
   * @returns Transaction result
   */
  private async submitWithRetry(
    transaction: any,
    maxRetries: number = 3
  ): Promise<any> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await this.server.submitTransaction(transaction);
      } catch (error) {
        const isRetryable = this.isRetryableError(error);
        if (i === maxRetries - 1 || !isRetryable) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }

  /**
   * Checks if an error is retryable
   * @param error - Error to check
   * @returns true if retryable
   */
  private isRetryableError(error: any): boolean {
    if (!error) return false;
    const message = error.message || '';
    return (
      message.includes('timeout') ||
      message.includes('ECONNRESET') ||
      message.includes('ETIMEDOUT') ||
      error.response?.status >= 500
    );
  }
}
