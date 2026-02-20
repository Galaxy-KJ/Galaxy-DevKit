/**
 * @fileoverview Soroswap Protocol implementation for Stellar
 * @description Complete implementation of Soroswap DEX protocol integration
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-01-30
 */

import {
  Contract,
  TransactionBuilder,
  Address,
  nativeToScVal,
  BASE_FEE,
  rpc
} from '@stellar/stellar-sdk';

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
  SwapQuote,
  LiquidityPool
} from '../../types/defi-types.js';
import { InvalidOperationError } from '../../errors/index.js';

import { SoroswapPairInfo } from './soroswap-types.js';
import { SOROSWAP_DEFAULT_FEE } from './soroswap-config.js';

/**
 * Soroswap Protocol implementation
 * @class SoroswapProtocol
 * @extends BaseProtocol
 * @description Implements Soroswap DEX protocol operations on Stellar
 */
export class SoroswapProtocol extends BaseProtocol {
  private sorobanServer: rpc.Server;
  private routerContract: Contract | null = null;
  private factoryContract: Contract | null = null;

  /**
   * Constructor
   * @param {ProtocolConfig} config - Protocol configuration
   */
  constructor(config: ProtocolConfig) {
    super(config);
    this.sorobanServer = new rpc.Server(this.sorobanRpcUrl);
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
   * Setup protocol-specific initialization
   * @protected
   * @returns {Promise<void>}
   */
  protected async setupProtocol(): Promise<void> {
    try {
      // Initialize router contract
      const routerAddress = this.getContractAddress('router');
      this.routerContract = new Contract(routerAddress);

      // Initialize factory contract
      const factoryAddress = this.getContractAddress('factory');
      this.factoryContract = new Contract(factoryAddress);
    } catch (error) {
      throw new Error(`Failed to setup Soroswap Protocol: ${error}`);
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
      // In a real implementation, aggregate stats from factory/pairs
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
  // LENDING OPERATIONS (Not supported by DEX)
  // ========================================

  /**
   * Supply assets — not supported by DEX protocols
   * @throws {InvalidOperationError}
   */
  public async supply(
    walletAddress: string,
    privateKey: string,
    asset: Asset,
    amount: string
  ): Promise<TransactionResult> {
    throw new InvalidOperationError(
      'Supply is not supported by Soroswap. Soroswap is a DEX protocol — use addLiquidity() instead.',
      {
        protocolId: this.protocolId,
        operationType: 'supply',
        reason: 'DEX protocols do not support lending operations'
      }
    );
  }

  /**
   * Borrow assets — not supported by DEX protocols
   * @throws {InvalidOperationError}
   */
  public async borrow(
    walletAddress: string,
    privateKey: string,
    asset: Asset,
    amount: string
  ): Promise<TransactionResult> {
    throw new InvalidOperationError(
      'Borrow is not supported by Soroswap. Soroswap is a DEX protocol, not a lending protocol.',
      {
        protocolId: this.protocolId,
        operationType: 'borrow',
        reason: 'DEX protocols do not support lending operations'
      }
    );
  }

  /**
   * Repay assets — not supported by DEX protocols
   * @throws {InvalidOperationError}
   */
  public async repay(
    walletAddress: string,
    privateKey: string,
    asset: Asset,
    amount: string
  ): Promise<TransactionResult> {
    throw new InvalidOperationError(
      'Repay is not supported by Soroswap. Soroswap is a DEX protocol, not a lending protocol.',
      {
        protocolId: this.protocolId,
        operationType: 'repay',
        reason: 'DEX protocols do not support lending operations'
      }
    );
  }

  /**
   * Withdraw assets — not supported by DEX protocols
   * @throws {InvalidOperationError}
   */
  public async withdraw(
    walletAddress: string,
    privateKey: string,
    asset: Asset,
    amount: string
  ): Promise<TransactionResult> {
    throw new InvalidOperationError(
      'Withdraw is not supported by Soroswap. Soroswap is a DEX protocol — use removeLiquidity() instead.',
      {
        protocolId: this.protocolId,
        operationType: 'withdraw',
        reason: 'DEX protocols do not support lending operations'
      }
    );
  }

  // ========================================
  // POSITION MANAGEMENT (Not applicable to DEX)
  // ========================================

  /**
   * Get position — not applicable to DEX protocols
   * @throws {InvalidOperationError}
   */
  public async getPosition(address: string): Promise<Position> {
    throw new InvalidOperationError(
      'getPosition is not supported by Soroswap. Soroswap is a DEX protocol — use getLiquidityPool() to check pool positions.',
      {
        protocolId: this.protocolId,
        operationType: 'getPosition',
        reason: 'DEX protocols do not have lending positions'
      }
    );
  }

  /**
   * Get health factor — not applicable to DEX protocols
   * @throws {InvalidOperationError}
   */
  public async getHealthFactor(address: string): Promise<HealthFactor> {
    throw new InvalidOperationError(
      'getHealthFactor is not supported by Soroswap. Health factors are a lending protocol concept.',
      {
        protocolId: this.protocolId,
        operationType: 'getHealthFactor',
        reason: 'DEX protocols do not have health factors'
      }
    );
  }

  // ========================================
  // PROTOCOL INFORMATION (Lending-specific)
  // ========================================

  /**
   * Get supply APY — not applicable to DEX protocols
   * @throws {InvalidOperationError}
   */
  public async getSupplyAPY(asset: Asset): Promise<APYInfo> {
    throw new InvalidOperationError(
      'getSupplyAPY is not supported by Soroswap. Supply APY is a lending protocol concept.',
      {
        protocolId: this.protocolId,
        operationType: 'getSupplyAPY',
        reason: 'DEX protocols do not have supply APY'
      }
    );
  }

  /**
   * Get borrow APY — not applicable to DEX protocols
   * @throws {InvalidOperationError}
   */
  public async getBorrowAPY(asset: Asset): Promise<APYInfo> {
    throw new InvalidOperationError(
      'getBorrowAPY is not supported by Soroswap. Borrow APY is a lending protocol concept.',
      {
        protocolId: this.protocolId,
        operationType: 'getBorrowAPY',
        reason: 'DEX protocols do not have borrow APY'
      }
    );
  }

  /**
   * Get total supply — not applicable to DEX protocols
   * @throws {InvalidOperationError}
   */
  public async getTotalSupply(asset: Asset): Promise<string> {
    throw new InvalidOperationError(
      'getTotalSupply is not supported by Soroswap. Use getPairInfo() to get pool reserves.',
      {
        protocolId: this.protocolId,
        operationType: 'getTotalSupply',
        reason: 'DEX protocols do not have total supply in the lending sense'
      }
    );
  }

  /**
   * Get total borrow — not applicable to DEX protocols
   * @throws {InvalidOperationError}
   */
  public async getTotalBorrow(asset: Asset): Promise<string> {
    throw new InvalidOperationError(
      'getTotalBorrow is not supported by Soroswap. DEX protocols do not have borrowing.',
      {
        protocolId: this.protocolId,
        operationType: 'getTotalBorrow',
        reason: 'DEX protocols do not have total borrow'
      }
    );
  }

  // ========================================
  // DEX HELPER METHODS
  // ========================================

  /**
   * Get pair information for a token pair
   * @param {string} tokenA - First token contract address
   * @param {string} tokenB - Second token contract address
   * @returns {Promise<SoroswapPairInfo>} Pair information
   */
  public async getPairInfo(tokenA: string, tokenB: string): Promise<SoroswapPairInfo> {
    this.ensureInitialized();

    try {
      if (!this.factoryContract) {
        throw new Error('Factory contract not initialized');
      }

      // In a real implementation, query the factory contract for pair address
      // then query the pair contract for reserves and supply
      // For now, return placeholder data
      return {
        pairAddress: '',
        token0: { code: tokenA, type: 'credit_alphanum4' },
        token1: { code: tokenB, type: 'credit_alphanum4' },
        reserve0: '0',
        reserve1: '0',
        totalSupply: '0',
        fee: SOROSWAP_DEFAULT_FEE
      };
    } catch (error) {
      this.handleError(error, 'getPairInfo');
    }
  }

  /**
   * Get all registered pairs from the factory
   * @returns {Promise<string[]>} Array of pair contract addresses
   */
  public async getAllPairs(): Promise<string[]> {
    this.ensureInitialized();

    try {
      if (!this.factoryContract) {
        throw new Error('Factory contract not initialized');
      }

      // In a real implementation, query the factory for all pairs
      // For now, return empty array as placeholder
      return [];
    } catch (error) {
      this.handleError(error, 'getAllPairs');
    }
  }

  // ========================================
  // DEX OPERATIONS
  // ========================================

  /** Default slippage tolerance (5%) applied to min amounts */
  private static readonly SLIPPAGE_TOLERANCE = 0.05;

  /**
   * Execute a token swap
   * @stub Implementation planned for issue #27
   * @throws {Error} Not yet implemented
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
    this.validateAmount(minAmountOut);

    // TODO: Implement in issue #27
    throw new Error('swap() is not yet implemented. See issue #27 for tracking.');
  }

  /**
   * Get a swap quote for a token pair
   * @stub Implementation planned for issue #28
   * @throws {Error} Not yet implemented
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

    // TODO: Implement in issue #28
    throw new Error('getSwapQuote() is not yet implemented. See issue #28 for tracking.');
  }

  /**
   * Add liquidity to a Soroswap pool
   * @param {string} walletAddress - Wallet public key
   * @param {string} privateKey - Wallet private key (unused — returns unsigned XDR)
   * @param {Asset} tokenA - First token of the pair
   * @param {Asset} tokenB - Second token of the pair
   * @param {string} amountA - Desired amount of tokenA to add
   * @param {string} amountB - Desired amount of tokenB to add
   * @returns {Promise<TransactionResult>} Unsigned XDR transaction (status: pending)
   */
  public async addLiquidity(
    walletAddress: string,
    privateKey: string,
    tokenA: Asset,
    tokenB: Asset,
    amountA: string,
    amountB: string
  ): Promise<TransactionResult> {
    this.ensureInitialized();
    this.validateAddress(walletAddress);
    this.validateAsset(tokenA);
    this.validateAsset(tokenB);
    this.validateAmount(amountA);
    this.validateAmount(amountB);

    try {
      if (!this.routerContract) {
        throw new Error('Router contract not initialized');
      }

      // Compute min amounts with slippage protection
      const amountAMin = (parseFloat(amountA) * (1 - SoroswapProtocol.SLIPPAGE_TOLERANCE)).toFixed(7);
      const amountBMin = (parseFloat(amountB) * (1 - SoroswapProtocol.SLIPPAGE_TOLERANCE)).toFixed(7);

      // Resolve token addresses
      const tokenAAddress = tokenA.issuer ?? tokenA.code;
      const tokenBAddress = tokenB.issuer ?? tokenB.code;

      // Deadline: 30 minutes from now
      const deadline = Math.floor(Date.now() / 1000) + 1800;

      // Build the add_liquidity invocation
      const addLiquidityOp = this.routerContract.call(
        'add_liquidity',
        new Address(tokenAAddress).toScVal(),
        new Address(tokenBAddress).toScVal(),
        nativeToScVal(amountA, { type: 'i128' }),
        nativeToScVal(amountB, { type: 'i128' }),
        nativeToScVal(amountAMin, { type: 'i128' }),
        nativeToScVal(amountBMin, { type: 'i128' }),
        new Address(walletAddress).toScVal(),
        nativeToScVal(deadline, { type: 'u64' })
      );

      // Load the source account and assemble the transaction
      const sourceAccount = await this.horizonServer.loadAccount(walletAddress);
      const transaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(addLiquidityOp)
        .setTimeout(180)
        .build();

      // Prepare (simulate + assemble) to get the final unsigned XDR
      const preparedTx = await this.sorobanServer.prepareTransaction(transaction);
      const xdr = preparedTx.toXDR();

      return this.buildTransactionResult(xdr, 'pending', 0, {
        operation: 'addLiquidity',
        tokenA,
        tokenB,
        amountA,
        amountB,
        amountAMin,
        amountBMin,
      });
    } catch (error) {
      this.handleError(error, 'addLiquidity');
    }
  }

  /**
   * Remove liquidity from a Soroswap pool
   * @param {string} walletAddress - Wallet public key
   * @param {string} privateKey - Wallet private key (unused — returns unsigned XDR)
   * @param {string} poolAddress - LP token / pool contract address
   * @param {string} liquidity - Amount of LP tokens to burn
   * @returns {Promise<TransactionResult>} Unsigned XDR transaction (status: pending)
   */
  public async removeLiquidity(
    walletAddress: string,
    privateKey: string,
    poolAddress: string,
    liquidity: string
  ): Promise<TransactionResult> {
    this.ensureInitialized();
    this.validateAddress(walletAddress);
    this.validateAddress(poolAddress);
    this.validateAmount(liquidity);

    try {
      if (!this.routerContract) {
        throw new Error('Router contract not initialized');
      }

      // Deadline: 30 minutes from now
      const deadline = Math.floor(Date.now() / 1000) + 1800;

      // Min amounts default to 0 — caller can tighten if reserves are known
      const amountAMin = '0';
      const amountBMin = '0';

      // Build the remove_liquidity invocation
      const removeLiquidityOp = this.routerContract.call(
        'remove_liquidity',
        new Address(poolAddress).toScVal(),
        nativeToScVal(liquidity, { type: 'i128' }),
        nativeToScVal(amountAMin, { type: 'i128' }),
        nativeToScVal(amountBMin, { type: 'i128' }),
        new Address(walletAddress).toScVal(),
        nativeToScVal(deadline, { type: 'u64' })
      );

      // Load source account and build the transaction
      const sourceAccount = await this.horizonServer.loadAccount(walletAddress);
      const transaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(removeLiquidityOp)
        .setTimeout(180)
        .build();

      // Prepare to get the final unsigned XDR
      const preparedTx = await this.sorobanServer.prepareTransaction(transaction);
      const xdr = preparedTx.toXDR();

      return this.buildTransactionResult(xdr, 'pending', 0, {
        operation: 'removeLiquidity',
        poolAddress,
        liquidity,
      });
    } catch (error) {
      this.handleError(error, 'removeLiquidity');
    }
  }

  /**
   * Get liquidity pool information for a token pair
   * @param {Asset} tokenA - First token of the pair
   * @param {Asset} tokenB - Second token of the pair
   * @returns {Promise<LiquidityPool>} Pool information including reserves and fee
   */
  public async getLiquidityPool(
    tokenA: Asset,
    tokenB: Asset
  ): Promise<LiquidityPool> {
    this.ensureInitialized();
    this.validateAsset(tokenA);
    this.validateAsset(tokenB);

    try {
      if (!this.factoryContract) {
        throw new Error('Factory contract not initialized');
      }

      // Resolve token addresses (use issuer for non-native assets, code for native)
      const tokenAAddress = tokenA.issuer ?? tokenA.code;
      const tokenBAddress = tokenB.issuer ?? tokenB.code;

      // Build the get_pair call on the factory contract
      const getPairOp = this.factoryContract.call(
        'get_pair',
        new Address(tokenAAddress).toScVal(),
        new Address(tokenBAddress).toScVal()
      );

      // Use a fixed placeholder address for simulation — no signing is needed
      const SIMULATION_PLACEHOLDER = 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN';
      const sourceAccount = await this.horizonServer.loadAccount(SIMULATION_PLACEHOLDER).catch(() => {
        // If account not found on network, create a minimal object for simulation
        return {
          accountId: () => SIMULATION_PLACEHOLDER,
          sequenceNumber: () => '0',
          incrementSequenceNumber: () => {},
          sequence: '0',
        } as any;
      });

      const tx = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(getPairOp)
        .setTimeout(30)
        .build();

      // Simulate to retrieve the pair address
      const simulation = await this.sorobanServer.simulateTransaction(tx);

      let pairAddress = '';
      if (
        simulation &&
        !rpc.Api.isSimulationError(simulation) &&
        'result' in simulation &&
        simulation.result
      ) {
        // Extract string address from ScVal result
        const resultVal = simulation.result.retval;
        if (resultVal && 'address' in resultVal) {
          pairAddress = (resultVal as any).address?.toString() ?? '';
        }
      }

      // Query reserves from the pair contract if we have a valid address
      let reserveA = '0';
      let reserveB = '0';
      let totalLiquidity = '0';

      if (pairAddress) {
        const pairContract = new Contract(pairAddress);
        const getReservesOp = pairContract.call('get_reserves');

        const reserveTx = new TransactionBuilder(sourceAccount, {
          fee: BASE_FEE,
          networkPassphrase: this.networkPassphrase,
        })
          .addOperation(getReservesOp)
          .setTimeout(30)
          .build();

        const reserveSim = await this.sorobanServer.simulateTransaction(reserveTx);

        if (
          reserveSim &&
          !rpc.Api.isSimulationError(reserveSim) &&
          'result' in reserveSim &&
          reserveSim.result
        ) {
          const resultVal = reserveSim.result.retval as any;
          if (resultVal && Array.isArray(resultVal.vec)) {
            reserveA = resultVal.vec[0]?.toString() ?? '0';
            reserveB = resultVal.vec[1]?.toString() ?? '0';
            totalLiquidity = resultVal.vec[2]?.toString() ?? '0';
          }
        }
      }

      return {
        address: pairAddress,
        tokenA,
        tokenB,
        reserveA,
        reserveB,
        totalLiquidity,
        fee: SOROSWAP_DEFAULT_FEE,
      };
    } catch (error) {
      this.handleError(error, 'getLiquidityPool');
    }
  }
}
