/**
 * @fileoverview Base interface for all DeFi protocol integrations
 * @description Defines the contract that all DeFi protocols must implement
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-15
 */

import {
  Asset,
  TransactionResult,
  Position,
  HealthFactor,
  APYInfo,
  ProtocolStats,
  SwapQuote,
  LiquidityPool,
  ProtocolConfig,
  ProtocolType
} from './defi-types.js';

/**
 * Base interface for all DeFi protocol implementations
 * @interface IDefiProtocol
 * @description Each protocol (Blend, Soroswap, etc.) must implement this interface
 */
export interface IDefiProtocol {
  /**
   * Protocol identifier (e.g., 'blend', 'soroswap')
   */
  readonly protocolId: string;

  /**
   * Protocol display name (e.g., 'Blend Protocol', 'Soroswap')
   */
  readonly name: string;

  /**
   * Protocol type (lending, dex, liquidity, etc.)
   */
  readonly type: ProtocolType;

  /**
   * Protocol configuration
   */
  readonly config: ProtocolConfig;

  /**
   * Initialize the protocol connection
   * @returns {Promise<void>}
   */
  initialize(): Promise<void>;

  /**
   * Check if protocol is initialized and connected
   * @returns {boolean}
   */
  isInitialized(): boolean;

  /**
   * Get protocol statistics
   * @returns {Promise<ProtocolStats>}
   */
  getStats(): Promise<ProtocolStats>;

  // ========================================
  // LENDING & BORROWING OPERATIONS
  // ========================================

  /**
   * Supply assets to the protocol
   * @param {string} walletAddress - User wallet address
   * @param {string} privateKey - User private key for signing
   * @param {Asset} asset - Asset to supply
   * @param {string} amount - Amount to supply
   * @returns {Promise<TransactionResult>}
   */
  supply(
    walletAddress: string,
    privateKey: string,
    asset: Asset,
    amount: string
  ): Promise<TransactionResult>;

  /**
   * Borrow assets from the protocol
   * @param {string} walletAddress - User wallet address
   * @param {string} privateKey - User private key for signing
   * @param {Asset} asset - Asset to borrow
   * @param {string} amount - Amount to borrow
   * @returns {Promise<TransactionResult>}
   */
  borrow(
    walletAddress: string,
    privateKey: string,
    asset: Asset,
    amount: string
  ): Promise<TransactionResult>;

  /**
   * Repay borrowed assets
   * @param {string} walletAddress - User wallet address
   * @param {string} privateKey - User private key for signing
   * @param {Asset} asset - Asset to repay
   * @param {string} amount - Amount to repay
   * @returns {Promise<TransactionResult>}
   */
  repay(
    walletAddress: string,
    privateKey: string,
    asset: Asset,
    amount: string
  ): Promise<TransactionResult>;

  /**
   * Withdraw supplied assets
   * @param {string} walletAddress - User wallet address
   * @param {string} privateKey - User private key for signing
   * @param {Asset} asset - Asset to withdraw
   * @param {string} amount - Amount to withdraw
   * @returns {Promise<TransactionResult>}
   */
  withdraw(
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
   * @param {string} address - User address
   * @returns {Promise<Position>}
   */
  getPosition(address: string): Promise<Position>;

  /**
   * Get user's health factor
   * @param {string} address - User address
   * @returns {Promise<HealthFactor>}
   */
  getHealthFactor(address: string): Promise<HealthFactor>;

  // ========================================
  // PROTOCOL INFORMATION
  // ========================================

  /**
   * Get supply APY for an asset
   * @param {Asset} asset - Asset to query
   * @returns {Promise<APYInfo>}
   */
  getSupplyAPY(asset: Asset): Promise<APYInfo>;

  /**
   * Get borrow APY for an asset
   * @param {Asset} asset - Asset to query
   * @returns {Promise<APYInfo>}
   */
  getBorrowAPY(asset: Asset): Promise<APYInfo>;

  /**
   * Get total supply for an asset
   * @param {Asset} asset - Asset to query
   * @returns {Promise<string>}
   */
  getTotalSupply(asset: Asset): Promise<string>;

  /**
   * Get total borrow for an asset
   * @param {Asset} asset - Asset to query
   * @returns {Promise<string>}
   */
  getTotalBorrow(asset: Asset): Promise<string>;

  // ========================================
  // DEX OPERATIONS (Optional - for DEX protocols)
  // ========================================

  /**
   * Execute a token swap
   * @param {string} walletAddress - User wallet address
   * @param {string} privateKey - User private key for signing
   * @param {Asset} tokenIn - Input token
   * @param {Asset} tokenOut - Output token
   * @param {string} amountIn - Amount of input token
   * @param {string} minAmountOut - Minimum amount of output token
   * @returns {Promise<TransactionResult>}
   */
  swap?(
    walletAddress: string,
    privateKey: string,
    tokenIn: Asset,
    tokenOut: Asset,
    amountIn: string,
    minAmountOut: string
  ): Promise<TransactionResult>;

  /**
   * Get swap quote
   * @param {Asset} tokenIn - Input token
   * @param {Asset} tokenOut - Output token
   * @param {string} amountIn - Amount of input token
   * @returns {Promise<SwapQuote>}
   */
  getSwapQuote?(
    tokenIn: Asset,
    tokenOut: Asset,
    amountIn: string
  ): Promise<SwapQuote>;

  /**
   * Add liquidity to a pool
   * @param {string} walletAddress - User wallet address
   * @param {string} privateKey - User private key for signing
   * @param {Asset} tokenA - First token
   * @param {Asset} tokenB - Second token
   * @param {string} amountA - Amount of first token
   * @param {string} amountB - Amount of second token
   * @returns {Promise<TransactionResult>}
   */
  addLiquidity?(
    walletAddress: string,
    privateKey: string,
    tokenA: Asset,
    tokenB: Asset,
    amountA: string,
    amountB: string
  ): Promise<TransactionResult>;

  removeLiquidity?(
    walletAddress: string,
    privateKey: string,
    tokenA: Asset,
    tokenB: Asset,
    poolAddress: string,
    liquidity: string,
    amountAMin?: string,
    amountBMin?: string
  ): Promise<TransactionResult>;

  /**
   * Get liquidity pool information
   * @param {Asset} tokenA - First token
   * @param {Asset} tokenB - Second token
   * @returns {Promise<LiquidityPool>}
   */
  getLiquidityPool?(tokenA: Asset, tokenB: Asset): Promise<LiquidityPool>;
}

/**
 * Factory interface for creating protocol instances
 * @interface IProtocolFactory
 */
export interface IProtocolFactory {
  /**
   * Create a protocol instance
   * @param {ProtocolConfig} config - Protocol configuration
   * @returns {IDefiProtocol}
   */
  createProtocol(config: ProtocolConfig): IDefiProtocol;

  /**
   * Get supported protocol IDs
   * @returns {string[]}
   */
  getSupportedProtocols(): string[];
}
