/**
 * @fileoverview Builder for sponsored signer operations
 * @description Handles building operations for sponsored signer creation
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import {
  Keypair,
  Operation,
  TransactionBuilder,
  Horizon,
  StrKey,
  xdr,
} from '@stellar/stellar-sdk';
import { NetworkConfig } from '../../types/stellar-types';
import { SponsorshipResult, SignerEntryConfig } from '../types/sponsored-reserves-types';
import {
  validatePublicKey,
  validateSecretKey,
  validateSignerWeight,
  validatePreAuthTxHash,
  validateSha256Hash,
} from '../utils/sponsorship-validation';

/**
 * Builder class for sponsored signer operations
 * @class SponsoredSignerBuilder
 */
export class SponsoredSignerBuilder {
  private server: Horizon.Server;
  private networkConfig: NetworkConfig;

  /**
   * Creates a new SponsoredSignerBuilder instance
   * @param networkConfig - Network configuration
   */
  constructor(networkConfig: NetworkConfig) {
    this.networkConfig = networkConfig;
    this.server = new Horizon.Server(networkConfig.horizonUrl);
  }

  /**
   * Builds the signer key object based on signer type
   * @param signerKey - The signer key
   * @param signerType - Type of signer
   * @returns Signer key object for Stellar SDK
   */
  private buildSignerKey(
    signerKey: string,
    signerType: 'ed25519PublicKey' | 'preAuthTx' | 'sha256Hash'
  ): { ed25519PublicKey: string } | { preAuthTx: string } | { sha256Hash: string } {
    switch (signerType) {
      case 'ed25519PublicKey':
        if (!validatePublicKey(signerKey)) {
          throw new Error('Invalid ed25519 public key for signer');
        }
        return { ed25519PublicKey: signerKey };

      case 'preAuthTx':
        if (!validatePreAuthTxHash(signerKey)) {
          throw new Error('Invalid pre-auth transaction hash for signer');
        }
        return { preAuthTx: signerKey };

      case 'sha256Hash':
        if (!validateSha256Hash(signerKey)) {
          throw new Error('Invalid SHA256 hash for signer');
        }
        return { sha256Hash: signerKey };

      default:
        throw new Error(`Unknown signer type: ${signerType}`);
    }
  }

  /**
   * Builds operations for a sponsored signer
   * @param sponsorPublicKey - Sponsor's public key
   * @param accountPublicKey - Account receiving the signer
   * @param signerKey - The signer key
   * @param signerType - Type of signer
   * @param weight - Signer weight (0-255)
   * @returns Array of operations
   */
  buildSponsoredSigner(
    sponsorPublicKey: string,
    accountPublicKey: string,
    signerKey: string,
    signerType: 'ed25519PublicKey' | 'preAuthTx' | 'sha256Hash' = 'ed25519PublicKey',
    weight: number = 1
  ): xdr.Operation[] {
    if (!validatePublicKey(sponsorPublicKey)) {
      throw new Error('Invalid sponsor public key');
    }
    if (!validatePublicKey(accountPublicKey)) {
      throw new Error('Invalid account public key');
    }
    if (!validateSignerWeight(weight)) {
      throw new Error('Invalid signer weight (must be 0-255)');
    }

    const signerKeyObj = this.buildSignerKey(signerKey, signerType);
    const operations: xdr.Operation[] = [];

    // Begin sponsoring
    operations.push(
      Operation.beginSponsoringFutureReserves({
        sponsoredId: accountPublicKey,
      })
    );

    // Set options to add signer (source must be the account)
    operations.push(
      Operation.setOptions({
        signer: {
          ...signerKeyObj,
          weight: weight,
        },
        source: accountPublicKey,
      })
    );

    // End sponsoring
    operations.push(
      Operation.endSponsoringFutureReserves({
        source: accountPublicKey,
      })
    );

    return operations;
  }

  /**
   * Creates a sponsored signer with full transaction execution
   * @param sponsorSecret - Sponsor's secret key
   * @param accountSecret - Account's secret key
   * @param signerKey - The signer key to add
   * @param signerType - Type of signer
   * @param weight - Signer weight
   * @returns Promise<SponsorshipResult>
   */
  async createSponsoredSigner(
    sponsorSecret: string,
    accountSecret: string,
    signerKey: string,
    signerType: 'ed25519PublicKey' | 'preAuthTx' | 'sha256Hash' = 'ed25519PublicKey',
    weight: number = 1
  ): Promise<SponsorshipResult> {
    if (!validateSecretKey(sponsorSecret)) {
      throw new Error('Invalid sponsor secret key');
    }
    if (!validateSecretKey(accountSecret)) {
      throw new Error('Invalid account secret key');
    }

    const sponsorKeypair = Keypair.fromSecret(sponsorSecret);
    const accountKeypair = Keypair.fromSecret(accountSecret);
    const signerKeyObj = this.buildSignerKey(signerKey, signerType);

    // Load sponsor account
    const sponsorAccount = await this.server.loadAccount(sponsorKeypair.publicKey());

    // Build transaction
    const transaction = new TransactionBuilder(sponsorAccount, {
      fee: await this.estimateFee(3),
      networkPassphrase: this.networkConfig.passphrase,
    })
      .addOperation(
        Operation.beginSponsoringFutureReserves({
          sponsoredId: accountKeypair.publicKey(),
        })
      )
      .addOperation(
        Operation.setOptions({
          signer: {
            ...signerKeyObj,
            weight: weight,
          },
          source: accountKeypair.publicKey(),
        })
      )
      .addOperation(
        Operation.endSponsoringFutureReserves({
          source: accountKeypair.publicKey(),
        })
      )
      .setTimeout(180)
      .build();

    // Sign with both keypairs
    transaction.sign(sponsorKeypair);
    transaction.sign(accountKeypair);

    // Submit transaction
    const result = await this.server.submitTransaction(transaction);

    return {
      hash: result.hash,
      status: result.successful ? 'success' : 'failed',
      ledger: result.ledger.toString(),
      createdAt: new Date(),
      sponsoredEntries: [
        {
          type: 'signer',
          id: `${accountKeypair.publicKey()}:${signerKey}`,
        },
      ],
      feePaid: transaction.fee.toString(),
    };
  }

  /**
   * Creates a sponsored pre-auth transaction signer
   * @param sponsorSecret - Sponsor's secret key
   * @param accountSecret - Account's secret key
   * @param preAuthTxHash - Pre-auth transaction hash
   * @param weight - Signer weight
   * @returns Promise<SponsorshipResult>
   */
  async createSponsoredPreAuthSigner(
    sponsorSecret: string,
    accountSecret: string,
    preAuthTxHash: string,
    weight: number = 1
  ): Promise<SponsorshipResult> {
    return this.createSponsoredSigner(
      sponsorSecret,
      accountSecret,
      preAuthTxHash,
      'preAuthTx',
      weight
    );
  }

  /**
   * Creates a sponsored SHA256 hash signer
   * @param sponsorSecret - Sponsor's secret key
   * @param accountSecret - Account's secret key
   * @param sha256Hash - SHA256 hash
   * @param weight - Signer weight
   * @returns Promise<SponsorshipResult>
   */
  async createSponsoredSha256Signer(
    sponsorSecret: string,
    accountSecret: string,
    sha256Hash: string,
    weight: number = 1
  ): Promise<SponsorshipResult> {
    return this.createSponsoredSigner(
      sponsorSecret,
      accountSecret,
      sha256Hash,
      'sha256Hash',
      weight
    );
  }

  /**
   * Builds operations for multiple sponsored signers
   * @param sponsorPublicKey - Sponsor's public key
   * @param accountPublicKey - Account receiving the signers
   * @param signers - Array of signer configurations
   * @returns Array of operations
   */
  buildMultipleSponsoredSigners(
    sponsorPublicKey: string,
    accountPublicKey: string,
    signers: Array<{
      signerKey: string;
      signerType: 'ed25519PublicKey' | 'preAuthTx' | 'sha256Hash';
      weight: number;
    }>
  ): xdr.Operation[] {
    if (!validatePublicKey(sponsorPublicKey)) {
      throw new Error('Invalid sponsor public key');
    }
    if (!validatePublicKey(accountPublicKey)) {
      throw new Error('Invalid account public key');
    }
    if (!signers || signers.length === 0) {
      throw new Error('At least one signer is required');
    }

    const operations: xdr.Operation[] = [];

    // Begin sponsoring once
    operations.push(
      Operation.beginSponsoringFutureReserves({
        sponsoredId: accountPublicKey,
      })
    );

    // Add each signer
    for (const signer of signers) {
      if (!validateSignerWeight(signer.weight)) {
        throw new Error(`Invalid weight for signer ${signer.signerKey}`);
      }

      const signerKeyObj = this.buildSignerKey(signer.signerKey, signer.signerType);

      operations.push(
        Operation.setOptions({
          signer: {
            ...signerKeyObj,
            weight: signer.weight,
          },
          source: accountPublicKey,
        })
      );
    }

    // End sponsoring
    operations.push(
      Operation.endSponsoringFutureReserves({
        source: accountPublicKey,
      })
    );

    return operations;
  }

  /**
   * Builds an unsigned transaction for sponsored signer
   * @param sponsorPublicKey - Sponsor's public key
   * @param accountPublicKey - Account public key
   * @param signerKey - Signer key
   * @param signerType - Signer type
   * @param weight - Signer weight
   * @returns Promise with transaction XDR and required signers
   */
  async buildUnsignedTransaction(
    sponsorPublicKey: string,
    accountPublicKey: string,
    signerKey: string,
    signerType: 'ed25519PublicKey' | 'preAuthTx' | 'sha256Hash' = 'ed25519PublicKey',
    weight: number = 1
  ): Promise<{ xdr: string; requiredSigners: string[] }> {
    if (!validatePublicKey(sponsorPublicKey)) {
      throw new Error('Invalid sponsor public key');
    }
    if (!validatePublicKey(accountPublicKey)) {
      throw new Error('Invalid account public key');
    }

    const signerKeyObj = this.buildSignerKey(signerKey, signerType);
    const sponsorAccount = await this.server.loadAccount(sponsorPublicKey);

    const transaction = new TransactionBuilder(sponsorAccount, {
      fee: await this.estimateFee(3),
      networkPassphrase: this.networkConfig.passphrase,
    })
      .addOperation(
        Operation.beginSponsoringFutureReserves({
          sponsoredId: accountPublicKey,
        })
      )
      .addOperation(
        Operation.setOptions({
          signer: {
            ...signerKeyObj,
            weight: weight,
          },
          source: accountPublicKey,
        })
      )
      .addOperation(
        Operation.endSponsoringFutureReserves({
          source: accountPublicKey,
        })
      )
      .setTimeout(180)
      .build();

    return {
      xdr: transaction.toXDR(),
      requiredSigners: [sponsorPublicKey, accountPublicKey],
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
