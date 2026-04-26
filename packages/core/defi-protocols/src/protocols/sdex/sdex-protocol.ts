/**
 * @fileoverview Stellar DEX (SDEX) Protocol implementation
 * @description Implementation of native Stellar DEX protocol integration
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-04-26
 */

import {
  TransactionBuilder,
  Asset as StellarAsset,
  BASE_FEE,
  Operation
} from '@stellar/stellar-sdk';
import BigNumber from 'bignumber.js';

import { BaseProtocol } from '../base-protocol.js';
import {
  Asset,
  TransactionResult,
  Position,
  HealthFactor,
  APYInfo,
  ProtocolStats,
  ProtocolConfig,
  ProtocolType,
  SwapQuote
} from '../../types/defi-types.js';
import { InvalidOperationError } from '../../errors/index.js';
import { toStellarAsset, HorizonPathRecord } from './sdex-types.js';

/**
 * Stellar DEX (SDEX) Protocol implementation
 * @class SdexProtocol
 * @extends BaseProtocol
 * @description Implements native Stellar DEX operations (Path Payments)
 */
export class SdexProtocol extends BaseProtocol {
  /**
   * Constructor
   * @param {ProtocolConfig} config - Protocol configuration
   */
  constructor(config: ProtocolConfig) {
    super(config);
  }

  /**
   * Get protocol type
   * @protected
   * @returns {ProtocolType}
   */
  protected getProtocolType(): ProtocolType {
    return ProtocolType.DEX;
  }

  /**
   * Validate protocol configuration
   * @protected
   * @returns {Promise<void>}
   */
  protected async validateConfiguration(): Promise<void> {
    if (!this.config.network) {
      throw new Error('Network configuration is required');
    }

    // Validate network connectivity
    try {
      await this.horizonServer.ledgers().limit(1).call();
    } catch (error) {
      throw new Error(`Failed to connect to Horizon server: ${error}`);
    }
  }

  /**
   * Setup protocol-specific initialization
   * @protected
   * @returns {Promise<void>}
   */
  protected async setupProtocol(): Promise<void> {
    // SDEX doesn't require specific contract initialization
    // Just ensure Horizon is accessible (already handled in BaseProtocol.validateConfiguration)
  }

  // ========================================
  // PROTOCOL INFORMATION
  // ========================================

  /**
   * Get protocol statistics
   * @returns {Promise<ProtocolStats>}
   */
  public async getStats(): Promise<ProtocolStats> {
    this.ensureInitialized();
    try {
      // SDEX stats are global to the network
      // For now, return placeholder data
      return {
        totalSupply: '0',
        totalBorrow: '0',
        tvl: '0',
        utilizationRate: 0,
        timestamp: new Date()
      };
    } catch (error) {
      this.handleError(error, 'getStats');
    }
  }

  // ========================================
  // LENDING OPERATIONS (Not supported by SDEX)
  // ========================================

  public async supply(): Promise<TransactionResult> {
    throw new InvalidOperationError('Supply is not supported by SDEX.', {
      protocolId: this.protocolId,
      operationType: 'supply'
    });
  }

  public async borrow(): Promise<TransactionResult> {
    throw new InvalidOperationError('Borrow is not supported by SDEX.', {
      protocolId: this.protocolId,
      operationType: 'borrow'
    });
  }

  public async repay(): Promise<TransactionResult> {
    throw new InvalidOperationError('Repay is not supported by SDEX.', {
      protocolId: this.protocolId,
      operationType: 'repay'
    });
  }

  public async withdraw(): Promise<TransactionResult> {
    throw new InvalidOperationError('Withdraw is not supported by SDEX.', {
      protocolId: this.protocolId,
      operationType: 'withdraw'
    });
  }

  // ========================================
  // POSITION MANAGEMENT
  // ========================================

  public async getPosition(): Promise<Position> {
    throw new InvalidOperationError('getPosition is not supported by SDEX.', {
      protocolId: this.protocolId,
      operationType: 'getPosition'
    });
  }

  public async getHealthFactor(): Promise<HealthFactor> {
    throw new InvalidOperationError('getHealthFactor is not supported by SDEX.', {
      protocolId: this.protocolId,
      operationType: 'getHealthFactor'
    });
  }

  // ========================================
  // PROTOCOL INFORMATION (Lending-specific)
  // ========================================

  public async getSupplyAPY(): Promise<APYInfo> {
    throw new InvalidOperationError('getSupplyAPY is not supported by SDEX.', {
      protocolId: this.protocolId,
      operationType: 'getSupplyAPY'
    });
  }

  public async getBorrowAPY(): Promise<APYInfo> {
    throw new InvalidOperationError('getBorrowAPY is not supported by SDEX.', {
      protocolId: this.protocolId,
      operationType: 'getBorrowAPY'
    });
  }

  public async getTotalSupply(): Promise<string> {
    throw new InvalidOperationError('getTotalSupply is not supported by SDEX.', {
      protocolId: this.protocolId,
      operationType: 'getTotalSupply'
    });
  }

  public async getTotalBorrow(): Promise<string> {
    throw new InvalidOperationError('getTotalBorrow is not supported by SDEX.', {
      protocolId: this.protocolId,
      operationType: 'getTotalBorrow'
    });
  }

  // ========================================
  // DEX OPERATIONS
  // ========================================

  /**
   * Get a swap quote for a token pair using Horizon path-finding
   * @param {Asset} tokenIn - Source token
   * @param {Asset} tokenOut - Destination token
   * @param {string} amountIn - Amount of source token
   * @returns {Promise<SwapQuote>} Swap quote information
   */
  public async getSwapQuote(
    tokenIn: Asset,
    tokenOut: Asset,
    amountIn: string
  ): Promise<SwapQuote> {
    this.ensureInitialized();
    this.validateAsset(tokenIn);
    this.validateAsset(tokenOut);
    this.validateAmount(amountIn);

    try {
      const sourceAsset = toStellarAsset(tokenIn);
      const destAsset = toStellarAsset(tokenOut);

      // Find strict-send paths
      const paths = await this.horizonServer
        .strictSendPaths(sourceAsset, amountIn, [destAsset])
        .call();

      if (paths.records.length === 0) {
        throw new Error(`No path found from ${tokenIn.code} to ${tokenOut.code} on SDEX`);
      }

      // Best path is usually the first one (most amountOut)
      const bestPathRecord = paths.records[0] as unknown as HorizonPathRecord;
      
      const amountOut = bestPathRecord.destination_amount;
      const slippageTolerance = 0.01; // 1% default for SDEX
      const minimumReceived = new BigNumber(amountOut)
        .multipliedBy(1 - slippageTolerance)
        .toFixed(7);

      return {
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
        priceImpact: '0', // SDEX path-finding doesn't explicitly return price impact
        minimumReceived,
        path: bestPathRecord.path.map(p => {
          if (p.asset_type === 'native') return 'XLM';
          return `${p.asset_code}:${p.asset_issuer}`;
        }),
        validUntil: new Date(Date.now() + 60000)
      };
    } catch (error) {
      this.handleError(error, 'getSwapQuote');
    }
  }

  /**
   * Execute a token swap using PathPaymentStrictSend
   * @param {string} walletAddress - Wallet public key
   * @param {string} privateKey - Wallet private key (unused - returns unsigned XDR)
   * @param {Asset} tokenIn - Source token
   * @param {Asset} tokenOut - Destination token
   * @param {string} amountIn - Amount of source token
   * @param {string} minAmountOut - Minimum amount of destination token to accept
   * @returns {Promise<TransactionResult>} Unsigned XDR transaction
   */
  public async swap(
    walletAddress: string,
    privateKey: string,
    tokenIn: Asset,
    tokenOut: Asset,
    amountIn: string,
    minAmountOut: string
  ): Promise<TransactionResult> {
    this.ensureInitialized();
    this.validateAddress(walletAddress);
    this.validateAsset(tokenIn);
    this.validateAsset(tokenOut);
    this.validateAmount(amountIn);

    try {
      const quote = await this.getSwapQuote(tokenIn, tokenOut, amountIn);
      
      const sourceAsset = toStellarAsset(tokenIn);
      const destAsset = toStellarAsset(tokenOut);
      const path = quote.path
        .slice(1, -1) // Remove source and dest assets from path
        .map(p => {
          if (p === 'XLM') return StellarAsset.native();
          const [code, issuer] = p.split(':');
          return new StellarAsset(code, issuer);
        });

      const opOptions = {
        sendAsset: sourceAsset,
        sendAmount: amountIn,
        destination: walletAddress,
        destAsset: destAsset,
        destMin: minAmountOut,
        path: path
      };

      const operation = Operation.pathPaymentStrictSend(opOptions);

      const account = await this.horizonServer.loadAccount(walletAddress);
      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase
      })
        .addOperation(operation)
        .setTimeout(180)
        .build();

      const xdr = transaction.toXDR();

      return this.buildTransactionResult(xdr, 'pending', 0, {
        operation: 'swap',
        protocol: 'sdex',
        tokenIn,
        tokenOut,
        amountIn,
        minAmountOut,
        path: quote.path
      });
    } catch (error) {
      this.handleError(error, 'swap');
    }
  }
}
