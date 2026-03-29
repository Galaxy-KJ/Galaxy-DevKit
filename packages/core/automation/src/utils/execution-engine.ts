import * as StellarSdk from '@stellar/stellar-sdk';
import axios from 'axios';
import {
  ExecutionType,
  ExecutionConfig,
  ExecutionContext,
  ExecutionResult,
  AutomationError,
  StellarNetwork,
} from '../types/automation-types.js';

export class ExecutionEngine {
  private server: StellarSdk.Horizon.Server;
  private sourceKeypair?: StellarSdk.Keypair;
  private network: StellarNetwork;
  private retryDelayMs = 1000;

  constructor(
    network: StellarNetwork = {
      type: 'TESTNET',
      horizonUrl: 'https://horizon-testnet.stellar.org',
      networkPassphrase: StellarSdk.Networks.TESTNET,
    },
    sourceSecret?: string
  ) {
    this.network = network;
    this.server = new StellarSdk.Horizon.Server(network.horizonUrl);

    if (sourceSecret) {
      this.sourceKeypair = StellarSdk.Keypair.fromSecret(sourceSecret);
    }
  }

  /**
   * Execute automation based on type
   */
  async execute(
    type: ExecutionType,
    config: ExecutionConfig,
    context: ExecutionContext
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const executionId = `exec_${context.ruleId}_${Date.now()}`;
    const maxRetries = config.retryAttempts || 3;

    let lastError: Error | undefined;
    let retryCount = 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        let result: any;

        switch (type) {
          case ExecutionType.STELLAR_PAYMENT:
            result = await this.executeStellarPayment(config, context);
            break;

          case ExecutionType.STELLAR_SWAP:
            result = await this.executeStellarSwap(config, context);
            break;

          case ExecutionType.STELLAR_CONTRACT:
            result = await this.executeStellarContract(config, context);
            break;

          case ExecutionType.DEX_TRADE:
            result = await this.executeDexTrade(config, context);
            break;

          case ExecutionType.NOTIFICATION:
            result = await this.sendNotification(config, context);
            break;

          case ExecutionType.WEBHOOK:
            result = await this.callWebhook(config, context);
            break;

          default:
            throw this.createError(
              'UNSUPPORTED_EXECUTION_TYPE',
              `Unsupported execution type: ${type}`,
              context.ruleId,
              true
            );
        }

        const duration = Date.now() - startTime;

        return {
          ruleId: context.ruleId,
          executionId,
          success: true,
          timestamp: new Date(),
          duration,
          result,
          retryCount,
        };
      } catch (error) {
        lastError = error as Error;
        retryCount = attempt;

        if (attempt < maxRetries) {
          const delay = config.retryDelay || this.retryDelayMs;
          await this.sleep(delay * Math.pow(2, attempt)); // Exponential backoff
        }
      }
    }

    const duration = Date.now() - startTime;

    return {
      ruleId: context.ruleId,
      executionId,
      success: false,
      timestamp: new Date(),
      duration,
      error: lastError,
      retryCount,
    };
  }

  /**
   * Execute Stellar payment
   */
  private async executeStellarPayment(
    config: ExecutionConfig,
    context: ExecutionContext
  ): Promise<any> {
    if (!this.sourceKeypair) {
      throw this.createError(
        'NO_SOURCE_KEYPAIR',
        'Source keypair not configured',
        context.ruleId,
        false
      );
    }

    if (!config.paymentConfig) {
      throw this.createError(
        'INVALID_PAYMENT_CONFIG',
        'Payment configuration is required',
        context.ruleId,
        true
      );
    }

    const paymentConfig = config.paymentConfig;
    const sourceAccount = await this.server.loadAccount(
      this.sourceKeypair.publicKey()
    );

    // Build transaction
    const txBuilder = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: config.baseFee || StellarSdk.BASE_FEE,
      networkPassphrase: this.network.networkPassphrase,
    });

    // Determine asset
    const asset =
      paymentConfig.asset.code && paymentConfig.asset.issuer
        ? new StellarSdk.Asset(
            paymentConfig.asset.code,
            paymentConfig.asset.issuer
          )
        : StellarSdk.Asset.native();

    // Add payment or create account operation
    if (paymentConfig.createAccount) {
      txBuilder.addOperation(
        StellarSdk.Operation.createAccount({
          destination: paymentConfig.destination,
          startingBalance: paymentConfig.amount,
        })
      );
    } else {
      txBuilder.addOperation(
        StellarSdk.Operation.payment({
          destination: paymentConfig.destination,
          asset: asset,
          amount: paymentConfig.amount,
        })
      );
    }

    // Add memo if provided
    if (config.memo) {
      switch (config.memoType) {
        case 'text':
          txBuilder.addMemo(StellarSdk.Memo.text(config.memo));
          break;
        case 'id':
          txBuilder.addMemo(StellarSdk.Memo.id(config.memo));
          break;
        case 'hash':
          txBuilder.addMemo(StellarSdk.Memo.hash(config.memo));
          break;
        case 'return':
          txBuilder.addMemo(StellarSdk.Memo.return(config.memo));
          break;
        default:
          txBuilder.addMemo(StellarSdk.Memo.text(config.memo));
      }
    }

    // Set timeout
    const timeout = config.timeout || 180;
    txBuilder.setTimeout(timeout);

    // Build and sign transaction
    const transaction = txBuilder.build();
    transaction.sign(this.sourceKeypair);

    // Submit transaction
    const result = await this.server.submitTransaction(transaction);

    return {
      hash: result.hash,
      ledger: result.ledger,
      envelope_xdr: result.envelope_xdr,
      result_xdr: result.result_xdr,
      successful: result.successful,
    };
  }

  /**
   * Execute Stellar swap (path payment)
   */
  private async executeStellarSwap(
    config: ExecutionConfig,
    context: ExecutionContext
  ): Promise<any> {
    if (!this.sourceKeypair) {
      throw this.createError(
        'NO_SOURCE_KEYPAIR',
        'Source keypair not configured',
        context.ruleId,
        false
      );
    }

    if (!config.swapConfig) {
      throw this.createError(
        'INVALID_SWAP_CONFIG',
        'Swap configuration is required',
        context.ruleId,
        true
      );
    }

    const swapConfig = config.swapConfig;
    const sourceAccount = await this.server.loadAccount(
      this.sourceKeypair.publicKey()
    );

    // Build assets
    const sendAsset =
      swapConfig.sendAsset.code && swapConfig.sendAsset.issuer
        ? new StellarSdk.Asset(
            swapConfig.sendAsset.code,
            swapConfig.sendAsset.issuer
          )
        : StellarSdk.Asset.native();

    const destAsset =
      swapConfig.destinationAsset.code && swapConfig.destinationAsset.issuer
        ? new StellarSdk.Asset(
            swapConfig.destinationAsset.code,
            swapConfig.destinationAsset.issuer
          )
        : StellarSdk.Asset.native();

    // Build path
    const path = (swapConfig.path || []).map(asset =>
      asset.code && asset.issuer
        ? new StellarSdk.Asset(asset.code, asset.issuer)
        : StellarSdk.Asset.native()
    );

    // Build transaction
    const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: config.baseFee || StellarSdk.BASE_FEE,
      networkPassphrase: this.network.networkPassphrase,
    })
      .addOperation(
        StellarSdk.Operation.pathPaymentStrictReceive({
          sendAsset: sendAsset,
          sendMax: swapConfig.sendMax,
          destination: swapConfig.destinationAccount,
          destAsset: destAsset,
          destAmount: swapConfig.destinationAmount,
          path: path,
        })
      )
      .setTimeout(config.timeout || 180)
      .build();

    transaction.sign(this.sourceKeypair);

    const result = await this.server.submitTransaction(transaction);

    return {
      hash: result.hash,
      ledger: result.ledger,
      successful: result.successful,
    };
  }

  /**
   * Execute Stellar smart contract (Soroban)
   */
  private async executeStellarContract(
    config: ExecutionConfig,
    context: ExecutionContext
  ): Promise<any> {
    if (!this.sourceKeypair) {
      throw this.createError(
        'NO_SOURCE_KEYPAIR',
        'Source keypair not configured',
        context.ruleId,
        false
      );
    }

    if (!config.contractConfig) {
      throw this.createError(
        'INVALID_CONTRACT_CONFIG',
        'Contract configuration is required',
        context.ruleId,
        true
      );
    }

    const contractConfig = config.contractConfig;


    const sourceAccount = await this.server.loadAccount(
      this.sourceKeypair.publicKey()
    );

    const contractAddress = new StellarSdk.Address(contractConfig.contractId);

    const params = (contractConfig.params || []).map(param =>
      this.convertToScVal(param)
    );

    const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: config.baseFee || (Number(StellarSdk.BASE_FEE) * 100).toString(),
      networkPassphrase: this.network.networkPassphrase,
    })
      .addOperation(
        StellarSdk.Operation.invokeContractFunction({
          contract: contractAddress.toString(),
          function: contractConfig.method,
          args: params,
        })
      )
      .setTimeout(config.timeout || 180)
      .build();

    transaction.sign(this.sourceKeypair);

    const result = await this.server.submitTransaction(transaction);

    return {
      hash: result.hash,
      ledger: result.ledger,
      successful: result.successful,
    };
  }

  /**
   * Execute DEX trade (manage offer)
   */
  private async executeDexTrade(
    config: ExecutionConfig,
    context: ExecutionContext
  ): Promise<any> {
    if (!this.sourceKeypair) {
      throw this.createError(
        'NO_SOURCE_KEYPAIR',
        'Source keypair not configured',
        context.ruleId,
        false
      );
    }

    if (!config.tradeConfig) {
      throw this.createError(
        'INVALID_TRADE_CONFIG',
        'Trade configuration is required',
        context.ruleId,
        true
      );
    }

    const tradeConfig = config.tradeConfig;
    const sourceAccount = await this.server.loadAccount(
      this.sourceKeypair.publicKey()
    );

    // Build assets
    const selling =
      tradeConfig.selling.code && tradeConfig.selling.issuer
        ? new StellarSdk.Asset(
            tradeConfig.selling.code,
            tradeConfig.selling.issuer
          )
        : StellarSdk.Asset.native();

    const buying =
      tradeConfig.buying.code && tradeConfig.buying.issuer
        ? new StellarSdk.Asset(
            tradeConfig.buying.code,
            tradeConfig.buying.issuer
          )
        : StellarSdk.Asset.native();

    // Calculate price
    const price = tradeConfig.price || '1';

    // Build transaction
    const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
      fee: config.baseFee || StellarSdk.BASE_FEE,
      networkPassphrase: this.network.networkPassphrase,
    })
      .addOperation(
        StellarSdk.Operation.manageSellOffer({
          selling: selling,
          buying: buying,
          amount: tradeConfig.amount,
          price: price,
          offerId: '0', // 0 creates a new offer
        })
      )
      .setTimeout(config.timeout || 180)
      .build();

    transaction.sign(this.sourceKeypair);

    const result = await this.server.submitTransaction(transaction);

    return {
      hash: result.hash,
      ledger: result.ledger,
      successful: result.successful,
      offer: {
        selling: tradeConfig.selling,
        buying: tradeConfig.buying,
        amount: tradeConfig.amount,
        price: price,
      },
    };
  }

  /**
   * Send notification
   */
  private async sendNotification(
    config: ExecutionConfig,
    context: ExecutionContext
  ): Promise<any> {
    if (!config.notificationConfig) {
      throw this.createError(
        'INVALID_NOTIFICATION_CONFIG',
        'Notification configuration is required',
        context.ruleId,
        true
      );
    }

    const notifConfig = config.notificationConfig;

    const results = await Promise.all(
      notifConfig.channels.map(async channel => {
        console.log(`Sending ${channel} notification:`, notifConfig.message);
        return {
          channel,
          success: true,
          sentAt: new Date().toISOString(),
        };
      })
    );

    return {
      channels: results,
      message: notifConfig.message,
      priority: notifConfig.priority,
    };
  }

  /**
   * Call webhook
   */
  private async callWebhook(
    config: ExecutionConfig,
    context: ExecutionContext
  ): Promise<any> {
    if (!config.webhookUrl) {
      throw this.createError(
        'INVALID_WEBHOOK_CONFIG',
        'Webhook URL is required',
        context.ruleId,
        true
      );
    }

    const payload = {
      ruleId: context.ruleId,
      userId: context.userId,
      timestamp: context.timestamp.toISOString(),
      marketData: context.marketData,
      accountData: context.accountData,
      stellarData: context.stellarData,
      customData: context.customData,
    };

    const response = await axios.post(config.webhookUrl, payload, {
      headers: config.webhookHeaders || {},
      timeout: 30000,
    });

    return {
      statusCode: response.status,
      data: response.data,
      headers: response.headers,
    };
  }

  /**
   * Convert value to Stellar ScVal
   */
  private convertToScVal(value: any): StellarSdk.xdr.ScVal {
    if (typeof value === 'number') {
      return StellarSdk.xdr.ScVal.scvU64(
        StellarSdk.xdr.Uint64.fromString(value.toString())
      );
    } else if (typeof value === 'string') {
      return StellarSdk.xdr.ScVal.scvString(value);
    } else if (typeof value === 'boolean') {
      return StellarSdk.xdr.ScVal.scvBool(value);
    }

    return StellarSdk.xdr.ScVal.scvString(String(value));
  }

  /**
   * Create automation error
   */
  private createError(
    code: string,
    message: string,
    ruleId: string,
    recoverable: boolean
  ): AutomationError {
    const error = new Error(message) as AutomationError;
    error.code = code;
    error.ruleId = ruleId;
    error.recoverable = recoverable;
    return error;
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Update network configuration
   */
  updateNetwork(network: StellarNetwork, sourceSecret?: string): void {
    this.network = network;
    this.server = new StellarSdk.Horizon.Server(network.horizonUrl);

    if (sourceSecret) {
      this.sourceKeypair = StellarSdk.Keypair.fromSecret(sourceSecret);
    }
  }

  /**
   * Get execution status
   */
  getStatus(): {
    hasKeypair: boolean;
    network: string;
    horizonUrl: string;
    ready: boolean;
  } {
    return {
      hasKeypair: !!this.sourceKeypair,
      network: this.network.type,
      horizonUrl: this.network.horizonUrl,
      ready: !!this.sourceKeypair,
    };
  }

  /**
   * Get account info
   */
  async getAccountInfo(publicKey?: string): Promise<any> {
    const key = publicKey || this.sourceKeypair?.publicKey();

    if (!key) {
      throw new Error('No public key provided or configured');
    }

    return await this.server.loadAccount(key);
  }
}

export default ExecutionEngine;
