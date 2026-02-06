/**
 * @fileoverview Blend Protocol implementation for Stellar
 * @description Complete implementation of Blend lending protocol integration
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-29
 */

import {
  Contract,
  TransactionBuilder,
  BASE_FEE,
  Keypair,
  nativeToScVal,
  Address,
  rpc
} from '@stellar/stellar-sdk';

// Import Blend SDK
import {
  PoolContractV2,
  PoolV2,
  Positions,
  Request,
  RequestType,
  Network
} from '@blend-capital/blend-sdk';
import type { Pool, PoolUser, Reserve } from '@blend-capital/blend-sdk';

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
  PositionBalance
} from '../../types/defi-types.js';

import {
  BlendPoolConfig,
  BlendPosition,
  BlendReserveData,
  LiquidationOpportunity,
  LiquidationResult,
  BlendSupplyPosition,
  BlendBorrowPosition
} from './blend-types.js';

/**
 * Blend Protocol implementation
 * @class BlendProtocol
 * @extends BaseProtocol
 * @description Implements Blend lending protocol operations on Stellar
 */
export class BlendProtocol extends BaseProtocol {
  private sorobanServer: rpc.Server;
  private poolContract: Contract | null = null;
  private poolConfig: BlendPoolConfig | null = null;
  private blendPool: Pool | null = null;
  private blendNetwork: Network;

  /**
   * Constructor
   * @param {ProtocolConfig} config - Protocol configuration
   */
  constructor(config: ProtocolConfig) {
    super(config);
    this.sorobanServer = new rpc.Server(this.sorobanRpcUrl);
    this.blendNetwork = {
      rpc: this.sorobanRpcUrl,
      passphrase: this.networkPassphrase
    };
  }

  /**
   * Get protocol type
   * @protected
   * @returns {ProtocolType}
   */
  protected getProtocolType(): ProtocolType {
    return ProtocolType.LENDING;
  }

  /**
   * Setup protocol-specific initialization
   * @protected
   * @returns {Promise<void>}
   */
  protected async setupProtocol(): Promise<void> {
    try {
      // Initialize pool contract
      const poolAddress = this.getContractAddress('pool');
      this.poolContract = new Contract(poolAddress);

      // Load pool using Blend SDK for read operations
      try {
        this.blendPool = await PoolV2.load(this.blendNetwork, poolAddress);
      } catch (poolLoadError) {
        console.warn('Could not load Blend pool data from SDK:', poolLoadError);
        // Pool loading is optional for write operations
      }

      // Load pool configuration
      await this.loadPoolConfig();
    } catch (error) {
      throw new Error(`Failed to setup Blend Protocol: ${error}`);
    }
  }

  /**
   * Load pool configuration from contract
   * @private
   * @returns {Promise<void>}
   */
  private async loadPoolConfig(): Promise<void> {
    // In a real implementation, this would fetch pool config from the contract
    // For now, we'll create a basic config structure
    this.poolConfig = {
      poolAddress: this.getContractAddress('pool'),
      name: 'Blend Lending Pool',
      assets: [],
      oracleAddress: this.getContractAddress('oracle')
    };
  }

  // ========================================
  // SUPPLY & WITHDRAW OPERATIONS (#22)
  // ========================================

  /**
   * Supply assets to Blend protocol
   * @param {string} walletAddress - User wallet address
   * @param {string} privateKey - User private key for signing
   * @param {Asset} asset - Asset to supply
   * @param {string} amount - Amount to supply
   * @returns {Promise<TransactionResult>}
   */
  public async supply(
    walletAddress: string,
    privateKey: string,
    asset: Asset,
    amount: string
  ): Promise<TransactionResult> {
    this.ensureInitialized();
    this.validateAddress(walletAddress);
    this.validateAsset(asset);
    this.validateAmount(amount);

    try {
      const sourceKeypair = Keypair.fromSecret(privateKey);
      const account = await this.horizonServer.loadAccount(walletAddress);

      if (!this.poolContract) {
        throw new Error('Pool contract not initialized');
      }

      // Get asset contract address
      const assetAddress = this.assetToContractAddress(asset);

      // Create request using Blend SDK types
      const request: Request = {
        request_type: RequestType.SupplyCollateral, // Use SupplyCollateral to enable as collateral
        address: assetAddress,
        amount: BigInt(amount)
      };

      // Use PoolContractV2 spec to convert arguments to ScVals
      const submitArgs = {
        from: walletAddress,
        spender: walletAddress,
        to: walletAddress,
        requests: [request]
      };

      const scVals = PoolContractV2.spec.funcArgsToScVals('submit', submitArgs);

      // Build and submit transaction using the pool contract
      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase
      })
        .addOperation(this.poolContract.call('submit', ...scVals))
        .setTimeout(30)
        .build();

      tx.sign(sourceKeypair);

      // Simulate first
      const simulatedTx = await this.sorobanServer.simulateTransaction(tx);
      if (rpc.Api.isSimulationError(simulatedTx)) {
        throw new Error(`Simulation failed: ${simulatedTx.error}`);
      }

      // Prepare and send transaction
      const preparedTx = rpc.assembleTransaction(tx, simulatedTx).build();
      preparedTx.sign(sourceKeypair);

      const response = await this.sorobanServer.sendTransaction(preparedTx);

      // Wait for confirmation
      const result = await this.waitForTransaction(response.hash);

      return this.buildTransactionResult(
        response.hash,
        result.status === 'SUCCESS' ? 'success' : 'failed',
        (result.status === 'SUCCESS' || result.status === 'FAILED') ? result.ledger : 0,
        {
          operation: 'supply',
          asset: asset.code,
          amount
        }
      );
    } catch (error) {
      this.handleError(error, 'supply');
    }
  }

  /**
   * Withdraw supplied assets from Blend protocol
   * @param {string} walletAddress - User wallet address
   * @param {string} privateKey - User private key for signing
   * @param {Asset} asset - Asset to withdraw
   * @param {string} amount - Amount to withdraw
   * @returns {Promise<TransactionResult>}
   */
  public async withdraw(
    walletAddress: string,
    privateKey: string,
    asset: Asset,
    amount: string
  ): Promise<TransactionResult> {
    this.ensureInitialized();
    this.validateAddress(walletAddress);
    this.validateAsset(asset);
    this.validateAmount(amount);

    try {
      const sourceKeypair = Keypair.fromSecret(privateKey);
      const account = await this.horizonServer.loadAccount(walletAddress);

      if (!this.poolContract) {
        throw new Error('Pool contract not initialized');
      }

      // Build withdraw operation
      const contract = this.poolContract;
      const params = [
        new Address(walletAddress).toScVal(), // to
        nativeToScVal(this.assetToContractAddress(asset), { type: 'address' }), // asset
        nativeToScVal(amount, { type: 'i128' }) // amount
      ];

      // Build and submit transaction
      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase
      })
        .addOperation(contract.call('withdraw', ...params))
        .setTimeout(30)
        .build();

      tx.sign(sourceKeypair);

      // Simulate first
      const simulatedTx = await this.sorobanServer.simulateTransaction(tx);
      if (rpc.Api.isSimulationError(simulatedTx)) {
        throw new Error(`Simulation failed: ${simulatedTx.error}`);
      }

      // Prepare and send transaction
      const preparedTx = rpc.assembleTransaction(tx, simulatedTx).build();
      preparedTx.sign(sourceKeypair);

      const response = await this.sorobanServer.sendTransaction(preparedTx);

      // Wait for confirmation
      const result = await this.waitForTransaction(response.hash);

      return this.buildTransactionResult(
        response.hash,
        result.status === 'SUCCESS' ? 'success' : 'failed',
        (result.status === 'SUCCESS' || result.status === 'FAILED') ? result.ledger : 0,
        {
          operation: 'withdraw',
          asset: asset.code,
          amount
        }
      );
    } catch (error) {
      this.handleError(error, 'withdraw');
    }
  }

  // ========================================
  // BORROW & REPAY OPERATIONS (#23)
  // ========================================

  /**
   * Borrow assets from Blend protocol
   * @param {string} walletAddress - User wallet address
   * @param {string} privateKey - User private key for signing
   * @param {Asset} asset - Asset to borrow
   * @param {string} amount - Amount to borrow
   * @returns {Promise<TransactionResult>}
   */
  public async borrow(
    walletAddress: string,
    privateKey: string,
    asset: Asset,
    amount: string
  ): Promise<TransactionResult> {
    this.ensureInitialized();
    this.validateAddress(walletAddress);
    this.validateAsset(asset);
    this.validateAmount(amount);

    try {
      const sourceKeypair = Keypair.fromSecret(privateKey);
      const account = await this.horizonServer.loadAccount(walletAddress);

      if (!this.poolContract) {
        throw new Error('Pool contract not initialized');
      }

      // Build borrow operation
      const contract = this.poolContract;
      const params = [
        new Address(walletAddress).toScVal(), // borrower
        nativeToScVal(this.assetToContractAddress(asset), { type: 'address' }), // asset
        nativeToScVal(amount, { type: 'i128' }) // amount
      ];

      // Build and submit transaction
      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase
      })
        .addOperation(contract.call('borrow', ...params))
        .setTimeout(30)
        .build();

      tx.sign(sourceKeypair);

      // Simulate first
      const simulatedTx = await this.sorobanServer.simulateTransaction(tx);
      if (rpc.Api.isSimulationError(simulatedTx)) {
        throw new Error(`Simulation failed: ${simulatedTx.error}`);
      }

      // Prepare and send transaction
      const preparedTx = rpc.assembleTransaction(tx, simulatedTx).build();
      preparedTx.sign(sourceKeypair);

      const response = await this.sorobanServer.sendTransaction(preparedTx);

      // Wait for confirmation
      const result = await this.waitForTransaction(response.hash);

      return this.buildTransactionResult(
        response.hash,
        result.status === 'SUCCESS' ? 'success' : 'failed',
        (result.status === 'SUCCESS' || result.status === 'FAILED') ? result.ledger : 0,
        {
          operation: 'borrow',
          asset: asset.code,
          amount
        }
      );
    } catch (error) {
      this.handleError(error, 'borrow');
    }
  }

  /**
   * Repay borrowed assets to Blend protocol
   * @param {string} walletAddress - User wallet address
   * @param {string} privateKey - User private key for signing
   * @param {Asset} asset - Asset to repay
   * @param {string} amount - Amount to repay
   * @returns {Promise<TransactionResult>}
   */
  public async repay(
    walletAddress: string,
    privateKey: string,
    asset: Asset,
    amount: string
  ): Promise<TransactionResult> {
    this.ensureInitialized();
    this.validateAddress(walletAddress);
    this.validateAsset(asset);
    this.validateAmount(amount);

    try {
      const sourceKeypair = Keypair.fromSecret(privateKey);
      const account = await this.horizonServer.loadAccount(walletAddress);

      if (!this.poolContract) {
        throw new Error('Pool contract not initialized');
      }

      // Build repay operation
      const contract = this.poolContract;
      const params = [
        new Address(walletAddress).toScVal(), // borrower
        nativeToScVal(this.assetToContractAddress(asset), { type: 'address' }), // asset
        nativeToScVal(amount, { type: 'i128' }) // amount
      ];

      // Build and submit transaction
      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase
      })
        .addOperation(contract.call('repay', ...params))
        .setTimeout(30)
        .build();

      tx.sign(sourceKeypair);

      // Simulate first
      const simulatedTx = await this.sorobanServer.simulateTransaction(tx);
      if (rpc.Api.isSimulationError(simulatedTx)) {
        throw new Error(`Simulation failed: ${simulatedTx.error}`);
      }

      // Prepare and send transaction
      const preparedTx = rpc.assembleTransaction(tx, simulatedTx).build();
      preparedTx.sign(sourceKeypair);

      const response = await this.sorobanServer.sendTransaction(preparedTx);

      // Wait for confirmation
      const result = await this.waitForTransaction(response.hash);

      return this.buildTransactionResult(
        response.hash,
        result.status === 'SUCCESS' ? 'success' : 'failed',
        (result.status === 'SUCCESS' || result.status === 'FAILED') ? result.ledger : 0,
        {
          operation: 'repay',
          asset: asset.code,
          amount
        }
      );
    } catch (error) {
      this.handleError(error, 'repay');
    }
  }

  // ========================================
  // POSITION MANAGEMENT (#24)
  // ========================================

  /**
   * Get user's position in Blend protocol
   * @param {string} address - User address
   * @returns {Promise<Position>}
   */
  public async getPosition(address: string): Promise<Position> {
    this.ensureInitialized();
    this.validateAddress(address);

    try {
      if (!this.poolContract) {
        throw new Error('Pool contract not initialized');
      }

      // Try to use Blend SDK for accurate position data
      if (this.blendPool) {
        try {
          const poolUser = await this.blendPool.loadUser(address);
          return this.convertPoolUserToPosition(poolUser, address);
        } catch (sdkError) {
          console.warn('SDK loadUser failed, falling back to direct contract call:', sdkError);
        }
      }

      // Fallback: Load positions directly using Positions.load
      const poolAddress = this.getContractAddress('pool');
      try {
        const positions = await Positions.load(this.blendNetwork, poolAddress, address);
        return this.convertPositionsToPosition(positions, address);
      } catch (positionsError) {
        console.warn('Positions.load failed:', positionsError);
      }

      // Final fallback: Direct contract simulation
      const contract = this.poolContract;
      const account = await this.horizonServer.loadAccount(address);

      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase
      })
        .addOperation(
          contract.call('get_positions', new Address(address).toScVal())
        )
        .setTimeout(30)
        .build();

      const simulatedTx = await this.sorobanServer.simulateTransaction(tx);
      if (rpc.Api.isSimulationError(simulatedTx)) {
        // If simulation fails, user likely has no position
        return {
          address,
          supplied: [],
          borrowed: [],
          healthFactor: '∞',
          collateralValue: '0',
          debtValue: '0'
        };
      }

      // Parse position data from simulation result
      const position = this.parsePositionData(simulatedTx, address);

      return position;
    } catch (error) {
      this.handleError(error, 'getPosition');
    }
  }

  /**
   * Get user's health factor
   * @param {string} address - User address
   * @returns {Promise<HealthFactor>}
   */
  public async getHealthFactor(address: string): Promise<HealthFactor> {
    this.ensureInitialized();
    this.validateAddress(address);

    try {
      // Get position data first
      const position = await this.getPosition(address);

      // Calculate health factor from position data
      // Health Factor = Total Collateral Value / Total Debt Value
      const collateralValue = parseFloat(position.collateralValue) || 0;
      const debtValue = parseFloat(position.debtValue) || 0;

      let healthFactorValue = '∞'; // Infinite if no debt
      let isHealthy = true;

      if (debtValue > 0) {
        const hf = collateralValue / debtValue;
        healthFactorValue = hf.toFixed(4);
        isHealthy = hf >= 1.0; // Health factor >= 1.0 is healthy
      }

      return {
        value: healthFactorValue,
        liquidationThreshold: '0.85', // Typical Blend threshold
        maxLTV: '0.75', // Typical max LTV
        isHealthy
      };
    } catch (error) {
      this.handleError(error, 'getHealthFactor');
    }
  }

  // ========================================
  // LIQUIDATION FUNCTIONALITY (#25)
  // ========================================

  /**
   * Liquidate an unhealthy position
   * @param {string} liquidatorAddress - Liquidator wallet address
   * @param {string} privateKey - Liquidator private key
   * @param {string} borrowerAddress - Borrower address to liquidate
   * @param {Asset} debtAsset - Asset to repay
   * @param {string} debtAmount - Amount of debt to repay
   * @param {Asset} collateralAsset - Collateral asset to receive
   * @returns {Promise<LiquidationResult>}
   */
  public async liquidate(
    liquidatorAddress: string,
    privateKey: string,
    borrowerAddress: string,
    debtAsset: Asset,
    debtAmount: string,
    collateralAsset: Asset
  ): Promise<LiquidationResult> {
    this.ensureInitialized();
    this.validateAddress(liquidatorAddress);
    this.validateAddress(borrowerAddress);
    this.validateAsset(debtAsset);
    this.validateAsset(collateralAsset);
    this.validateAmount(debtAmount);

    try {
      // Check if position is liquidatable
      const healthFactor = await this.getHealthFactor(borrowerAddress);
      if (healthFactor.isHealthy) {
        throw new Error('Position is healthy and cannot be liquidated');
      }

      const sourceKeypair = Keypair.fromSecret(privateKey);
      const account = await this.horizonServer.loadAccount(liquidatorAddress);

      if (!this.poolContract) {
        throw new Error('Pool contract not initialized');
      }

      // Build liquidation operation
      const contract = this.poolContract;
      const params = [
        new Address(liquidatorAddress).toScVal(), // liquidator
        new Address(borrowerAddress).toScVal(), // borrower
        nativeToScVal(this.assetToContractAddress(debtAsset), { type: 'address' }), // debt asset
        nativeToScVal(debtAmount, { type: 'i128' }), // debt amount
        nativeToScVal(this.assetToContractAddress(collateralAsset), { type: 'address' }) // collateral asset
      ];

      // Build and submit transaction
      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase
      })
        .addOperation(contract.call('liquidate', ...params))
        .setTimeout(30)
        .build();

      tx.sign(sourceKeypair);

      // Simulate first
      const simulatedTx = await this.sorobanServer.simulateTransaction(tx);
      if (rpc.Api.isSimulationError(simulatedTx)) {
        throw new Error(`Liquidation simulation failed: ${simulatedTx.error}`);
      }

      // Prepare and send transaction
      const preparedTx = rpc.assembleTransaction(tx, simulatedTx).build();
      preparedTx.sign(sourceKeypair);

      const response = await this.sorobanServer.sendTransaction(preparedTx);

      // Wait for confirmation
      const result = await this.waitForTransaction(response.hash);

      // Parse liquidation result
      const collateralReceived = this.parseLiquidationResult(result);

      return {
        txHash: response.hash,
        userAddress: borrowerAddress,
        debtAsset,
        debtAmount,
        collateralAsset,
        collateralAmount: collateralReceived,
        profitUSD: '0', // Calculate actual profit
        timestamp: new Date()
      };
    } catch (error) {
      this.handleError(error, 'liquidate');
    }
  }

  /**
   * Find liquidation opportunities
   * @param {number} minHealthFactor - Minimum health factor threshold (positions below this are liquidatable)
   * @returns {Promise<LiquidationOpportunity[]>}
   */
  public async findLiquidationOpportunities(
    minHealthFactor: number = 1.0
  ): Promise<LiquidationOpportunity[]> {
    this.ensureInitialized();

    try {
      if (!this.poolContract) {
        throw new Error('Pool contract not initialized');
      }

      // In a real implementation, this would query the contract or indexer
      // for positions with health factor below threshold
      // For now, return empty array as placeholder
      const opportunities: LiquidationOpportunity[] = [];

      return opportunities;
    } catch (error) {
      this.handleError(error, 'findLiquidationOpportunities');
    }
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
      if (!this.poolContract) {
        throw new Error('Pool contract not initialized');
      }

      // Use Blend SDK to get real pool stats
      if (this.blendPool) {
        let totalSupply = 0;
        let totalBorrow = 0;
        let totalUtilization = 0;
        let reserveCount = 0;

        for (const [, reserve] of this.blendPool.reserves) {
          const supplyFloat = reserve.totalSupplyFloat();
          const liabilitiesFloat = reserve.totalLiabilitiesFloat();

          totalSupply += supplyFloat;
          totalBorrow += liabilitiesFloat;
          totalUtilization += reserve.getUtilizationFloat();
          reserveCount++;
        }

        const avgUtilization = reserveCount > 0 ? totalUtilization / reserveCount : 0;
        const tvl = totalSupply - totalBorrow; // TVL = Total Supply - Total Borrowed

        return {
          totalSupply: totalSupply.toFixed(2),
          totalBorrow: totalBorrow.toFixed(2),
          tvl: tvl.toFixed(2),
          utilizationRate: avgUtilization,
          timestamp: new Date()
        };
      }

      // Fallback if pool not loaded
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

  /**
   * Get supply APY for an asset
   * @param {Asset} asset - Asset to query
   * @returns {Promise<APYInfo>}
   */
  public async getSupplyAPY(asset: Asset): Promise<APYInfo> {
    this.ensureInitialized();
    this.validateAsset(asset);

    try {
      if (!this.poolContract) {
        throw new Error('Pool contract not initialized');
      }

      // Use Blend SDK to get real APY data
      if (this.blendPool) {
        const assetAddress = this.assetToContractAddress(asset);
        const reserve = this.blendPool.reserves.get(assetAddress);

        if (reserve) {
          return {
            supplyAPY: (reserve.estSupplyApy * 100).toFixed(2), // Convert to percentage
            borrowAPY: (reserve.estBorrowApy * 100).toFixed(2),
            timestamp: new Date()
          };
        }
      }

      // Fallback if reserve not found
      return {
        supplyAPY: '0',
        borrowAPY: '0',
        timestamp: new Date()
      };
    } catch (error) {
      this.handleError(error, 'getSupplyAPY');
    }
  }

  /**
   * Get borrow APY for an asset
   * @param {Asset} asset - Asset to query
   * @returns {Promise<APYInfo>}
   */
  public async getBorrowAPY(asset: Asset): Promise<APYInfo> {
    this.ensureInitialized();
    this.validateAsset(asset);

    try {
      if (!this.poolContract) {
        throw new Error('Pool contract not initialized');
      }

      // Use Blend SDK to get real APY data
      if (this.blendPool) {
        const assetAddress = this.assetToContractAddress(asset);
        const reserve = this.blendPool.reserves.get(assetAddress);

        if (reserve) {
          return {
            supplyAPY: (reserve.estSupplyApy * 100).toFixed(2),
            borrowAPY: (reserve.estBorrowApy * 100).toFixed(2),
            timestamp: new Date()
          };
        }
      }

      // Fallback if reserve not found
      return {
        supplyAPY: '0',
        borrowAPY: '0',
        timestamp: new Date()
      };
    } catch (error) {
      this.handleError(error, 'getBorrowAPY');
    }
  }

  /**
   * Get total supply for an asset
   * @param {Asset} asset - Asset to query
   * @returns {Promise<string>}
   */
  public async getTotalSupply(asset: Asset): Promise<string> {
    this.ensureInitialized();
    this.validateAsset(asset);

    try {
      if (!this.poolContract) {
        throw new Error('Pool contract not initialized');
      }

      // Use Blend SDK to get real total supply
      if (this.blendPool) {
        const assetAddress = this.assetToContractAddress(asset);
        const reserve = this.blendPool.reserves.get(assetAddress);

        if (reserve) {
          return reserve.totalSupplyFloat().toFixed(7);
        }
      }

      return '0';
    } catch (error) {
      this.handleError(error, 'getTotalSupply');
    }
  }

  /**
   * Get total borrow for an asset
   * @param {Asset} asset - Asset to query
   * @returns {Promise<string>}
   */
  public async getTotalBorrow(asset: Asset): Promise<string> {
    this.ensureInitialized();
    this.validateAsset(asset);

    try {
      if (!this.poolContract) {
        throw new Error('Pool contract not initialized');
      }

      // Use Blend SDK to get real total borrow
      if (this.blendPool) {
        const assetAddress = this.assetToContractAddress(asset);
        const reserve = this.blendPool.reserves.get(assetAddress);

        if (reserve) {
          return reserve.totalLiabilitiesFloat().toFixed(7);
        }
      }

      return '0';
    } catch (error) {
      this.handleError(error, 'getTotalBorrow');
    }
  }

  /**
   * Get reserve data for an asset
   * @param {Asset} asset - Asset to query
   * @returns {Promise<BlendReserveData>}
   */
  public async getReserveData(asset: Asset): Promise<BlendReserveData> {
    this.ensureInitialized();
    this.validateAsset(asset);

    try {
      if (!this.poolContract) {
        throw new Error('Pool contract not initialized');
      }

      // Use Blend SDK to get real reserve data
      if (this.blendPool) {
        const assetAddress = this.assetToContractAddress(asset);
        const reserve = this.blendPool.reserves.get(assetAddress);

        if (reserve) {
          const totalSupply = reserve.totalSupplyFloat();
          const totalBorrows = reserve.totalLiabilitiesFloat();
          const availableLiquidity = totalSupply - totalBorrows;

          return {
            asset,
            totalSupply: totalSupply.toFixed(7),
            totalBorrows: totalBorrows.toFixed(7),
            availableLiquidity: availableLiquidity.toFixed(7),
            utilizationRate: (reserve.getUtilizationFloat() * 100).toFixed(2),
            supplyAPY: (reserve.estSupplyApy * 100).toFixed(2),
            borrowAPY: (reserve.estBorrowApy * 100).toFixed(2),
            lastUpdateTime: new Date(reserve.data.lastTime * 1000)
          };
        }
      }

      // Fallback if reserve not found
      return {
        asset,
        totalSupply: '0',
        totalBorrows: '0',
        availableLiquidity: '0',
        utilizationRate: '0',
        supplyAPY: '0',
        borrowAPY: '0',
        lastUpdateTime: new Date()
      };
    } catch (error) {
      this.handleError(error, 'getReserveData');
    }
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  /**
   * Wait for transaction confirmation
   * @private
   * @param {string} hash - Transaction hash
   * @returns {Promise<rpc.Api.GetTransactionResponse>}
   */
  private async waitForTransaction(
    hash: string
  ): Promise<rpc.Api.GetTransactionResponse> {
    let response = await this.sorobanServer.getTransaction(hash);

    while (response.status === 'NOT_FOUND') {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      response = await this.sorobanServer.getTransaction(hash);
    }

    return response;
  }

  /**
   * Convert asset to contract address
   * @private
   * @param {Asset} asset - Asset to convert
   * @returns {string}
   */
  private assetToContractAddress(asset: Asset): string {
    // Map known testnet assets to their Soroban contract addresses
    const assetMap: Record<string, string> = {
      'USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5': 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
      // Add more assets as needed
    };

    if (asset.type === 'native') {
      // XLM native token contract address
      return 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
    }

    const assetKey = `${asset.code}:${asset.issuer}`;
    return assetMap[assetKey] || asset.issuer || 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
  }

  /**
   * Parse position data from simulation result
   * @private
   * @param {rpc.Api.SimulateTransactionResponse} simulatedTx - Simulation result
   * @param {string} address - User address
   * @returns {Position}
   */
  private parsePositionData(
    simulatedTx: rpc.Api.SimulateTransactionResponse,
    address: string
  ): Position {
    // In a real implementation, parse actual data from simulation result
    // For now, return placeholder
    return {
      address,
      supplied: [],
      borrowed: [],
      healthFactor: '0',
      collateralValue: '0',
      debtValue: '0'
    };
  }



  /**
   * Convert PoolUser from Blend SDK to Position
   * @private
   * @param {PoolUser} poolUser - Pool user from SDK
   * @param {string} address - User address
   * @returns {Position}
   */
  private convertPoolUserToPosition(poolUser: PoolUser, address: string): Position {
    const supplied: PositionBalance[] = [];
    const borrowed: PositionBalance[] = [];
    let totalCollateralValue = 0;
    let totalDebtValue = 0;

    if (this.blendPool) {
      // Iterate through reserves to get user positions
      for (const [assetId, reserve] of this.blendPool.reserves) {
        // Get collateral (supply used as collateral)
        const collateralAmount = poolUser.getCollateralFloat(reserve);
        if (collateralAmount > 0) {
          supplied.push({
            asset: { type: 'credit_alphanum4', code: assetId.substring(0, 4), issuer: assetId },
            amount: collateralAmount.toString(),
            valueUSD: '0' // Would need oracle for USD value
          });
          totalCollateralValue += collateralAmount;
        }

        // Get non-collateral supply
        const supplyAmount = poolUser.getSupplyFloat(reserve);
        if (supplyAmount > 0) {
          supplied.push({
            asset: { type: 'credit_alphanum4', code: assetId.substring(0, 4), issuer: assetId },
            amount: supplyAmount.toString(),
            valueUSD: '0'
          });
        }

        // Get liabilities (borrowed)
        const liabilityAmount = poolUser.getLiabilitiesFloat(reserve);
        if (liabilityAmount > 0) {
          borrowed.push({
            asset: { type: 'credit_alphanum4', code: assetId.substring(0, 4), issuer: assetId },
            amount: liabilityAmount.toString(),
            valueUSD: '0'
          });
          totalDebtValue += liabilityAmount;
        }
      }
    }

    const healthFactor = totalDebtValue > 0
      ? (totalCollateralValue / totalDebtValue).toFixed(4)
      : '∞';

    return {
      address,
      supplied,
      borrowed,
      healthFactor,
      collateralValue: totalCollateralValue.toString(),
      debtValue: totalDebtValue.toString()
    };
  }

  /**
   * Convert Positions from Blend SDK to Position
   * @private
   * @param {Positions} positions - Positions from SDK
   * @param {string} address - User address
   * @returns {Position}
   */
  private convertPositionsToPosition(positions: Positions, address: string): Position {
    const supplied: PositionBalance[] = [];
    const borrowed: PositionBalance[] = [];

    // Convert collateral positions
    for (const [reserveId, amount] of positions.collateral) {
      if (amount > 0n) {
        supplied.push({
          asset: { type: 'credit_alphanum4', code: `R${reserveId}`, issuer: '' },
          amount: amount.toString(),
          valueUSD: '0'
        });
      }
    }

    // Convert supply positions (non-collateral)
    for (const [reserveId, amount] of positions.supply) {
      if (amount > 0n) {
        supplied.push({
          asset: { type: 'credit_alphanum4', code: `S${reserveId}`, issuer: '' },
          amount: amount.toString(),
          valueUSD: '0'
        });
      }
    }

    // Convert liability positions
    for (const [reserveId, amount] of positions.liabilities) {
      if (amount > 0n) {
        borrowed.push({
          asset: { type: 'credit_alphanum4', code: `D${reserveId}`, issuer: '' },
          amount: amount.toString(),
          valueUSD: '0'
        });
      }
    }

    return {
      address,
      supplied,
      borrowed,
      healthFactor: borrowed.length > 0 ? '0' : '∞',
      collateralValue: '0',
      debtValue: '0'
    };
  }

  /**
   * Parse liquidation result
   * @private
   * @param {rpc.Api.GetTransactionResponse} result - Transaction result
   * @returns {string} Collateral amount received
   */
  private parseLiquidationResult(
    _result: rpc.Api.GetTransactionResponse
  ): string {
    // In a real implementation, parse actual collateral received
    return '0';
  }

  /**
   * Parse health factor data from simulation result
   * @private
   * @param {unknown} simulation - Simulation or raw result
   * @returns {HealthFactor}
   */
  private parseHealthFactorData(simulation: unknown): HealthFactor {
    // In a real implementation, parse actual health factor from simulation result
    return {
      value: '0',
      liquidationThreshold: '0.85',
      maxLTV: '0.75',
      isHealthy: true
    };
  }
}
