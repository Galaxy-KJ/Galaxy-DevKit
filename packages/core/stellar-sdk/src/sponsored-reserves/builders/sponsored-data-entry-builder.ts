/**
 * @fileoverview Builder for sponsored data entry operations
 * @description Handles building operations for sponsored data entry creation
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
import { NetworkConfig } from '../../types/stellar-types.js';
import { SponsorshipResult, DataEntryConfig } from '../types/sponsored-reserves-types.js';
import {
  validatePublicKey,
  validateSecretKey,
  validateDataEntryName,
  validateDataEntryValue,
} from '../utils/sponsorship-validation.js';

/**
 * Builder class for sponsored data entry operations
 * @class SponsoredDataEntryBuilder
 */
export class SponsoredDataEntryBuilder {
  private server: Horizon.Server;
  private networkConfig: NetworkConfig;

  /**
   * Creates a new SponsoredDataEntryBuilder instance
   * @param networkConfig - Network configuration
   */
  constructor(networkConfig: NetworkConfig) {
    this.networkConfig = networkConfig;
    this.server = new Horizon.Server(networkConfig.horizonUrl);
  }

  /**
   * Converts a value to proper format for data entry
   * @param value - String or Buffer value
   * @returns String value suitable for manageData operation
   */
  private prepareDataValue(value: string | Buffer): string {
    if (Buffer.isBuffer(value)) {
      return value.toString('base64');
    }
    return value;
  }

  /**
   * Builds operations for a sponsored data entry
   * @param sponsorPublicKey - Sponsor's public key
   * @param accountPublicKey - Account receiving the data entry
   * @param name - Data entry name (max 64 characters)
   * @param value - Data entry value (max 64 bytes)
   * @returns Array of operations
   */
  buildSponsoredDataEntry(
    sponsorPublicKey: string,
    accountPublicKey: string,
    name: string,
    value: string | Buffer
  ): xdr.Operation[] {
    if (!validatePublicKey(sponsorPublicKey)) {
      throw new Error('Invalid sponsor public key');
    }
    if (!validatePublicKey(accountPublicKey)) {
      throw new Error('Invalid account public key');
    }
    if (!validateDataEntryName(name)) {
      throw new Error('Invalid data entry name (must be 1-64 characters)');
    }
    if (!validateDataEntryValue(value)) {
      throw new Error('Invalid data entry value (must be up to 64 bytes)');
    }

    const dataValue = this.prepareDataValue(value);
    const operations: xdr.Operation[] = [];

    // Begin sponsoring
    operations.push(
      Operation.beginSponsoringFutureReserves({
        sponsoredId: accountPublicKey,
      })
    );

    // Manage data operation (source must be the account)
    operations.push(
      Operation.manageData({
        name: name,
        value: dataValue,
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
   * Builds operations for multiple sponsored data entries
   * @param sponsorPublicKey - Sponsor's public key
   * @param accountPublicKey - Account receiving the data entries
   * @param dataEntries - Array of data entries
   * @returns Array of operations
   */
  buildMultipleSponsoredDataEntries(
    sponsorPublicKey: string,
    accountPublicKey: string,
    dataEntries: Array<{ name: string; value: string | Buffer }>
  ): xdr.Operation[] {
    if (!validatePublicKey(sponsorPublicKey)) {
      throw new Error('Invalid sponsor public key');
    }
    if (!validatePublicKey(accountPublicKey)) {
      throw new Error('Invalid account public key');
    }
    if (!dataEntries || dataEntries.length === 0) {
      throw new Error('At least one data entry is required');
    }

    const operations: xdr.Operation[] = [];

    // Begin sponsoring once
    operations.push(
      Operation.beginSponsoringFutureReserves({
        sponsoredId: accountPublicKey,
      })
    );

    // Add each data entry
    for (const entry of dataEntries) {
      if (!validateDataEntryName(entry.name)) {
        throw new Error(`Invalid data entry name: ${entry.name}`);
      }
      if (!validateDataEntryValue(entry.value)) {
        throw new Error(`Invalid data entry value for: ${entry.name}`);
      }

      const dataValue = this.prepareDataValue(entry.value);

      operations.push(
        Operation.manageData({
          name: entry.name,
          value: dataValue,
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
   * Creates a sponsored data entry with full transaction execution
   * @param sponsorSecret - Sponsor's secret key
   * @param accountSecret - Account's secret key
   * @param name - Data entry name
   * @param value - Data entry value
   * @returns Promise<SponsorshipResult>
   */
  async createSponsoredDataEntry(
    sponsorSecret: string,
    accountSecret: string,
    name: string,
    value: string | Buffer
  ): Promise<SponsorshipResult> {
    if (!validateSecretKey(sponsorSecret)) {
      throw new Error('Invalid sponsor secret key');
    }
    if (!validateSecretKey(accountSecret)) {
      throw new Error('Invalid account secret key');
    }

    const sponsorKeypair = Keypair.fromSecret(sponsorSecret);
    const accountKeypair = Keypair.fromSecret(accountSecret);
    const dataValue = this.prepareDataValue(value);

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
        Operation.manageData({
          name: name,
          value: dataValue,
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
          type: 'data',
          id: `${accountKeypair.publicKey()}:${name}`,
        },
      ],
      feePaid: transaction.fee.toString(),
    };
  }

  /**
   * Creates multiple sponsored data entries in a single transaction
   * @param sponsorSecret - Sponsor's secret key
   * @param accountSecret - Account's secret key
   * @param dataEntries - Array of data entries
   * @returns Promise<SponsorshipResult>
   */
  async createMultipleSponsoredDataEntries(
    sponsorSecret: string,
    accountSecret: string,
    dataEntries: Array<{ name: string; value: string | Buffer }>
  ): Promise<SponsorshipResult> {
    if (!validateSecretKey(sponsorSecret)) {
      throw new Error('Invalid sponsor secret key');
    }
    if (!validateSecretKey(accountSecret)) {
      throw new Error('Invalid account secret key');
    }

    const sponsorKeypair = Keypair.fromSecret(sponsorSecret);
    const accountKeypair = Keypair.fromSecret(accountSecret);

    // Load sponsor account
    const sponsorAccount = await this.server.loadAccount(sponsorKeypair.publicKey());

    // Build transaction
    const builder = new TransactionBuilder(sponsorAccount, {
      fee: await this.estimateFee(dataEntries.length + 2),
      networkPassphrase: this.networkConfig.passphrase,
    });

    // Begin sponsoring
    builder.addOperation(
      Operation.beginSponsoringFutureReserves({
        sponsoredId: accountKeypair.publicKey(),
      })
    );

    // Add all data entries
    for (const entry of dataEntries) {
      const dataValue = this.prepareDataValue(entry.value);
      builder.addOperation(
        Operation.manageData({
          name: entry.name,
          value: dataValue,
          source: accountKeypair.publicKey(),
        })
      );
    }

    // End sponsoring
    builder.addOperation(
      Operation.endSponsoringFutureReserves({
        source: accountKeypair.publicKey(),
      })
    );

    const transaction = builder.setTimeout(180).build();

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
      sponsoredEntries: dataEntries.map(e => ({
        type: 'data' as const,
        id: `${accountKeypair.publicKey()}:${e.name}`,
      })),
      feePaid: transaction.fee.toString(),
    };
  }

  /**
   * Builds an unsigned transaction for sponsored data entry
   * @param sponsorPublicKey - Sponsor's public key
   * @param accountPublicKey - Account public key
   * @param name - Data entry name
   * @param value - Data entry value
   * @returns Promise with transaction XDR and required signers
   */
  async buildUnsignedTransaction(
    sponsorPublicKey: string,
    accountPublicKey: string,
    name: string,
    value: string | Buffer
  ): Promise<{ xdr: string; requiredSigners: string[] }> {
    if (!validatePublicKey(sponsorPublicKey)) {
      throw new Error('Invalid sponsor public key');
    }
    if (!validatePublicKey(accountPublicKey)) {
      throw new Error('Invalid account public key');
    }

    const dataValue = this.prepareDataValue(value);
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
        Operation.manageData({
          name: name,
          value: dataValue,
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
   * Deletes a data entry (sets value to null)
   * Note: This doesn't require sponsorship since it removes an entry
   * @param accountSecret - Account's secret key
   * @param name - Data entry name to delete
   * @returns Promise<SponsorshipResult>
   */
  async deleteDataEntry(
    accountSecret: string,
    name: string
  ): Promise<SponsorshipResult> {
    if (!validateSecretKey(accountSecret)) {
      throw new Error('Invalid account secret key');
    }

    const accountKeypair = Keypair.fromSecret(accountSecret);
    const account = await this.server.loadAccount(accountKeypair.publicKey());

    const transaction = new TransactionBuilder(account, {
      fee: await this.estimateFee(1),
      networkPassphrase: this.networkConfig.passphrase,
    })
      .addOperation(
        Operation.manageData({
          name: name,
          value: null,
        })
      )
      .setTimeout(180)
      .build();

    transaction.sign(accountKeypair);

    const result = await this.server.submitTransaction(transaction);

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
