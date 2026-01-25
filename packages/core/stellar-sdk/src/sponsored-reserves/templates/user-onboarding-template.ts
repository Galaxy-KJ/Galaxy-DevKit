/**
 * @fileoverview Template for user onboarding with sponsored reserves
 * @description Provides a streamlined flow for onboarding new users with sponsored accounts
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
import { NetworkConfig } from '../../types/stellar-types';
import {
  UserOnboardingConfig,
  SponsorshipResult,
  SponsorshipCost,
} from '../types/sponsored-reserves-types';
import {
  validatePublicKey,
  validateSecretKey,
  validateAssetCode,
  validateDataEntryName,
} from '../utils/sponsorship-validation';
import { calculateOnboardingCost } from '../utils/cost-calculator';

/**
 * Template class for user onboarding with sponsored reserves
 * @class UserOnboardingTemplate
 */
export class UserOnboardingTemplate {
  private server: Horizon.Server;
  private networkConfig: NetworkConfig;

  /**
   * Creates a new UserOnboardingTemplate instance
   * @param networkConfig - Network configuration
   */
  constructor(networkConfig: NetworkConfig) {
    this.networkConfig = networkConfig;
    this.server = new Horizon.Server(networkConfig.horizonUrl);
  }

  /**
   * Calculates the cost of onboarding a user
   * @param config - Onboarding configuration
   * @returns SponsorshipCost breakdown
   */
  calculateOnboardingCost(config: UserOnboardingConfig): SponsorshipCost {
    return calculateOnboardingCost(config);
  }

  /**
   * Builds all operations needed for user onboarding
   * @param config - Onboarding configuration
   * @returns Array of operations
   */
  buildOnboardingOperations(config: UserOnboardingConfig): xdr.Operation[] {
    if (!validatePublicKey(config.sponsorPublicKey)) {
      throw new Error('Invalid sponsor public key');
    }
    if (!validatePublicKey(config.newUserPublicKey)) {
      throw new Error('Invalid new user public key');
    }

    const operations: xdr.Operation[] = [];

    // Begin sponsoring
    operations.push(
      Operation.beginSponsoringFutureReserves({
        sponsoredId: config.newUserPublicKey,
      })
    );

    // Create account
    operations.push(
      Operation.createAccount({
        destination: config.newUserPublicKey,
        startingBalance: config.startingBalance || '0',
      })
    );

    // Add trustlines if specified
    if (config.trustlines && config.trustlines.length > 0) {
      for (const trustline of config.trustlines) {
        if (!validateAssetCode(trustline.assetCode)) {
          throw new Error(`Invalid asset code: ${trustline.assetCode}`);
        }
        if (!validatePublicKey(trustline.assetIssuer)) {
          throw new Error(`Invalid asset issuer: ${trustline.assetIssuer}`);
        }

        const asset = new Asset(trustline.assetCode, trustline.assetIssuer);
        operations.push(
          Operation.changeTrust({
            asset: asset,
            limit: trustline.limit || '922337203685.4775807',
            source: config.newUserPublicKey,
          })
        );
      }
    }

    // Add data entries if specified
    if (config.dataEntries && config.dataEntries.length > 0) {
      for (const dataEntry of config.dataEntries) {
        if (!validateDataEntryName(dataEntry.name)) {
          throw new Error(`Invalid data entry name: ${dataEntry.name}`);
        }

        operations.push(
          Operation.manageData({
            name: dataEntry.name,
            value: dataEntry.value,
            source: config.newUserPublicKey,
          })
        );
      }
    }

    // End sponsoring
    operations.push(
      Operation.endSponsoringFutureReserves({
        source: config.newUserPublicKey,
      })
    );

    return operations;
  }

  /**
   * Onboards a new user with sponsored reserves
   * @param config - Onboarding configuration
   * @param sponsorSecret - Sponsor's secret key
   * @param newUserSecret - New user's secret key
   * @returns Promise<SponsorshipResult>
   */
  async onboardUser(
    config: UserOnboardingConfig,
    sponsorSecret: string,
    newUserSecret: string
  ): Promise<SponsorshipResult> {
    if (!validateSecretKey(sponsorSecret)) {
      throw new Error('Invalid sponsor secret key');
    }
    if (!validateSecretKey(newUserSecret)) {
      throw new Error('Invalid new user secret key');
    }

    const sponsorKeypair = Keypair.fromSecret(sponsorSecret);
    const newUserKeypair = Keypair.fromSecret(newUserSecret);

    // Validate keys match config
    if (sponsorKeypair.publicKey() !== config.sponsorPublicKey) {
      throw new Error('Sponsor secret key does not match sponsor public key in config');
    }
    if (newUserKeypair.publicKey() !== config.newUserPublicKey) {
      throw new Error('New user secret key does not match new user public key in config');
    }

    // Load sponsor account
    const sponsorAccount = await this.server.loadAccount(sponsorKeypair.publicKey());

    // Calculate number of operations
    const trustlineCount = config.trustlines?.length || 0;
    const dataEntryCount = config.dataEntries?.length || 0;
    const operationCount = 2 + trustlineCount + dataEntryCount + 1; // begin + create + trustlines + data + end

    // Build transaction
    const builder = new TransactionBuilder(sponsorAccount, {
      fee: await this.estimateFee(operationCount),
      networkPassphrase: this.networkConfig.passphrase,
    });

    // Add all operations
    const operations = this.buildOnboardingOperations(config);
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
    transaction.sign(newUserKeypair);

    // Submit transaction
    const result = await this.server.submitTransaction(transaction);

    // Build sponsored entries list
    const sponsoredEntries: Array<{ type: any; id?: string }> = [
      { type: 'account', id: config.newUserPublicKey },
    ];

    if (config.trustlines) {
      for (const tl of config.trustlines) {
        sponsoredEntries.push({
          type: 'trustline',
          id: `${config.newUserPublicKey}:${tl.assetCode}:${tl.assetIssuer}`,
        });
      }
    }

    if (config.dataEntries) {
      for (const de of config.dataEntries) {
        sponsoredEntries.push({
          type: 'data',
          id: `${config.newUserPublicKey}:${de.name}`,
        });
      }
    }

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
   * Builds an unsigned transaction for user onboarding
   * @param config - Onboarding configuration
   * @returns Promise with transaction XDR and required signers
   */
  async buildUnsignedOnboardingTransaction(
    config: UserOnboardingConfig
  ): Promise<{ xdr: string; requiredSigners: string[]; cost: SponsorshipCost }> {
    if (!validatePublicKey(config.sponsorPublicKey)) {
      throw new Error('Invalid sponsor public key');
    }
    if (!validatePublicKey(config.newUserPublicKey)) {
      throw new Error('Invalid new user public key');
    }

    const sponsorAccount = await this.server.loadAccount(config.sponsorPublicKey);

    // Calculate number of operations
    const trustlineCount = config.trustlines?.length || 0;
    const dataEntryCount = config.dataEntries?.length || 0;
    const operationCount = 2 + trustlineCount + dataEntryCount + 1;

    // Build transaction
    const builder = new TransactionBuilder(sponsorAccount, {
      fee: await this.estimateFee(operationCount),
      networkPassphrase: this.networkConfig.passphrase,
    });

    // Add all operations
    const operations = this.buildOnboardingOperations(config);
    for (const op of operations) {
      builder.addOperation(op);
    }

    if (config.memo) {
      builder.addMemo(Memo.text(config.memo));
    }

    const transaction = builder.setTimeout(180).build();

    return {
      xdr: transaction.toXDR(),
      requiredSigners: [config.sponsorPublicKey, config.newUserPublicKey],
      cost: this.calculateOnboardingCost(config),
    };
  }

  /**
   * Creates a simple onboarding config for basic user setup
   * @param sponsorPublicKey - Sponsor's public key
   * @param newUserPublicKey - New user's public key
   * @param commonAssets - Array of common assets to add trustlines for
   * @returns UserOnboardingConfig
   */
  static createBasicOnboardingConfig(
    sponsorPublicKey: string,
    newUserPublicKey: string,
    commonAssets?: Array<{ assetCode: string; assetIssuer: string }>
  ): UserOnboardingConfig {
    return {
      sponsorPublicKey,
      newUserPublicKey,
      startingBalance: '0',
      trustlines: commonAssets,
      dataEntries: [
        {
          name: 'onboarded_at',
          value: new Date().toISOString(),
        },
      ],
    };
  }

  /**
   * Creates an onboarding config with USDC trustline (common stablecoin)
   * @param sponsorPublicKey - Sponsor's public key
   * @param newUserPublicKey - New user's public key
   * @param usdcIssuer - USDC issuer public key
   * @returns UserOnboardingConfig
   */
  static createUsdcOnboardingConfig(
    sponsorPublicKey: string,
    newUserPublicKey: string,
    usdcIssuer: string
  ): UserOnboardingConfig {
    return {
      sponsorPublicKey,
      newUserPublicKey,
      startingBalance: '0',
      trustlines: [
        {
          assetCode: 'USDC',
          assetIssuer: usdcIssuer,
        },
      ],
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
