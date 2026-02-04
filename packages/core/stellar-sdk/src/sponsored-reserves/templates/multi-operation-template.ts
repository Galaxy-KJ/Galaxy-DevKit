/**
 * @fileoverview Template for multi-operation sponsored transactions
 * @description Provides flexible templates for complex sponsored operations
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
  xdr,
} from '@stellar/stellar-sdk';
import { NetworkConfig } from '../../types/stellar-types.js';
import {
  MultiOperationSponsorshipConfig,
  SponsoredOperation,
  SponsorshipResult,
  SponsorshipCost,
} from '../types/sponsored-reserves-types.js';
import {
  validatePublicKey,
  validateSecretKey,
  validateAssetCode,
} from '../utils/sponsorship-validation.js';
import { calculateMultiOperationCost } from '../utils/cost-calculator.js';

/**
 * Template class for multi-operation sponsored transactions
 * @class MultiOperationTemplate
 */
export class MultiOperationTemplate {
  private server: Horizon.Server;
  private networkConfig: NetworkConfig;

  /**
   * Creates a new MultiOperationTemplate instance
   * @param networkConfig - Network configuration
   */
  constructor(networkConfig: NetworkConfig) {
    this.networkConfig = networkConfig;
    this.server = new Horizon.Server(networkConfig.horizonUrl);
  }

  /**
   * Calculates the cost of a multi-operation sponsorship
   * @param config - Multi-operation configuration
   * @returns SponsorshipCost breakdown
   */
  calculateCost(config: MultiOperationSponsorshipConfig): SponsorshipCost {
    return calculateMultiOperationCost(config);
  }

  /**
   * Converts a SponsoredOperation to Stellar SDK operation
   * @param op - Sponsored operation config
   * @param sourcePublicKey - Source public key for the operation
   * @returns Stellar SDK operation
   */
  private buildOperation(op: SponsoredOperation, sourcePublicKey: string): xdr.Operation {
    switch (op.type) {
      case 'createAccount':
        return Operation.createAccount({
          destination: op.params.destination as string,
          startingBalance: (op.params.startingBalance as string) || '0',
        });

      case 'changeTrust':
        const assetCode = op.params.assetCode as string;
        const assetIssuer = op.params.assetIssuer as string;
        const limit = op.params.limit as string | undefined;

        if (!validateAssetCode(assetCode)) {
          throw new Error(`Invalid asset code: ${assetCode}`);
        }
        if (!validatePublicKey(assetIssuer)) {
          throw new Error(`Invalid asset issuer: ${assetIssuer}`);
        }

        return Operation.changeTrust({
          asset: new Asset(assetCode, assetIssuer),
          limit: limit || '922337203685.4775807',
          source: sourcePublicKey,
        });

      case 'manageData':
        return Operation.manageData({
          name: op.params.name as string,
          value: op.params.value as string,
          source: sourcePublicKey,
        });

      case 'setOptions':
        const setOptionsParams: any = { source: sourcePublicKey };

        if (op.params.homeDomain !== undefined) {
          setOptionsParams.homeDomain = op.params.homeDomain;
        }
        if (op.params.inflationDest !== undefined) {
          setOptionsParams.inflationDest = op.params.inflationDest;
        }
        if (op.params.clearFlags !== undefined) {
          setOptionsParams.clearFlags = op.params.clearFlags;
        }
        if (op.params.setFlags !== undefined) {
          setOptionsParams.setFlags = op.params.setFlags;
        }
        if (op.params.masterWeight !== undefined) {
          setOptionsParams.masterWeight = op.params.masterWeight;
        }
        if (op.params.lowThreshold !== undefined) {
          setOptionsParams.lowThreshold = op.params.lowThreshold;
        }
        if (op.params.medThreshold !== undefined) {
          setOptionsParams.medThreshold = op.params.medThreshold;
        }
        if (op.params.highThreshold !== undefined) {
          setOptionsParams.highThreshold = op.params.highThreshold;
        }
        if (op.params.signer !== undefined) {
          setOptionsParams.signer = op.params.signer;
        }

        return Operation.setOptions(setOptionsParams);

      default:
        throw new Error(`Unsupported operation type: ${op.type}`);
    }
  }

  /**
   * Builds all operations for multi-operation sponsorship
   * @param config - Multi-operation configuration
   * @returns Array of operations
   */
  buildOperations(config: MultiOperationSponsorshipConfig): xdr.Operation[] {
    if (!validatePublicKey(config.sponsorPublicKey)) {
      throw new Error('Invalid sponsor public key');
    }
    if (!validatePublicKey(config.sponsoredPublicKey)) {
      throw new Error('Invalid sponsored public key');
    }

    const operations: xdr.Operation[] = [];

    // Begin sponsoring
    operations.push(
      Operation.beginSponsoringFutureReserves({
        sponsoredId: config.sponsoredPublicKey,
      })
    );

    // Add all sponsored operations
    for (const op of config.operations) {
      operations.push(this.buildOperation(op, config.sponsoredPublicKey));
    }

    // End sponsoring
    operations.push(
      Operation.endSponsoringFutureReserves({
        source: config.sponsoredPublicKey,
      })
    );

    return operations;
  }

  /**
   * Executes a multi-operation sponsored transaction
   * @param config - Multi-operation configuration
   * @param sponsorSecret - Sponsor's secret key
   * @param sponsoredSecret - Sponsored account's secret key
   * @returns Promise<SponsorshipResult>
   */
  async executeMultiOperation(
    config: MultiOperationSponsorshipConfig,
    sponsorSecret: string,
    sponsoredSecret: string
  ): Promise<SponsorshipResult> {
    if (!validateSecretKey(sponsorSecret)) {
      throw new Error('Invalid sponsor secret key');
    }
    if (!validateSecretKey(sponsoredSecret)) {
      throw new Error('Invalid sponsored secret key');
    }

    const sponsorKeypair = Keypair.fromSecret(sponsorSecret);
    const sponsoredKeypair = Keypair.fromSecret(sponsoredSecret);

    // Validate keys match config
    if (sponsorKeypair.publicKey() !== config.sponsorPublicKey) {
      throw new Error('Sponsor secret key does not match sponsor public key');
    }
    if (sponsoredKeypair.publicKey() !== config.sponsoredPublicKey) {
      throw new Error('Sponsored secret key does not match sponsored public key');
    }

    // Load sponsor account
    const sponsorAccount = await this.server.loadAccount(sponsorKeypair.publicKey());

    // Calculate operation count
    const operationCount = config.operations.length + 2; // +2 for begin/end

    // Build transaction
    const builder = new TransactionBuilder(sponsorAccount, {
      fee: await this.estimateFee(operationCount),
      networkPassphrase: this.networkConfig.passphrase,
    });

    // Add all operations
    const operations = this.buildOperations(config);
    for (const op of operations) {
      builder.addOperation(op);
    }

    // Add memo if specified
    if (config.memo) {
      builder.addMemo(Memo.text(config.memo));
    }

    const transaction = builder.setTimeout(180).build();

    // Sign with both keypairs
    transaction.sign(sponsorKeypair);
    transaction.sign(sponsoredKeypair);

    // Submit transaction
    const result = await this.server.submitTransaction(transaction);

    // Build sponsored entries list
    const sponsoredEntries = config.operations.map(op => {
      switch (op.type) {
        case 'createAccount':
          return { type: 'account' as const, id: op.params.destination as string };
        case 'changeTrust':
          return {
            type: 'trustline' as const,
            id: `${config.sponsoredPublicKey}:${op.params.assetCode}:${op.params.assetIssuer}`,
          };
        case 'manageData':
          return {
            type: 'data' as const,
            id: `${config.sponsoredPublicKey}:${op.params.name}`,
          };
        case 'setOptions':
          if (op.params.signer) {
            return { type: 'signer' as const };
          }
          return { type: 'account' as const };
        default:
          return { type: 'account' as const };
      }
    });

    return {
      hash: result.hash,
      status: result.successful ? 'success' : 'failed',
      ledger: result.ledger.toString(),
      createdAt: new Date(),
      sponsoredEntries,
      feePaid: transaction.fee.toString(),
    };
  }

  /**
   * Builds an unsigned transaction for multi-operation sponsorship
   * @param config - Multi-operation configuration
   * @returns Promise with transaction XDR and required signers
   */
  async buildUnsignedTransaction(
    config: MultiOperationSponsorshipConfig
  ): Promise<{ xdr: string; requiredSigners: string[]; cost: SponsorshipCost }> {
    if (!validatePublicKey(config.sponsorPublicKey)) {
      throw new Error('Invalid sponsor public key');
    }
    if (!validatePublicKey(config.sponsoredPublicKey)) {
      throw new Error('Invalid sponsored public key');
    }

    const sponsorAccount = await this.server.loadAccount(config.sponsorPublicKey);

    const operationCount = config.operations.length + 2;

    const builder = new TransactionBuilder(sponsorAccount, {
      fee: await this.estimateFee(operationCount),
      networkPassphrase: this.networkConfig.passphrase,
    });

    const operations = this.buildOperations(config);
    for (const op of operations) {
      builder.addOperation(op);
    }

    if (config.memo) {
      builder.addMemo(Memo.text(config.memo));
    }

    const transaction = builder.setTimeout(180).build();

    return {
      xdr: transaction.toXDR(),
      requiredSigners: [config.sponsorPublicKey, config.sponsoredPublicKey],
      cost: this.calculateCost(config),
    };
  }

  /**
   * Executes a batch of sponsored operations across multiple accounts
   * @param sponsorSecret - Sponsor's secret key
   * @param batchOperations - Array of operations for different accounts
   * @returns Promise<SponsorshipResult[]>
   */
  async executeBatch(
    sponsorSecret: string,
    batchOperations: Array<{
      sponsoredPublicKey: string;
      sponsoredSecret: string;
      operations: SponsoredOperation[];
    }>
  ): Promise<SponsorshipResult[]> {
    const results: SponsorshipResult[] = [];

    for (const batch of batchOperations) {
      const config: MultiOperationSponsorshipConfig = {
        sponsorPublicKey: Keypair.fromSecret(sponsorSecret).publicKey(),
        sponsoredPublicKey: batch.sponsoredPublicKey,
        operations: batch.operations,
      };

      const result = await this.executeMultiOperation(
        config,
        sponsorSecret,
        batch.sponsoredSecret
      );

      results.push(result);
    }

    return results;
  }

  /**
   * Creates a config for adding multiple trustlines to an account
   * @param sponsorPublicKey - Sponsor's public key
   * @param sponsoredPublicKey - Sponsored account's public key
   * @param assets - Array of assets to trust
   * @returns MultiOperationSponsorshipConfig
   */
  static createTrustlinesConfig(
    sponsorPublicKey: string,
    sponsoredPublicKey: string,
    assets: Array<{ assetCode: string; assetIssuer: string; limit?: string }>
  ): MultiOperationSponsorshipConfig {
    return {
      sponsorPublicKey,
      sponsoredPublicKey,
      operations: assets.map(asset => ({
        type: 'changeTrust' as const,
        params: {
          assetCode: asset.assetCode,
          assetIssuer: asset.assetIssuer,
          limit: asset.limit,
        },
      })),
    };
  }

  /**
   * Creates a config for setting up account data entries
   * @param sponsorPublicKey - Sponsor's public key
   * @param sponsoredPublicKey - Sponsored account's public key
   * @param dataEntries - Array of data entries
   * @returns MultiOperationSponsorshipConfig
   */
  static createDataEntriesConfig(
    sponsorPublicKey: string,
    sponsoredPublicKey: string,
    dataEntries: Array<{ name: string; value: string }>
  ): MultiOperationSponsorshipConfig {
    return {
      sponsorPublicKey,
      sponsoredPublicKey,
      operations: dataEntries.map(entry => ({
        type: 'manageData' as const,
        params: {
          name: entry.name,
          value: entry.value,
        },
      })),
    };
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
