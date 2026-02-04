/**
 * @fileoverview Type definitions for DeFi protocol integrations
 * @description Contains all interfaces and types for DeFi operations on Stellar
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-15
 */

// Stellar SDK types available via @stellar/stellar-sdk when needed

/**
 * Network configuration for DeFi protocols
 * @interface NetworkConfig
 * @property {string} network - The network to connect to
 * @property {string} horizonUrl - Horizon server URL
 * @property {string} sorobanRpcUrl - Soroban RPC URL
 * @property {string} passphrase - Network passphrase
 */
export interface NetworkConfig {
  network: 'testnet' | 'mainnet';
  horizonUrl: string;
  sorobanRpcUrl: string;
  passphrase: string;
}

/**
 * Asset information structure
 * @interface Asset
 * @property {string} code - Asset code (e.g., USDC, XLM)
 * @property {string} issuer - Asset issuer address (optional for native XLM)
 * @property {string} type - Asset type (native, credit_alphanum4, credit_alphanum12)
 */
export interface Asset {
  code: string;
  issuer?: string;
  type: 'native' | 'credit_alphanum4' | 'credit_alphanum12';
}

/**
 * Transaction result structure
 * @interface TransactionResult
 * @property {string} hash - Transaction hash
 * @property {string} status - Transaction status
 * @property {number} ledger - Ledger number
 * @property {Date} createdAt - Creation timestamp
 * @property {Record<string, unknown>} metadata - Additional metadata
 */
export interface TransactionResult {
  hash: string;
  status: 'success' | 'failed' | 'pending';
  ledger: number;
  createdAt: Date;
  metadata: Record<string, unknown>;
}

/**
 * Position information for lending protocols
 * @interface Position
 * @property {string} address - User address
 * @property {PositionBalance[]} supplied - Supplied assets
 * @property {PositionBalance[]} borrowed - Borrowed assets
 * @property {string} healthFactor - Health factor (>1 is healthy)
 * @property {string} collateralValue - Total collateral value in USD
 * @property {string} debtValue - Total debt value in USD
 */
export interface Position {
  address: string;
  supplied: PositionBalance[];
  borrowed: PositionBalance[];
  healthFactor: string;
  collateralValue: string;
  debtValue: string;
}

/**
 * Position balance information
 * @interface PositionBalance
 * @property {Asset} asset - Asset information
 * @property {string} amount - Amount
 * @property {string} valueUSD - Value in USD
 */
export interface PositionBalance {
  asset: Asset;
  amount: string;
  valueUSD: string;
}

/**
 * Health factor information
 * @interface HealthFactor
 * @property {string} value - Health factor value
 * @property {string} liquidationThreshold - Liquidation threshold
 * @property {string} maxLTV - Maximum loan-to-value ratio
 * @property {boolean} isHealthy - Whether position is healthy
 */
export interface HealthFactor {
  value: string;
  liquidationThreshold: string;
  maxLTV: string;
  isHealthy: boolean;
}

/**
 * APY information structure
 * @interface APYInfo
 * @property {string} supplyAPY - Supply APY percentage
 * @property {string} borrowAPY - Borrow APY percentage
 * @property {string} rewardAPY - Reward APY percentage (if applicable)
 * @property {Date} timestamp - Timestamp of the APY data
 */
export interface APYInfo {
  supplyAPY: string;
  borrowAPY: string;
  rewardAPY?: string;
  timestamp: Date;
}

/**
 * Protocol statistics
 * @interface ProtocolStats
 * @property {string} totalSupply - Total supply in USD
 * @property {string} totalBorrow - Total borrow in USD
 * @property {string} tvl - Total value locked in USD
 * @property {number} utilizationRate - Utilization rate percentage
 * @property {Date} timestamp - Timestamp of the stats
 */
export interface ProtocolStats {
  totalSupply: string;
  totalBorrow: string;
  tvl: string;
  utilizationRate: number;
  timestamp: Date;
}

/**
 * DEX swap quote information
 * @interface SwapQuote
 * @property {Asset} tokenIn - Input token
 * @property {Asset} tokenOut - Output token
 * @property {string} amountIn - Amount of input token
 * @property {string} amountOut - Amount of output token
 * @property {string} priceImpact - Price impact percentage
 * @property {string} minimumReceived - Minimum amount to receive (with slippage)
 * @property {string[]} path - Swap path (token addresses)
 * @property {Date} validUntil - Quote validity timestamp
 */
export interface SwapQuote {
  tokenIn: Asset;
  tokenOut: Asset;
  amountIn: string;
  amountOut: string;
  priceImpact: string;
  minimumReceived: string;
  path: string[];
  validUntil: Date;
}

/**
 * Liquidity pool information
 * @interface LiquidityPool
 * @property {string} address - Pool address
 * @property {Asset} tokenA - First token
 * @property {Asset} tokenB - Second token
 * @property {string} reserveA - Reserve of token A
 * @property {string} reserveB - Reserve of token B
 * @property {string} totalLiquidity - Total liquidity
 * @property {string} fee - Pool fee percentage
 */
export interface LiquidityPool {
  address: string;
  tokenA: Asset;
  tokenB: Asset;
  reserveA: string;
  reserveB: string;
  totalLiquidity: string;
  fee: string;
}

/**
 * DeFi protocol configuration
 * @interface ProtocolConfig
 * @property {string} protocolId - Unique protocol identifier
 * @property {string} name - Protocol name
 * @property {NetworkConfig} network - Network configuration
 * @property {Record<string, string>} contractAddresses - Contract addresses
 * @property {Record<string, unknown>} metadata - Additional metadata
 */
export interface ProtocolConfig {
  protocolId: string;
  name: string;
  network: NetworkConfig;
  contractAddresses: Record<string, string>;
  metadata: Record<string, unknown>;
}

/**
 * Protocol type enumeration
 * @enum {string}
 */
export enum ProtocolType {
  LENDING = 'lending',
  DEX = 'dex',
  LIQUIDITY = 'liquidity',
  VAULT = 'vault',
  AGGREGATOR = 'aggregator'
}

/**
 * Transaction status enumeration
 * @enum {string}
 */
export enum TransactionStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  PENDING = 'pending'
}

/**
 * Asset type enumeration
 * @enum {string}
 */
export enum AssetType {
  NATIVE = 'native',
  CREDIT_ALPHANUM4 = 'credit_alphanum4',
  CREDIT_ALPHANUM12 = 'credit_alphanum12'
}
