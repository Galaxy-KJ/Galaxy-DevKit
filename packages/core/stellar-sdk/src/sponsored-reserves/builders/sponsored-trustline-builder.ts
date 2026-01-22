/**
 * @fileoverview Builder for sponsored trustline operations
 * @description Handles building operations for sponsored trustline creation
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
} from '@stellar/stellar-sdk';
import { NetworkConfig } from '../../types/stellar-types';
import { SponsorshipResult, TrustlineEntryConfig } from '../types/sponsored-reserves-types';
import {
  validatePublicKey,
  validateSecretKey,
  validateAssetCode,
  validateAmount,
} from '../utils/sponsorship-validation';

/**
 * Builder class for sponsored trustline operations
 * @class SponsoredTrustlineBuilder
 */
export class SponsoredTrustlineBuilder {
  private server: Horizon.Server;
  private networkConfig: NetworkConfig;

  /**
   * Creates a new SponsoredTrustlineBuilder instance
   * @param networkConfig - Network configuration
   */
  constructor(networkConfig: NetworkConfig) {
    this.networkConfig = networkConfig;
    this.server = new Horizon.Server(networkConfig.horizonUrl);
  }

  /**
   * Builds operations for a sponsored trustline
   * @param sponsorPublicKey - Sponsor's public key
   * @param trustorPublicKey - Account receiving the trustline
   * @param assetCode - Asset code
   * @param assetIssuer - Asset issuer public key
   * @param limit - Trust limit (optional, defaults to max)
   * @returns Array of operations
   */
  buildSponsoredTrustline(
    sponsorPublicKey: string,
    trustorPublicKey: string,
    assetCode: string,
    assetIssuer: string,
    limit?: string
  ): xdr.Operation[] {
    if (!validatePublicKey(sponsorPublicKey)) {
      throw new Error('Invalid sponsor public key');
    }
    if (!validatePublicKey(trustorPublicKey)) {
      throw new Error('Invalid trustor public key');
    }
    if (!validateAssetCode(assetCode)) {
      throw new Error('Invalid asset code');
    }
    if (!validatePublicKey(assetIssuer)) {
      throw new Error('Invalid asset issuer public key');
    }
    if (limit && !validateAmount(limit, true)) {
      throw new Error('Invalid trust limit');
    }

    const asset = new Asset(assetCode, assetIssuer);
    const operations: xdr.Operation[] = [];

    // Begin sponsoring
    operations.push(
      Operation.beginSponsoringFutureReserves({
        sponsoredId: trustorPublicKey,
      })
    );

    // Change trust operation (source must be the trustor)
    operations.push(
      Operation.changeTrust({
        asset: asset,
        limit: limit || '922337203685.4775807', // Max limit
        source: trustorPublicKey,
      })
    );

    // End sponsoring (source must be the trustor)
    operations.push(
      Operation.endSponsoringFutureReserves({
        source: trustorPublicKey,
      })
    );

    return operations;
  }

  /**
   * Builds operations for multiple sponsored trustlines
   * @param sponsorPublicKey - Sponsor's public key
   * @param trustorPublicKey - Account receiving the trustlines
   * @param assets - Array of assets to trust
   * @returns Array of operations
   */
  buildMultipleSponsoredTrustlines(
    sponsorPublicKey: string,
    trustorPublicKey: string,
    assets: Array<{ assetCode: string; assetIssuer: string; limit?: string }>
  ): xdr.Operation[] {
    if (!validatePublicKey(sponsorPublicKey)) {
      throw new Error('Invalid sponsor public key');
    }
    if (!validatePublicKey(trustorPublicKey)) {
      throw new Error('Invalid trustor public key');
    }
    if (!assets || assets.length === 0) {
      throw new Error('At least one asset is required');
    }

    const operations: xdr.Operation[] = [];

    // Begin sponsoring once for all trustlines
    operations.push(
      Operation.beginSponsoringFutureReserves({
        sponsoredId: trustorPublicKey,
      })
    );

    // Add change trust operations for each asset
    for (const assetConfig of assets) {
      if (!validateAssetCode(assetConfig.assetCode)) {
        throw new Error(`Invalid asset code: ${assetConfig.assetCode}`);
      }
      if (!validatePublicKey(assetConfig.assetIssuer)) {
        throw new Error(`Invalid asset issuer: ${assetConfig.assetIssuer}`);
      }

      const asset = new Asset(assetConfig.assetCode, assetConfig.assetIssuer);

      operations.push(
        Operation.changeTrust({
          asset: asset,
          limit: assetConfig.limit || '922337203685.4775807',
          source: trustorPublicKey,
        })
      );
    }

    // End sponsoring
    operations.push(
      Operation.endSponsoringFutureReserves({
        source: trustorPublicKey,
      })
    );

    return operations;
  }

  /**
   * Creates a sponsored trustline with full transaction execution
   * @param sponsorSecret - Sponsor's secret key
   * @param trustorSecret - Trustor's secret key
   * @param assetCode - Asset code
   * @param assetIssuer - Asset issuer
   * @param limit - Trust limit
   * @returns Promise<SponsorshipResult>
   */
  async createSponsoredTrustline(
    sponsorSecret: string,
    trustorSecret: string,
    assetCode: string,
    assetIssuer: string,
    limit?: string
  ): Promise<SponsorshipResult> {
    if (!validateSecretKey(sponsorSecret)) {
      throw new Error('Invalid sponsor secret key');
    }
    if (!validateSecretKey(trustorSecret)) {
      throw new Error('Invalid trustor secret key');
    }

    const sponsorKeypair = Keypair.fromSecret(sponsorSecret);
    const trustorKeypair = Keypair.fromSecret(trustorSecret);

    const asset = new Asset(assetCode, assetIssuer);

    // Load sponsor account
    const sponsorAccount = await this.server.loadAccount(sponsorKeypair.publicKey());

    // Build transaction
    const transaction = new TransactionBuilder(sponsorAccount, {
      fee: await this.estimateFee(3),
      networkPassphrase: this.networkConfig.passphrase,
    })
      .addOperation(
        Operation.beginSponsoringFutureReserves({
          sponsoredId: trustorKeypair.publicKey(),
        })
      )
      .addOperation(
        Operation.changeTrust({
          asset: asset,
          limit: limit || '922337203685.4775807',
          source: trustorKeypair.publicKey(),
        })
      )
      .addOperation(
        Operation.endSponsoringFutureReserves({
          source: trustorKeypair.publicKey(),
        })
      )
      .setTimeout(180)
      .build();

    // Sign with both keypairs
    transaction.sign(sponsorKeypair);
    transaction.sign(trustorKeypair);

    // Submit transaction
    const result = await this.server.submitTransaction(transaction);

    return {
      hash: result.hash,
      status: result.successful ? 'success' : 'failed',
      ledger: result.ledger.toString(),
      createdAt: new Date(),
      sponsoredEntries: [
        {
          type: 'trustline',
          id: `${trustorKeypair.publicKey()}:${assetCode}:${assetIssuer}`,
        },
      ],
      feePaid: transaction.fee.toString(),
    };
  }

  /**
   * Creates multiple sponsored trustlines in a single transaction
   * @param sponsorSecret - Sponsor's secret key
   * @param trustorSecret - Trustor's secret key
   * @param assets - Array of assets to trust
   * @returns Promise<SponsorshipResult>
   */
  async createMultipleSponsoredTrustlines(
    sponsorSecret: string,
    trustorSecret: string,
    assets: Array<{ assetCode: string; assetIssuer: string; limit?: string }>
  ): Promise<SponsorshipResult> {
    if (!validateSecretKey(sponsorSecret)) {
      throw new Error('Invalid sponsor secret key');
    }
    if (!validateSecretKey(trustorSecret)) {
      throw new Error('Invalid trustor secret key');
    }

    const sponsorKeypair = Keypair.fromSecret(sponsorSecret);
    const trustorKeypair = Keypair.fromSecret(trustorSecret);

    // Load sponsor account
    const sponsorAccount = await this.server.loadAccount(sponsorKeypair.publicKey());

    // Build transaction
    const builder = new TransactionBuilder(sponsorAccount, {
      fee: await this.estimateFee(assets.length + 2),
      networkPassphrase: this.networkConfig.passphrase,
    });

    // Begin sponsoring
    builder.addOperation(
      Operation.beginSponsoringFutureReserves({
        sponsoredId: trustorKeypair.publicKey(),
      })
    );

    // Add all trustlines
    for (const assetConfig of assets) {
      const asset = new Asset(assetConfig.assetCode, assetConfig.assetIssuer);
      builder.addOperation(
        Operation.changeTrust({
          asset: asset,
          limit: assetConfig.limit || '922337203685.4775807',
          source: trustorKeypair.publicKey(),
        })
      );
    }

    // End sponsoring
    builder.addOperation(
      Operation.endSponsoringFutureReserves({
        source: trustorKeypair.publicKey(),
      })
    );

    const transaction = builder.setTimeout(180).build();

    // Sign with both keypairs
    transaction.sign(sponsorKeypair);
    transaction.sign(trustorKeypair);

    // Submit transaction
    const result = await this.server.submitTransaction(transaction);

    return {
      hash: result.hash,
      status: result.successful ? 'success' : 'failed',
      ledger: result.ledger.toString(),
      createdAt: new Date(),
      sponsoredEntries: assets.map(a => ({
        type: 'trustline' as const,
        id: `${trustorKeypair.publicKey()}:${a.assetCode}:${a.assetIssuer}`,
      })),
      feePaid: transaction.fee.toString(),
    };
  }

  /**
   * Builds an unsigned transaction for sponsored trustline
   * @param sponsorPublicKey - Sponsor's public key
   * @param trustorPublicKey - Trustor's public key
   * @param assetCode - Asset code
   * @param assetIssuer - Asset issuer
   * @param limit - Trust limit
   * @returns Promise with transaction XDR and required signers
   */
  async buildUnsignedTransaction(
    sponsorPublicKey: string,
    trustorPublicKey: string,
    assetCode: string,
    assetIssuer: string,
    limit?: string
  ): Promise<{ xdr: string; requiredSigners: string[] }> {
    if (!validatePublicKey(sponsorPublicKey)) {
      throw new Error('Invalid sponsor public key');
    }
    if (!validatePublicKey(trustorPublicKey)) {
      throw new Error('Invalid trustor public key');
    }

    const asset = new Asset(assetCode, assetIssuer);
    const sponsorAccount = await this.server.loadAccount(sponsorPublicKey);

    const transaction = new TransactionBuilder(sponsorAccount, {
      fee: await this.estimateFee(3),
      networkPassphrase: this.networkConfig.passphrase,
    })
      .addOperation(
        Operation.beginSponsoringFutureReserves({
          sponsoredId: trustorPublicKey,
        })
      )
      .addOperation(
        Operation.changeTrust({
          asset: asset,
          limit: limit || '922337203685.4775807',
          source: trustorPublicKey,
        })
      )
      .addOperation(
        Operation.endSponsoringFutureReserves({
          source: trustorPublicKey,
        })
      )
      .setTimeout(180)
      .build();

    return {
      xdr: transaction.toXDR(),
      requiredSigners: [sponsorPublicKey, trustorPublicKey],
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
