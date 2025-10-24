/**
 * @fileoverview Business logic for Stellar operations
 * @description Contains all Stellar-related business logic and API calls
 * @author Galaxy DevKit Team
 * @version 2.0.0
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
} from '@stellar/stellar-sdk';
import * as bip39 from 'bip39';
import {
  encryptPrivateKey,
  decryptPrivateKey,
} from '../utils/encryption.utils';
import {
  Wallet,
  WalletConfig,
  NetworkConfig,
  AccountInfo,
  Balance,
  PaymentParams,
  PaymentResult,
  TransactionInfo,
} from '../types/stellar-types';
import { derivePath } from 'ed25519-hd-key';
import { supabaseClient } from '../utils/supabase-client';
import { NetworkUtils } from '../utils/network-utils';
import { validateMemo } from '../utils/stellar-utils';

/**
 * Service class for Stellar operations
 * @class StellarService
 * @description Handles all Stellar-related business logic
 */
export class StellarService {
  private server: any;
  private networkConfig: NetworkConfig;
  private supabase = supabaseClient;
  private networkUtils: NetworkUtils;

  constructor(networkConfig: NetworkConfig) {
    this.networkConfig = networkConfig;
    this.server = new Horizon.Server(networkConfig.horizonUrl);
    this.networkUtils = new NetworkUtils();
  }

  /**
   * Creates a new Stellar wallet
   * @param config - Wallet configuration
   * @returns Promise<Wallet>
   */
  async createWallet(
    config: Partial<WalletConfig> = {},
    password: string
  ): Promise<Wallet> {
    try {
      const keypair = Keypair.random();

      const encryptedPrivateKey = encryptPrivateKey(keypair.secret(), password);

      const wallet: Wallet = {
        id: this.generateWalletId(),
        publicKey: keypair.publicKey(),
        privateKey: encryptedPrivateKey,
        network: this.networkConfig,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: (config as any).metadata || {},
      };

      const { error } = await this.supabase.from('wallets').insert([wallet]);

      if (error) {
        throw new Error(`Failed to save wallet in Supabase: ${error.message}`);
      }

      return wallet;
    } catch (error) {
      throw new Error(
        `Failed to create wallet: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Creates a wallet from a mnemonic phrase
   * @param mnemonic - BIP39 mnemonic phrase
   * @param config - Wallet configuration
   * @returns Promise<Wallet>
   */
  async createWalletFromMnemonic(
    mnemonic: string,
    password: string,
    config: Partial<WalletConfig> = {}
  ): Promise<Wallet> {
    if (!mnemonic) {
      throw new Error('Plz enter Mnemonics');
    }

    if (!password) {
      throw new Error('Plz enter password');
    }
    try {
      if (!bip39.validateMnemonic(mnemonic)) {
        throw new Error('Invalid mnemonic phrase');
      }

      const seed = await bip39.mnemonicToSeed(mnemonic);
      const { key } = derivePath("m/44'/148'/0'", seed.toString('hex'));
      const keypair = Keypair.fromRawEd25519Seed(Buffer.from(key));
      const encryptedPrivateKey = encryptPrivateKey(keypair.secret(), password);

      const wallet: Wallet = {
        id: this.generateWalletId(),
        publicKey: keypair.publicKey(),
        privateKey: encryptedPrivateKey,
        network: this.networkConfig,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: (config as any).metadata || {},
      };

      const { error } = await this.supabase.from('wallets').insert([wallet]);

      if (error) {
        throw new Error(`Failed to save wallet in Supabase: ${error.message}`);
      }

      return wallet;
    } catch (error) {
      throw new Error(
        `Failed to create wallet from mnemonic: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generates a new BIP39 mnemonic phrase
   * @param strength - Entropy strength (128, 160, 192, 224, 256)
   * @returns string
   */
  generateMnemonic(strength: number = 256): string {
    return bip39.generateMnemonic(strength);
  }

  /**
   * Gets account information from Stellar network
   * @param publicKey - Account public key
   * @returns Promise<AccountInfo>
   */
  async getAccountInfo(publicKey: string): Promise<AccountInfo> {
    try {
      if (!this.networkUtils.isValidPublicKey(publicKey)) {
        throw new Error('Invalid public key format');
      }

      const account = await this.server.loadAccount(publicKey);

      const balances: Balance[] = account.balances.map(
        (balance: Horizon.HorizonApi.BalanceLine) => {
          if (balance.asset_type === 'native') {
            return {
              asset: 'XLM',
              balance: balance.balance,
              limit: undefined,
              buyingLiabilities: balance.buying_liabilities,
              sellingLiabilities: balance.selling_liabilities,
            };
          } else if (
            balance.asset_type === 'credit_alphanum4' ||
            balance.asset_type === 'credit_alphanum12'
          ) {
            return {
              asset: balance.asset_code || 'UNKNOWN',
              balance: balance.balance,
              limit: balance.limit,
              buyingLiabilities: balance.buying_liabilities,
              sellingLiabilities: balance.selling_liabilities,
            };
          }
          return {
            asset: 'UNKNOWN',
            balance: '0',
            limit: undefined,
            buyingLiabilities: undefined,
            sellingLiabilities: undefined,
          };
        }
      );

      const accountInfo: AccountInfo = {
        accountId: account.accountId(),
        sequence: account.sequenceNumber(),
        balances,
        subentryCount: account.subentry_count.toString(),
        inflationDestination: account.inflation_destination,
        homeDomain: account.home_domain,
        data: account.data_attr,
      };

      return accountInfo;
    } catch (error) {
      if (error instanceof Error && error.message.includes('404')) {
        throw new Error(
          `Account not found: ${publicKey}. The account may not be funded yet.`
        );
      }
      throw new Error(
        `Failed to get account info: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Checks if an account exists and is funded on the network
   * @param publicKey - Account public key
   * @returns Promise<boolean>
   */
  async isAccountFunded(publicKey: string): Promise<boolean> {
    try {
      await this.server.loadAccount(publicKey);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Gets account balance for a specific asset
   * @param publicKey - Account public key
   * @param asset - Asset code (XLM for native)
   * @returns Promise<Balance>
   */
  async getBalance(publicKey: string, asset: string = 'XLM'): Promise<Balance> {
    try {
      const accountInfo = await this.getAccountInfo(publicKey);
      const balance = accountInfo.balances.find(b => b.asset === asset);

      if (!balance) {
        throw new Error(`Asset ${asset} not found in account`);
      }

      return balance;
    } catch (error) {
      throw new Error(
        `Failed to get balance: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Sends a payment transaction
   * @param wallet - Source wallet
   * @param params - Payment parameters
   * @returns Promise<PaymentResult>
   */
  async sendPayment(
    wallet: Wallet,
    params: PaymentParams,
    password: string
  ): Promise<PaymentResult> {
    try {
      if (!this.networkUtils.isValidPublicKey(params.destination)) {
        throw new Error('Invalid destination address');
      }

      if (parseFloat(params.amount) <= 0) {
        throw new Error('Amount must be greater than 0');
      }

      if (params.asset !== 'XLM') {
        const destinationFunded = await this.isAccountFunded(
          params.destination
        );
        if (!destinationFunded) {
          throw new Error(
            'Destination account must be funded to receive custom assets'
          );
        }
      }

      if (params.memo) {
        validateMemo(params.memo);
      }

      const decrypted_private_key = decryptPrivateKey(
        wallet.privateKey,
        password
      );

      const keypair = Keypair.fromSecret(decrypted_private_key);
      const sourceAccount = await this.server.loadAccount(wallet.publicKey);

      const asset =
        params.asset === 'XLM'
          ? Asset.native()
          : new Asset(params.asset, params.issuer as string);

      if (params.asset !== 'XLM' && !params.issuer) {
        throw new Error('Issuer is required for non-native assets');
      }

      const fee = await this.estimateFee();

      const transactionBuilder = new TransactionBuilder(sourceAccount, {
        fee: params.fee?.toString() || fee,
        networkPassphrase: this.networkConfig.passphrase,
      });

      transactionBuilder.addOperation(
        Operation.payment({
          destination: params.destination,
          asset: asset,
          amount: params.amount,
        })
      );

      if (params.memo) {
        transactionBuilder.addMemo(Memo.text(params.memo));
      }

      transactionBuilder.setTimeout(180);

      const transaction = transactionBuilder.build();
      transaction.sign(keypair);

      const result = await this.submitTrxWithRetry(transaction);

      const paymentResult: PaymentResult = {
        hash: result.hash,
        status: result.successful ? 'success' : 'failed',
        ledger: result.ledger.toString(),
        createdAt: new Date(),
      };

      return paymentResult;
    } catch (error) {
      throw new Error(
        `Failed to send payment: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Creates and funds a new account
   * @param sourceWallet - Source wallet with funds
   * @param destinationPublicKey - New account's public key
   * @param startingBalance - Starting balance for the new account
   * @returns Promise<PaymentResult>
   */
  async createAccount(
    sourceWallet: Wallet,
    destinationPublicKey: string,
    startingBalance: string,
    password: string
  ): Promise<PaymentResult> {
    try {
      if (!this.networkUtils.isValidPublicKey(destinationPublicKey)) {
        throw new Error('Invalid destination public key');
      }

      if (parseFloat(startingBalance) < 1) {
        throw new Error('Starting balance must be at least 1 XLM');
      }

      const decrypted_private_key = decryptPrivateKey(
        sourceWallet.privateKey,
        password
      );
      const keypair = Keypair.fromSecret(decrypted_private_key);
      const sourceAccount = await this.server.loadAccount(
        sourceWallet.publicKey
      );

      const fee = await this.estimateFee();

      const transaction = new TransactionBuilder(sourceAccount, {
        fee,
        networkPassphrase: this.networkConfig.passphrase,
      })
        .addOperation(
          Operation.createAccount({
            destination: destinationPublicKey,
            startingBalance: startingBalance,
          })
        )
        .setTimeout(180)
        .build();

      transaction.sign(keypair);

      const result = await this.submitTrxWithRetry(transaction);

      return {
        hash: result.hash,
        status: result.successful ? 'success' : 'failed',
        ledger: result.ledger.toString(),
        createdAt: new Date(),
      };
    } catch (error) {
      throw new Error(
        `Failed to create account: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Gets transaction history for an account
   * @param publicKey - Account public key
   * @param limit - Number of transactions to retrieve
   * @returns Promise<TransactionInfo[]>
   */
  async getTransactionHistory(
    publicKey: string,
    limit: number = 10
  ): Promise<TransactionInfo[]> {
    try {
      const transactions = await this.server
        .transactions()
        .forAccount(publicKey)
        .order('desc')
        .limit(limit)
        .call();

      const transactionHistory: TransactionInfo[] = await Promise.all(
        transactions.records.map(async (tx: any) => {
          try {
            const operations = await this.server
              .operations()
              .forTransaction(tx.hash)
              .call();

            // Find payment or create_account operation
            const paymentOp = operations.records.find(
              (op: any) => op.type === 'payment' || op.type === 'create_account'
            );

            // Extract destination based on operation type
            let destination = '';
            if (paymentOp) {
              if (paymentOp.type === 'payment') {
                destination = paymentOp.to || paymentOp.destination || '';
              } else if (paymentOp.type === 'create_account') {
                destination = paymentOp.account || '';
              }
            }

            // Extract asset information
            let asset = 'XLM';
            if (paymentOp) {
              if (paymentOp.asset_type === 'native') {
                asset = 'XLM';
              } else if (
                paymentOp.asset_type === 'credit_alphanum4' ||
                paymentOp.asset_type === 'credit_alphanum12'
              ) {
                asset = paymentOp.asset_code || 'UNKNOWN';
              }
            }

            // Extract amount
            const amount =
              paymentOp?.amount || paymentOp?.starting_balance || '0';

            return {
              hash: tx.hash,
              source: tx.source_account,
              destination,
              amount,
              asset,
              memo: tx.memo || '',
              status: tx.successful ? 'success' : 'failed',
              createdAt: new Date(tx.created_at),
            };
          } catch (error) {
            // If we can't fetch operations, return basic transaction info
            console.warn(
              `Failed to fetch operations for transaction ${tx.hash}:`,
              error
            );
            return {
              hash: tx.hash,
              source: tx.source_account,
              destination: '',
              amount: '0',
              asset: 'XLM',
              memo: tx.memo || '',
              status: tx.successful ? 'success' : 'failed',
              createdAt: new Date(tx.created_at),
            };
          }
        })
      );

      return transactionHistory;
    } catch (error) {
      throw new Error(
        `Failed to get transaction history: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Gets transaction details by hash
   * @param transactionHash - Transaction hash
   * @returns Promise<TransactionInfo>
   */
  async getTransaction(transactionHash: string): Promise<TransactionInfo> {
    try {
      const tx = await this.server
        .transactions()
        .transaction(transactionHash)
        .call();

      const operations = await this.server
        .operations()
        .forTransaction(transactionHash)
        .call();

      // Find payment or create_account operation
      const paymentOp = operations.records.find(
        (op: any) => op.type === 'payment' || op.type === 'create_account'
      );

      // Extract destination based on operation type
      let destination = '';
      if (paymentOp) {
        if (paymentOp.type === 'payment') {
          destination = paymentOp.to || paymentOp.destination || '';
        } else if (paymentOp.type === 'create_account') {
          destination = paymentOp.account || '';
        }
      }

      // Extract asset information
      let asset = 'XLM';
      if (paymentOp) {
        if (paymentOp.asset_type === 'native') {
          asset = 'XLM';
        } else if (
          paymentOp.asset_type === 'credit_alphanum4' ||
          paymentOp.asset_type === 'credit_alphanum12'
        ) {
          asset = paymentOp.asset_code || 'UNKNOWN';
        }
      }

      // Extract amount
      const amount = paymentOp?.amount || paymentOp?.starting_balance || '0';

      return {
        hash: tx.hash,
        source: tx.source_account,
        destination,
        amount,
        asset,
        memo: tx.memo || '',
        status: tx.successful ? 'success' : 'failed',
        createdAt: new Date(tx.created_at),
      };
    } catch (error) {
      throw new Error(
        `Failed to get transaction: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async addTrustline(
    wallet: Wallet,
    assetCode: string,
    assetIssuer: string,
    limit: string = '922337203685.4775807', // Max
    password: string
  ): Promise<PaymentResult> {
    const decrypted = decryptPrivateKey(wallet.privateKey, password);
    const keypair = Keypair.fromSecret(decrypted);
    const sourceAccount = await this.server.loadAccount(wallet.publicKey);

    const transaction = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkConfig.passphrase,
    })
      .addOperation(
        Operation.changeTrust({
          asset: new Asset(assetCode, assetIssuer),
          limit: limit,
        })
      )
      .setTimeout(180)
      .build();

    transaction.sign(keypair);
    const result = await this.server.submitTransaction(transaction);

    return {
      hash: result.hash,
      status: result.successful ? 'success' : 'failed',
      ledger: result.ledger.toString(),
      createdAt: new Date(),
    };
  }

  /**
   * Generates a unique wallet ID
   * @returns string
   */
  private generateWalletId(): string {
    return `wallet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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

  private async submitTrxWithRetry(
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

  private isRetryableError(error: any): boolean {
    // Retry on network errors, timeouts, or 5xx server errors
    if (!error) return false;
    const message = error.message || '';
    return (
      message.includes('timeout') ||
      message.includes('ECONNRESET') ||
      message.includes('ETIMEDOUT') ||
      error.response?.status >= 500
    );
  }

  async estimateFee(): Promise<string> {
    try {
      const feeStats = await this.server.feeStats();
      return feeStats.max_fee.mode;
    } catch (error) {
      return BASE_FEE;
    }
  }
}
