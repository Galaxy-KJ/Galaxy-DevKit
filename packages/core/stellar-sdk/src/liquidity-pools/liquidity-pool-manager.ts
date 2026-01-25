/**
 * @fileoverview Liquidity Pool Manager
 * @description Manages liquidity pool operations on Stellar network
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-22
 */

import {
  Keypair,
  Asset,
  Operation,
  TransactionBuilder,
  Horizon,
  Memo,
  BASE_FEE,
} from '@stellar/stellar-sdk';
import BigNumber from 'bignumber.js';
import {
  LiquidityPool,
  LiquidityPoolDeposit,
  LiquidityPoolWithdraw,
  LiquidityPoolResult,
  QueryPoolsParams,
  PoolAnalytics,
  DepositEstimate,
  WithdrawEstimate,
  PoolShare,
} from './types';
import {
  validateDepositParams,
  validateWithdrawParams,
  validatePoolId,
  validatePublicKey,
} from './validation';
import {
  calculateDepositShares,
  calculateWithdrawAmounts,
  estimateDeposit,
  estimateWithdraw,
} from './calculations';
import { Wallet } from '../types/stellar-types';
import { decryptPrivateKey } from '../utils/encryption.utils';

/**
 * Liquidity Pool Manager class
 * @class LiquidityPoolManager
 * @description Handles all liquidity pool operations
 */
export class LiquidityPoolManager {
  private server: Horizon.Server;
  private networkPassphrase: string;

  constructor(server: Horizon.Server, networkPassphrase: string) {
    this.server = server;
    this.networkPassphrase = networkPassphrase;
  }

  /**
   * Deposits liquidity to a pool
   * @param wallet - Source wallet
   * @param params - Deposit parameters
   * @param password - Wallet password for decryption
   * @returns Promise<LiquidityPoolResult>
   * @throws {Error} If validation fails or transaction fails
   */
  async depositLiquidity(
    wallet: Wallet,
    params: LiquidityPoolDeposit,
    password: string
  ): Promise<LiquidityPoolResult> {
    try {
      // 1. Validate parameters
      validateDepositParams(params);

      // 2. Get pool details to calculate optimal deposit
      const pool = await this.getPoolDetails(params.poolId);

      // 3. Calculate optimal deposit amounts
      const { actualAmountA, actualAmountB } = calculateDepositShares(
        params.maxAmountA,
        params.maxAmountB,
        pool
      );

      // 4. Decrypt private key
      const decryptedPrivateKey = decryptPrivateKey(wallet.privateKey, password);
      const keypair = Keypair.fromSecret(decryptedPrivateKey);

      // 5. Load source account
      const sourceAccount = await this.server.loadAccount(wallet.publicKey);

      // 6. Estimate fee
      const fee = params.fee || (await this.estimateFee());

      // 7. Build transaction
      const transactionBuilder = new TransactionBuilder(sourceAccount, {
        fee: fee.toString(),
        networkPassphrase: this.networkPassphrase,
      });

      // 8. Add liquidityPoolDeposit operation
      const depositOp: any = {
        liquidityPoolId: params.poolId,
        maxAmountA: actualAmountA,
        maxAmountB: actualAmountB,
      };

      // Only add price bounds if provided
      if (params.minPrice) {
        depositOp.minPrice = params.minPrice;
      }
      if (params.maxPrice) {
        depositOp.maxPrice = params.maxPrice;
      }

      transactionBuilder.addOperation(Operation.liquidityPoolDeposit(depositOp));

      // 9. Add memo if provided
      if (params.memo) {
        transactionBuilder.addMemo(Memo.text(params.memo));
      }

      // 10. Set timeout
      transactionBuilder.setTimeout(180);

      // 11. Build, sign, and submit transaction
      const transaction = transactionBuilder.build();
      transaction.sign(keypair);

      const result = await this.server.submitTransaction(transaction);

      return {
        poolId: params.poolId,
        hash: result.hash,
        status: result.successful ? 'success' : 'failed',
        ledger: result.ledger.toString(),
        createdAt: new Date(),
      };
    } catch (error) {
      throw new Error(
        `Failed to deposit liquidity: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Withdraws liquidity from a pool
   * @param wallet - Source wallet
   * @param params - Withdrawal parameters
   * @param password - Wallet password for decryption
   * @returns Promise<LiquidityPoolResult>
   * @throws {Error} If validation fails or transaction fails
   */
  async withdrawLiquidity(
    wallet: Wallet,
    params: LiquidityPoolWithdraw,
    password: string
  ): Promise<LiquidityPoolResult> {
    try {
      // 1. Validate parameters
      validateWithdrawParams(params);

      // 2. Get pool details
      const pool = await this.getPoolDetails(params.poolId);

      // 3. Calculate withdrawal amounts
      const { amountA, amountB } = calculateWithdrawAmounts(params.shares, pool);

      // 4. Validate user has sufficient shares
      const userShares = await this.getUserShares(wallet.publicKey, params.poolId);
      if (new BigNumber(params.shares).isGreaterThan(userShares)) {
        throw new Error(
          `Insufficient shares. Available: ${userShares}, Requested: ${params.shares}`
        );
      }

      // 5. Decrypt private key
      const decryptedPrivateKey = decryptPrivateKey(wallet.privateKey, password);
      const keypair = Keypair.fromSecret(decryptedPrivateKey);

      // 6. Load source account
      const sourceAccount = await this.server.loadAccount(wallet.publicKey);

      // 7. Estimate fee
      const fee = params.fee || (await this.estimateFee());

      // 8. Build transaction
      const transactionBuilder = new TransactionBuilder(sourceAccount, {
        fee: fee.toString(),
        networkPassphrase: this.networkPassphrase,
      });

      // 9. Add liquidityPoolWithdraw operation
      transactionBuilder.addOperation(
        Operation.liquidityPoolWithdraw({
          liquidityPoolId: params.poolId,
          amount: params.shares,
          minAmountA: params.minAmountA || amountA,
          minAmountB: params.minAmountB || amountB,
        })
      );

      // 10. Add memo if provided
      if (params.memo) {
        transactionBuilder.addMemo(Memo.text(params.memo));
      }

      // 11. Set timeout
      transactionBuilder.setTimeout(180);

      // 12. Build, sign, and submit transaction
      const transaction = transactionBuilder.build();
      transaction.sign(keypair);

      const result = await this.server.submitTransaction(transaction);

      return {
        poolId: params.poolId,
        hash: result.hash,
        status: result.successful ? 'success' : 'failed',
        ledger: result.ledger.toString(),
        createdAt: new Date(),
      };
    } catch (error) {
      throw new Error(
        `Failed to withdraw liquidity: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Gets liquidity pool details by ID
   * @param poolId - Pool ID
   * @returns Promise<LiquidityPool>
   * @throws {Error} If pool not found or fetch fails
   */
  async getPoolDetails(poolId: string): Promise<LiquidityPool> {
    try {
      validatePoolId(poolId);

      const pool = await this.server
        .liquidityPools()
        .liquidityPoolId(poolId)
        .call();

      return this.mapHorizonPoolToLiquidityPool(pool);
    } catch (error) {
      if ((error as any).response?.status === 404) {
        throw new Error(`Liquidity pool not found: ${poolId}`);
      }
      throw new Error(
        `Failed to get pool details: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Queries liquidity pools
   * @param params - Query parameters
   * @returns Promise<LiquidityPool[]>
   */
  async queryPools(params: QueryPoolsParams = {}): Promise<LiquidityPool[]> {
    try {
      let callBuilder = this.server.liquidityPools();

      // Filter by assets if provided
      if (params.assets && params.assets.length > 0) {
        // Stellar requires exactly 2 assets for pool queries
        if (params.assets.length === 2) {
          callBuilder = callBuilder.forAssets(...params.assets);
        }
      }

      // Set limit
      if (params.limit) {
        callBuilder = callBuilder.limit(params.limit);
      }

      // Set cursor for pagination
      if (params.cursor) {
        callBuilder = callBuilder.cursor(params.cursor);
      }

      const response = await callBuilder.call();

      return response.records.map((pool) =>
        this.mapHorizonPoolToLiquidityPool(pool)
      );
    } catch (error) {
      throw new Error(
        `Failed to query liquidity pools: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Gets user's share balance for a specific pool
   * @param publicKey - User's public key
   * @param poolId - Pool ID
   * @returns Promise<string> - Share balance
   */
  async getUserShares(publicKey: string, poolId: string): Promise<string> {
    try {
      validatePublicKey(publicKey);
      validatePoolId(poolId);

      const account = await this.server.loadAccount(publicKey);

      const poolBalance = account.balances.find(
        (b: any) =>
          b.asset_type === 'liquidity_pool_shares' &&
          b.liquidity_pool_id === poolId
      );

      return poolBalance ? poolBalance.balance : '0';
    } catch (error) {
      if ((error as any).response?.status === 404) {
        return '0'; // Account not found or not funded
      }
      throw new Error(
        `Failed to get user shares: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Gets all pool shares for a user
   * @param publicKey - User's public key
   * @returns Promise<PoolShare[]>
   */
  async getUserPoolShares(publicKey: string): Promise<PoolShare[]> {
    try {
      validatePublicKey(publicKey);

      const account = await this.server.loadAccount(publicKey);

      const poolShares: PoolShare[] = [];

      for (const balance of account.balances) {
        if (balance.asset_type === 'liquidity_pool_shares') {
          const poolId = (balance as any).liquidity_pool_id;
          const shares = balance.balance;

          // Get pool details to calculate percentage
          try {
            const pool = await this.getPoolDetails(poolId);
            const percentage = new BigNumber(shares)
              .dividedBy(pool.totalShares)
              .multipliedBy(100)
              .toFixed(4);

            poolShares.push({
              poolId,
              balance: shares,
              percentage,
            });
          } catch (error) {
            // Pool might not exist anymore, skip it
            continue;
          }
        }
      }

      return poolShares;
    } catch (error) {
      if ((error as any).response?.status === 404) {
        return []; // Account not found
      }
      throw new Error(
        `Failed to get user pool shares: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Gets pool analytics with on-chain data (TVL and share price)
   * Note: volume24h, fees24h, and apy require historical data from external analytics services
   * @param poolId - Pool ID
   * @returns Promise<PoolAnalytics>
   */
  async getPoolAnalytics(poolId: string): Promise<PoolAnalytics> {
    try {
      const pool = await this.getPoolDetails(poolId);

      // Calculate TVL (total value locked in pool reserves)
      // This is the sum of reserves in their native asset units
      // To convert to USD, use external price feeds
      const tvl = new BigNumber(pool.reserveA)
        .plus(pool.reserveB)
        .toFixed(7);

      // Calculate share price (value of 1 share in terms of asset A)
      const totalShares = new BigNumber(pool.totalShares);
      const sharePrice = totalShares.isZero()
        ? '0'
        : new BigNumber(pool.reserveA).dividedBy(totalShares).toFixed(7);

      // Note: volume24h, fees24h, and apy require querying historical operations
      // from Horizon's effects/operations endpoints and aggregating data over time.
      // These metrics are intentionally omitted as they require external data sources.
      return {
        tvl,
        sharePrice,
      };
    } catch (error) {
      throw new Error(
        `Failed to get pool analytics: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Estimates deposit operation
   * @param poolId - Pool ID
   * @param amountA - Amount of asset A
   * @param amountB - Amount of asset B
   * @returns Promise<DepositEstimate>
   */
  async estimatePoolDeposit(
    poolId: string,
    amountA: string,
    amountB: string
  ): Promise<DepositEstimate> {
    try {
      validatePoolId(poolId);

      const pool = await this.getPoolDetails(poolId);
      return estimateDeposit(amountA, amountB, pool);
    } catch (error) {
      throw new Error(
        `Failed to estimate deposit: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Estimates withdrawal operation
   * @param poolId - Pool ID
   * @param shares - Shares to withdraw
   * @returns Promise<WithdrawEstimate>
   */
  async estimatePoolWithdraw(
    poolId: string,
    shares: string
  ): Promise<WithdrawEstimate> {
    try {
      validatePoolId(poolId);

      const pool = await this.getPoolDetails(poolId);
      return estimateWithdraw(shares, pool);
    } catch (error) {
      throw new Error(
        `Failed to estimate withdrawal: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Gets liquidity pools for specific assets
   * @param assetA - First asset
   * @param assetB - Second asset
   * @param limit - Number of results to return
   * @returns Promise<LiquidityPool[]>
   */
  async getPoolsForAssets(
    assetA: Asset,
    assetB: Asset,
    limit: number = 10
  ): Promise<LiquidityPool[]> {
    return this.queryPools({
      assets: [assetA, assetB],
      limit,
    });
  }

  /**
   * Maps Horizon API pool to our LiquidityPool type
   * @param horizonPool - Horizon API pool
   * @returns LiquidityPool
   */
  private mapHorizonPoolToLiquidityPool(horizonPool: any): LiquidityPool {
    // Parse reserves
    const reserves = horizonPool.reserves;

    // Stellar liquidity pools always have exactly 2 reserves
    if (!reserves || reserves.length !== 2) {
      throw new Error('Invalid pool structure: expected 2 reserves');
    }

    // Create Asset objects
    const assetA =
      reserves[0].asset === 'native'
        ? Asset.native()
        : new Asset(
            reserves[0].asset.split(':')[0],
            reserves[0].asset.split(':')[1]
          );

    const assetB =
      reserves[1].asset === 'native'
        ? Asset.native()
        : new Asset(
            reserves[1].asset.split(':')[0],
            reserves[1].asset.split(':')[1]
          );

    return {
      id: horizonPool.id,
      assetA,
      assetB,
      reserveA: reserves[0].amount,
      reserveB: reserves[1].amount,
      totalShares: horizonPool.total_shares,
      totalTrustlines: parseInt(horizonPool.total_trustlines, 10),
      fee: horizonPool.fee_bp || 30, // Default to 30 basis points (0.3%)
    };
  }

  /**
   * Estimates transaction fee
   * @returns Promise<string>
   */
  private async estimateFee(): Promise<string> {
    try {
      const feeStats = await this.server.feeStats();
      return feeStats.max_fee.mode;
    } catch (error) {
      return BASE_FEE;
    }
  }
}
