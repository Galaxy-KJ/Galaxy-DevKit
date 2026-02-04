/**
 * @fileoverview Base abstract class for DeFi protocol implementations
 * @description Provides common functionality for all protocol implementations
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-15
 */

import { Horizon, Networks, Keypair } from '@stellar/stellar-sdk';
import { IDefiProtocol } from '../types/protocol-interface.js';
import {
  Asset,
  TransactionResult,
  Position,
  HealthFactor,
  APYInfo,
  ProtocolStats,
  ProtocolConfig,
  ProtocolType,
  SwapQuote,
  LiquidityPool
} from '../types/defi-types.js';

/**
 * Abstract base class for DeFi protocols
 * @abstract
 * @implements {IDefiProtocol}
 */
export abstract class BaseProtocol implements IDefiProtocol {
  public readonly protocolId: string;
  public readonly name: string;
  public readonly type: ProtocolType;
  public readonly config: ProtocolConfig;

  protected horizonServer: Horizon.Server;
  protected sorobanRpcUrl: string;
  protected networkPassphrase: string;
  protected initialized: boolean = false;

  /**
   * Constructor
   * @param {ProtocolConfig} config - Protocol configuration
   */
  constructor(config: ProtocolConfig) {
    this.config = config;
    this.protocolId = config.protocolId;
    this.name = config.name;
    this.type = this.getProtocolType();

    // Initialize Horizon server
    this.horizonServer = new Horizon.Server(config.network.horizonUrl);
    this.sorobanRpcUrl = config.network.sorobanRpcUrl;
    this.networkPassphrase = config.network.passphrase;
  }

  /**
   * Get the protocol type - must be implemented by subclasses
   * @abstract
   * @returns {ProtocolType}
   */
  protected abstract getProtocolType(): ProtocolType;

  /**
   * Initialize the protocol
   * @returns {Promise<void>}
   */
  public async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      await this.validateConfiguration();
      await this.setupProtocol();
      this.initialized = true;
    } catch (error) {
      throw new Error(`Failed to initialize ${this.name}: ${error}`);
    }
  }

  /**
   * Check if protocol is initialized
   * @returns {boolean}
   */
  public isInitialized(): boolean {
    return this.initialized;
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

    if (!this.config.contractAddresses || Object.keys(this.config.contractAddresses).length === 0) {
      throw new Error('Contract addresses are required');
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
   * @abstract
   * @returns {Promise<void>}
   */
  protected abstract setupProtocol(): Promise<void>;

  /**
   * Get protocol statistics
   * @abstract
   * @returns {Promise<ProtocolStats>}
   */
  public abstract getStats(): Promise<ProtocolStats>;

  // ========================================
  // LENDING & BORROWING OPERATIONS
  // ========================================

  /**
   * Supply assets to the protocol
   * @abstract
   */
  public abstract supply(
    walletAddress: string,
    privateKey: string,
    asset: Asset,
    amount: string
  ): Promise<TransactionResult>;

  /**
   * Borrow assets from the protocol
   * @abstract
   */
  public abstract borrow(
    walletAddress: string,
    privateKey: string,
    asset: Asset,
    amount: string
  ): Promise<TransactionResult>;

  /**
   * Repay borrowed assets
   * @abstract
   */
  public abstract repay(
    walletAddress: string,
    privateKey: string,
    asset: Asset,
    amount: string
  ): Promise<TransactionResult>;

  /**
   * Withdraw supplied assets
   * @abstract
   */
  public abstract withdraw(
    walletAddress: string,
    privateKey: string,
    asset: Asset,
    amount: string
  ): Promise<TransactionResult>;

  // ========================================
  // POSITION MANAGEMENT
  // ========================================

  /**
   * Get user's position in the protocol
   * @abstract
   */
  public abstract getPosition(address: string): Promise<Position>;

  /**
   * Get user's health factor
   * @abstract
   */
  public abstract getHealthFactor(address: string): Promise<HealthFactor>;

  // ========================================
  // PROTOCOL INFORMATION
  // ========================================

  /**
   * Get supply APY for an asset
   * @abstract
   */
  public abstract getSupplyAPY(asset: Asset): Promise<APYInfo>;

  /**
   * Get borrow APY for an asset
   * @abstract
   */
  public abstract getBorrowAPY(asset: Asset): Promise<APYInfo>;

  /**
   * Get total supply for an asset
   * @abstract
   */
  public abstract getTotalSupply(asset: Asset): Promise<string>;

  /**
   * Get total borrow for an asset
   * @abstract
   */
  public abstract getTotalBorrow(asset: Asset): Promise<string>;

  // ========================================
  // UTILITY METHODS
  // ========================================

  /**
   * Validate wallet address
   * @protected
   * @param {string} address - Wallet address to validate
   * @throws {Error} If address is invalid
   */
  protected validateAddress(address: string): void {
    if (!address || typeof address !== 'string') {
      throw new Error('Invalid wallet address');
    }

    try {
      Keypair.fromPublicKey(address);
    } catch (error) {
      throw new Error(`Invalid Stellar address: ${address}`);
    }
  }

  /**
   * Validate amount
   * @protected
   * @param {string} amount - Amount to validate
   * @throws {Error} If amount is invalid
   */
  protected validateAmount(amount: string): void {
    if (!amount || typeof amount !== 'string') {
      throw new Error('Invalid amount');
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      throw new Error('Amount must be a positive number');
    }
  }

  /**
   * Validate asset
   * @protected
   * @param {Asset} asset - Asset to validate
   * @throws {Error} If asset is invalid
   */
  protected validateAsset(asset: Asset): void {
    if (!asset || !asset.code) {
      throw new Error('Invalid asset');
    }

    if (asset.type !== 'native' && !asset.issuer) {
      throw new Error('Non-native assets must have an issuer');
    }
  }

  /**
   * Check if protocol is initialized, throw if not
   * @protected
   * @throws {Error} If protocol is not initialized
   */
  protected ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(`${this.name} is not initialized. Call initialize() first.`);
    }
  }

  /**
   * Get contract address by key
   * @protected
   * @param {string} key - Contract key
   * @returns {string} Contract address
   * @throws {Error} If contract address not found
   */
  protected getContractAddress(key: string): string {
    const address = this.config.contractAddresses[key];
    if (!address) {
      throw new Error(`Contract address not found for key: ${key}`);
    }
    return address;
  }

  /**
   * Build transaction result
   * @protected
   * @param {string} hash - Transaction hash
   * @param {string} status - Transaction status
   * @param {number} ledger - Ledger number
   * @param {Record<string, unknown>} metadata - Additional metadata
   * @returns {TransactionResult}
   */
  protected buildTransactionResult(
    hash: string,
    status: 'success' | 'failed' | 'pending',
    ledger: number,
    metadata: Record<string, unknown> = {}
  ): TransactionResult {
    return {
      hash,
      status,
      ledger,
      createdAt: new Date(),
      metadata: {
        ...metadata,
        protocol: this.protocolId,
        protocolName: this.name
      }
    };
  }

  /**
   * Handle protocol error
   * @protected
   * @param {unknown} error - Error object
   * @param {string} operation - Operation that failed
   * @throws {Error} Formatted error
   */
  protected handleError(error: unknown, operation: string): never {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`${this.name} ${operation} failed: ${errorMessage}`);
  }
}
