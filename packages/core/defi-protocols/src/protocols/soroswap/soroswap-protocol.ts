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
  Asset as StellarAsset,
  nativeToScVal,
  scValToNative,
  BASE_FEE,
  rpc
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
  SwapQuote,
  LiquidityPool
} from '../../types/defi-types.js';
import { PoolAnalytics } from '../../types/protocol-interface.js';
import { InvalidOperationError, UnsupportedOperationError, ContractError } from '../../errors/index.js';

import { SoroswapPairInfo } from './soroswap-types.js';
import {
  SoroswapPoolAnalytics,
  SoroswapPoolAnalyticsOptions,
  calculateSoroswapPoolAnalytics,
} from './analytics.js';
import { SOROSWAP_DEFAULT_FEE } from './soroswap-config.js';

/**
 * Simulation placeholder account (valid Ed25519 G-address)
 */
const SIMULATION_PLACEHOLDER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

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

  /** How long cached factory/pair reads stay fresh before being re-fetched on-chain */
  private static readonly CACHE_TTL_MS = 30_000;

  /** Max concurrent simulateTransaction calls when scanning pairs */
  private static readonly PAIR_READ_CONCURRENCY = 5;

  private allPairsCache: { value: string[]; expiresAt: number } | null = null;
  private readonly pairInfoCache = new Map<string, { value: SoroswapPairInfo; expiresAt: number }>();

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

    throw new UnsupportedOperationError(
      'getStats is not supported by Soroswap: protocol-wide TVL and volume require off-chain ' +
        'USD pricing that cannot be derived from on-chain contract reads alone. Use ' +
        'getPoolAnalytics()/getAllPoolsAnalytics() with token price options for per-pool TVL, ' +
        'or getAllPairs() to enumerate pools.',
      {
        protocolId: this.protocolId,
        operationType: 'getStats',
        reason: 'TVL/volume aggregation requires an external price oracle not available on-chain'
      }
    );
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
   * Load (or synthesize) a source account usable purely for read-only simulation.
   * No signing ever happens against this account — it only anchors the transaction envelope.
   */
  private async loadSimulationAccount(): Promise<any> {
    return this.horizonServer.loadAccount(SIMULATION_PLACEHOLDER).catch(() => ({
      accountId: () => SIMULATION_PLACEHOLDER,
      sequenceNumber: () => '0',
      incrementSequenceNumber: () => {},
      sequence: '0',
    } as any));
  }

  /** Simulate a single read-only contract call and return the raw simulation result. */
  private async simulateCall(
    sourceAccount: any,
    contract: Contract,
    method: string,
    ...args: ReturnType<typeof nativeToScVal>[]
  ): Promise<rpc.Api.SimulateTransactionResponse> {
    const op = contract.call(method, ...args);
    const tx = new TransactionBuilder(sourceAccount, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(30)
      .build();
    return this.sorobanServer.simulateTransaction(tx);
  }

  /**
   * Extract the return value from a simulation, throwing a {@link ContractError} if the
   * simulation failed or produced no result. This is the boundary that turns a failed
   * on-chain read into a real error instead of a silently-substituted zero.
   */
  private extractRetval(
    simulation: rpc.Api.SimulateTransactionResponse,
    method: string,
    contractAddress?: string
  ): NonNullable<rpc.Api.SimulateTransactionSuccessResponse['result']>['retval'] {
    if (!simulation || rpc.Api.isSimulationError(simulation)) {
      const reason = simulation && 'error' in simulation ? simulation.error : 'no simulation response';
      throw new ContractError(`Soroswap ${method} simulation failed: ${reason}`, {
        protocolId: this.protocolId,
        contractAddress,
        method,
      });
    }
    if (!('result' in simulation) || !simulation.result?.retval) {
      throw new ContractError(`Soroswap ${method} returned no result`, {
        protocolId: this.protocolId,
        contractAddress,
        method,
      });
    }
    return simulation.result.retval;
  }

  /**
   * Resolve one side of a pair contract (token_0/token_1) to a Galaxy Asset.
   * A failed simulation propagates as a {@link ContractError} — callers must not
   * receive a plausible-looking 'UNKN' placeholder in place of a real failure.
   */
  private async resolveTokenFromPair(
    sourceAccount: any,
    pairContract: Contract,
    method: 'token_0' | 'token_1'
  ): Promise<Asset> {
    const sim = await this.simulateCall(sourceAccount, pairContract, method);
    const addr = Address.fromScVal(this.extractRetval(sim, method)).toString();
    const nativeContractId = StellarAsset.native().contractId(this.networkPassphrase);
    if (addr === nativeContractId) {
      return { code: 'XLM', type: 'native' };
    }
    return {
      code: addr.slice(-4).toUpperCase(),
      issuer: addr,
      type: 'credit_alphanum4',
    };
  }

  /** Run `fn` over `items` with at most `concurrency` in flight at once. */
  private static async mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T, index: number) => Promise<R>
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let cursor = 0;
    const workerCount = Math.max(1, Math.min(concurrency, items.length));
    const workers = Array.from({ length: workerCount }, async () => {
      while (cursor < items.length) {
        const current = cursor++;
        results[current] = await fn(items[current], current);
      }
    });
    await Promise.all(workers);
    return results;
  }

  /** Order-independent cache key for a token pair. */
  private static pairCacheKey(tokenA: string, tokenB: string): string {
    return [tokenA, tokenB].sort().join(':');
  }

  /**
   * Get pair information for a token pair
   *
   * Resolves the pair address via the factory's `get_pair`, then reads reserves,
   * token addresses and LP supply directly from the pair contract. Results are cached
   * for {@link SoroswapProtocol.CACHE_TTL_MS} to avoid re-scanning on every call.
   *
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
      if (!tokenA || !tokenB) {
        throw new Error('Both tokenA and tokenB addresses are required');
      }

      const cacheKey = SoroswapProtocol.pairCacheKey(tokenA, tokenB);
      const cached = this.pairInfoCache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        return cached.value;
      }

      const sourceAccount = await this.loadSimulationAccount();

      const pairSim = await this.simulateCall(
        sourceAccount,
        this.factoryContract,
        'get_pair',
        new Address(tokenA).toScVal(),
        new Address(tokenB).toScVal()
      );
      const pairAddress = Address.fromScVal(this.extractRetval(pairSim, 'get_pair')).toString();

      const pairContract = new Contract(pairAddress);

      const [reservesSim, totalSupplySim, token0, token1] = await Promise.all([
        this.simulateCall(sourceAccount, pairContract, 'get_reserves'),
        this.simulateCall(sourceAccount, pairContract, 'total_supply'),
        this.resolveTokenFromPair(sourceAccount, pairContract, 'token_0'),
        this.resolveTokenFromPair(sourceAccount, pairContract, 'token_1'),
      ]);

      const reserves = scValToNative(
        this.extractRetval(reservesSim, 'get_reserves', pairAddress)
      ) as bigint[];
      if (!Array.isArray(reserves) || reserves.length < 2) {
        throw new Error('Unexpected return value from get_reserves');
      }

      const totalSupply = scValToNative(
        this.extractRetval(totalSupplySim, 'total_supply', pairAddress)
      ) as bigint;

      // Soroswap pairs charge a fixed protocol-wide swap fee (no per-pair override is
      // exposed on-chain), so SOROSWAP_DEFAULT_FEE reflects the real applied fee rather
      // than a stand-in.
      const pairInfo: SoroswapPairInfo = {
        pairAddress,
        token0,
        token1,
        reserve0: reserves[0].toString(),
        reserve1: reserves[1].toString(),
        totalSupply: totalSupply.toString(),
        fee: SOROSWAP_DEFAULT_FEE,
      };

      this.pairInfoCache.set(cacheKey, {
        value: pairInfo,
        expiresAt: Date.now() + SoroswapProtocol.CACHE_TTL_MS,
      });

      return pairInfo;
    } catch (error) {
      this.handleError(error, 'getPairInfo');
    }
  }

  /**
   * Get all registered pairs from the factory
   *
   * Reads `all_pairs_length` then fetches every `all_pairs(index)` in parallel
   * (bounded by {@link SoroswapProtocol.PAIR_READ_CONCURRENCY}). Results are cached for
   * {@link SoroswapProtocol.CACHE_TTL_MS} so repeated calls don't re-scan the factory.
   *
   * @returns {Promise<string[]>} Array of pair contract addresses
   */
  public async getAllPairs(): Promise<string[]> {
    this.ensureInitialized();

    try {
      if (!this.factoryContract) {
        throw new Error('Factory contract not initialized');
      }

      if (this.allPairsCache && Date.now() < this.allPairsCache.expiresAt) {
        return this.allPairsCache.value;
      }

      const sourceAccount = await this.loadSimulationAccount();

      const lengthSim = await this.simulateCall(sourceAccount, this.factoryContract, 'all_pairs_length');
      const length = Number(scValToNative(this.extractRetval(lengthSim, 'all_pairs_length')));

      const indices = Array.from({ length: Math.max(0, length) }, (_, i) => i);
      const pairs = await SoroswapProtocol.mapWithConcurrency(
        indices,
        SoroswapProtocol.PAIR_READ_CONCURRENCY,
        async (index) => {
          const sim = await this.simulateCall(
            sourceAccount,
            this.factoryContract!,
            'all_pairs',
            nativeToScVal(index, { type: 'u32' })
          );
          return Address.fromScVal(this.extractRetval(sim, 'all_pairs')).toString();
        }
      );

      this.allPairsCache = {
        value: pairs,
        expiresAt: Date.now() + SoroswapProtocol.CACHE_TTL_MS,
      };

      return pairs;
    } catch (error) {
      this.handleError(error, 'getAllPairs');
    }
  }

  // ========================================
  // DEX OPERATIONS
  // ========================================

  /** Default slippage tolerance (5%) applied to min amounts */
  private static readonly SLIPPAGE_TOLERANCE = 0.05;

  /** Stroops per lumen — Stellar uses 7 decimal places */
  private static readonly STROOPS_PER_UNIT = 10_000_000n;

  /**
   * Resolve a Galaxy Asset to its Soroban contract address.
   * Native XLM uses the Stellar Asset Contract (SAC) address derived from the
   * network passphrase. Non-native assets use the issuer address.
   */
  private resolveTokenAddress(asset: Asset): string {
    if (asset.type === 'native') {
      return StellarAsset.native().contractId(this.networkPassphrase);
    }
    return asset.issuer!;
  }

  /**
   * Convert a decimal amount string (e.g. "100.5") to an i128 ScVal in stroops.
   * Soroban token amounts are integers — 1 unit = 10_000_000 stroops.
   */
  private static amountToI128ScVal(amount: string): ReturnType<typeof nativeToScVal> {
    const stroops = BigInt(Math.round(parseFloat(amount) * 1e7));
    return nativeToScVal(stroops, { type: 'i128' });
  }

  /**
   * Execute a token swap
   * @param {string} walletAddress - Wallet public key
   * @param {string} privateKey - Wallet private key (unused — returns unsigned XDR)
   * @param {Asset} tokenIn - Source token
   * @param {Asset} tokenOut - Destination token
   * @param {string} amountIn - Amount of source token (decimal string)
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
    this.validateAmount(minAmountOut);

    try {
      if (!this.routerContract) {
        throw new Error('Router contract not initialized');
      }

      const tokenInAddress = this.resolveTokenAddress(tokenIn);
      const tokenOutAddress = this.resolveTokenAddress(tokenOut);

      // Deadline: 20 minutes from now (standard for DEX)
      const deadline = Math.floor(Date.now() / 1000) + 1200;

      // Soroswap path: [tokenIn, tokenOut]
      const path = [
        new Address(tokenInAddress).toScVal(),
        new Address(tokenOutAddress).toScVal()
      ];

      // Build the swap_exact_tokens_for_tokens invocation
      // Router signature: swap_exact_tokens_for_tokens(amount_in, amount_out_min, path, to, deadline)
      const swapOp = this.routerContract.call(
        'swap_exact_tokens_for_tokens',
        SoroswapProtocol.amountToI128ScVal(amountIn),
        SoroswapProtocol.amountToI128ScVal(minAmountOut),
        nativeToScVal(path),
        new Address(walletAddress).toScVal(),
        nativeToScVal(deadline, { type: 'u64' })
      );

      const sourceAccountAddress = walletAddress.startsWith('C') ? SIMULATION_PLACEHOLDER : walletAddress;
      const sourceAccount = await this.horizonServer.loadAccount(sourceAccountAddress).catch((error) => {
        if (walletAddress.startsWith('C')) {
          return {
            accountId: () => sourceAccountAddress,
            sequenceNumber: () => '0',
            incrementSequenceNumber: () => {},
            sequence: '0',
          } as any;
        }
        throw error;
      });
      const transaction = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(swapOp)
        .setTimeout(180)
        .build();

      const preparedTx = await this.sorobanServer.prepareTransaction(transaction);
      const xdr = preparedTx.toXDR();

      return this.buildTransactionResult(xdr, 'pending', 0, {
        operation: 'swap',
        tokenIn,
        tokenOut,
        amountIn,
        minAmountOut,
      });
    } catch (error) {
      this.handleError(error, 'swap');
    }
  }

  /**
   * Get a swap quote for a token pair
   * @param {Asset} tokenIn - Source token
   * @param {Asset} tokenOut - Destination token
   * @param {string} amountIn - Amount of source token (decimal string)
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
      if (!this.routerContract) {
        throw new Error('Router contract not initialized');
      }

      const tokenInAddress = this.resolveTokenAddress(tokenIn);
      const tokenOutAddress = this.resolveTokenAddress(tokenOut);

      // Soroswap path: [tokenIn, tokenOut]
      const path = [
        new Address(tokenInAddress).toScVal(),
        new Address(tokenOutAddress).toScVal()
      ];

      const getAmountsOutOp = this.routerContract.call(
        'get_amounts_out',
        SoroswapProtocol.amountToI128ScVal(amountIn),
        nativeToScVal(path)
      );

      // Simulation placeholder
      const sourceAccount = await this.horizonServer.loadAccount(SIMULATION_PLACEHOLDER).catch(() => ({
          accountId: () => SIMULATION_PLACEHOLDER,
          sequenceNumber: () => '0',
          incrementSequenceNumber: () => {},
          sequence: '0',
      } as any));

      const tx = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase: this.networkPassphrase,
      })
        .addOperation(getAmountsOutOp)
        .setTimeout(30)
        .build();

      const simulation = await this.sorobanServer.simulateTransaction(tx);

      if (rpc.Api.isSimulationError(simulation)) {
          throw new Error(`Swap quote simulation failed: ${simulation.error}`);
      }

      if (!('result' in simulation) || !simulation.result?.retval) {
          throw new Error('Invalid simulation result for swap quote');
      }

      // get_amounts_out returns a Vec<i128> [amountIn, amountOut]
      const amounts = scValToNative(simulation.result.retval) as bigint[];
      if (!Array.isArray(amounts) || amounts.length < 2) {
          throw new Error('Unexpected return value from get_amounts_out');
      }

      const amountOutRaw = amounts[1];
      const amountOut = new BigNumber(amountOutRaw.toString()).dividedBy(1e7).toFixed(7);
      const minimumReceived = new BigNumber(amountOut)
        .multipliedBy(1 - SoroswapProtocol.SLIPPAGE_TOLERANCE)
        .toFixed(7);
      const liquidityPool = await this.getLiquidityPool(tokenIn, tokenOut);
      const reserveIn = new BigNumber(liquidityPool.reserveA).dividedBy(1e7);
      const priceImpact = reserveIn.isZero()
        ? '0'
        : new BigNumber(amountIn)
            .dividedBy(reserveIn.plus(amountIn))
            .multipliedBy(100)
            .decimalPlaces(4)
            .toFixed();

      return {
        tokenIn,
        tokenOut,
        amountIn,
        amountOut,
        priceImpact,
        minimumReceived,
        path: [tokenInAddress, tokenOutAddress],
        validUntil: new Date(Date.now() + 60000) // 1 minute validity
      };
    } catch (error) {
      this.handleError(error, 'getSwapQuote');
    }
  }

  /**
   * Add liquidity to a Soroswap pool
   * @param {string} walletAddress - Wallet public key
   * @param {string} privateKey - Wallet private key (unused — returns unsigned XDR)
   * @param {Asset} tokenA - First token of the pair
   * @param {Asset} tokenB - Second token of the pair
   * @param {string} amountA - Desired amount of tokenA to add (decimal, e.g. "100.5")
   * @param {string} amountB - Desired amount of tokenB to add (decimal, e.g. "200")
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

      // Compute min amounts (decimal strings) with 5% slippage protection
      const amountAMin = (parseFloat(amountA) * (1 - SoroswapProtocol.SLIPPAGE_TOLERANCE)).toFixed(7);
      const amountBMin = (parseFloat(amountB) * (1 - SoroswapProtocol.SLIPPAGE_TOLERANCE)).toFixed(7);

      // Resolve Soroban contract addresses (native XLM uses SAC address)
      const tokenAAddress = this.resolveTokenAddress(tokenA);
      const tokenBAddress = this.resolveTokenAddress(tokenB);

      // Deadline: 30 minutes from now
      const deadline = Math.floor(Date.now() / 1000) + 1800;

      // Build the add_liquidity invocation
      // Router signature: add_liquidity(token_a, token_b, amount_a_desired, amount_b_desired,
      //                                 amount_a_min, amount_b_min, to, deadline)
      const addLiquidityOp = this.routerContract.call(
        'add_liquidity',
        new Address(tokenAAddress).toScVal(),
        new Address(tokenBAddress).toScVal(),
        SoroswapProtocol.amountToI128ScVal(amountA),
        SoroswapProtocol.amountToI128ScVal(amountB),
        SoroswapProtocol.amountToI128ScVal(amountAMin),
        SoroswapProtocol.amountToI128ScVal(amountBMin),
        new Address(walletAddress).toScVal(),
        nativeToScVal(deadline, { type: 'u64' })
      );

      // Load the source account and assemble the transaction
      const sourceAccountAddress = walletAddress.startsWith('C') ? SIMULATION_PLACEHOLDER : walletAddress;
      const sourceAccount = await this.horizonServer.loadAccount(sourceAccountAddress).catch((error) => {
          if (walletAddress.startsWith('C')) {
            return {
              accountId: () => sourceAccountAddress,
              sequenceNumber: () => '0',
              incrementSequenceNumber: () => {},
              sequence: '0',
            } as any;
          }
          throw error;
      });
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
   * @param {Asset} tokenA - First token of the pair
   * @param {Asset} tokenB - Second token of the pair
   * @param {string} poolAddress - LP token / pair contract address
   * @param {string} liquidity - Amount of LP tokens to burn (decimal)
   * @param {string} [amountAMin] - Min tokenA to receive; defaults to 5% slippage on liquidity
   * @param {string} [amountBMin] - Min tokenB to receive; defaults to 5% slippage on liquidity
   * @returns {Promise<TransactionResult>} Unsigned XDR transaction (status: pending)
   */
  public async removeLiquidity(
    walletAddress: string,
    privateKey: string,
    tokenA: Asset,
    tokenB: Asset,
    poolAddress: string,
    liquidity: string,
    amountAMin?: string,
    amountBMin?: string
  ): Promise<TransactionResult> {
    this.ensureInitialized();
    this.validateAddress(walletAddress);
    this.validateAsset(tokenA);
    this.validateAsset(tokenB);
    if (!poolAddress) {
      throw new Error('Invalid pool address');
    }
    this.validateAmount(liquidity);

    try {
      if (!this.routerContract) {
        throw new Error('Router contract not initialized');
      }

      // Default min amounts to 5% slippage of the liquidity amount if not provided
      const slippageFactor = 1 - SoroswapProtocol.SLIPPAGE_TOLERANCE;
      const resolvedAmountAMin = amountAMin ?? (parseFloat(liquidity) * slippageFactor).toFixed(7);
      const resolvedAmountBMin = amountBMin ?? (parseFloat(liquidity) * slippageFactor).toFixed(7);

      // Deadline: 30 minutes from now
      const deadline = Math.floor(Date.now() / 1000) + 1800;

      // Resolve Soroban contract addresses
      const tokenAAddress = this.resolveTokenAddress(tokenA);
      const tokenBAddress = this.resolveTokenAddress(tokenB);

      // Build the remove_liquidity invocation
      // Router signature: remove_liquidity(token_a, token_b, liquidity,
      //                                    amount_a_min, amount_b_min, to, deadline)
      const removeLiquidityOp = this.routerContract.call(
        'remove_liquidity',
        new Address(tokenAAddress).toScVal(),
        new Address(tokenBAddress).toScVal(),
        SoroswapProtocol.amountToI128ScVal(liquidity),
        SoroswapProtocol.amountToI128ScVal(resolvedAmountAMin),
        SoroswapProtocol.amountToI128ScVal(resolvedAmountBMin),
        new Address(walletAddress).toScVal(),
        nativeToScVal(deadline, { type: 'u64' })
      );

      // Load source account and build the transaction
      const sourceAccountAddress = walletAddress.startsWith('C') ? SIMULATION_PLACEHOLDER : walletAddress;
      const sourceAccount = await this.horizonServer.loadAccount(sourceAccountAddress).catch((error) => {
          if (walletAddress.startsWith('C')) {
            return {
              accountId: () => sourceAccountAddress,
              sequenceNumber: () => '0',
              incrementSequenceNumber: () => {},
              sequence: '0',
            } as any;
          }
          throw error;
      });
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
        tokenA,
        tokenB,
        poolAddress,
        liquidity,
        amountAMin: resolvedAmountAMin,
        amountBMin: resolvedAmountBMin,
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

      // Resolve Soroban contract addresses (native XLM uses SAC address)
      const tokenAAddress = this.resolveTokenAddress(tokenA);
      const tokenBAddress = this.resolveTokenAddress(tokenB);

      const sourceAccount = await this.loadSimulationAccount();

      const pairSim = await this.simulateCall(
        sourceAccount,
        this.factoryContract,
        'get_pair',
        new Address(tokenAAddress).toScVal(),
        new Address(tokenBAddress).toScVal()
      );
      const pairAddress = Address.fromScVal(this.extractRetval(pairSim, 'get_pair')).toString();

      const pairContract = new Contract(pairAddress);
      const reserveSim = await this.simulateCall(sourceAccount, pairContract, 'get_reserves');
      const native = scValToNative(
        this.extractRetval(reserveSim, 'get_reserves', pairAddress)
      ) as bigint[];
      if (!Array.isArray(native) || native.length < 3) {
        throw new Error('Unexpected return value from get_reserves');
      }

      return {
        address: pairAddress,
        tokenA,
        tokenB,
        reserveA: native[0].toString(),
        reserveB: native[1].toString(),
        totalLiquidity: native[2].toString(),
        fee: SOROSWAP_DEFAULT_FEE,
      };
    } catch (error) {
      this.handleError(error, 'getLiquidityPool');
    }
  }

  // ========================================
  // POOL ANALYTICS
  // ========================================

  /**
   * Get analytics for a specific liquidity pool.
   *
   * Queries the pair contract directly for reserves and token addresses,
   * then derives spot prices from the constant-product AMM formula.
   * TVL and 24h-volume fields require an external oracle / event indexer
   * and are returned as 0 until that data source is wired in.
   *
   * @param {string} poolAddress - Pair/pool contract address
   * @returns {Promise<PoolAnalytics>}
   */
  public async getPoolAnalytics(
    poolAddress: string,
    options: SoroswapPoolAnalyticsOptions = {}
  ): Promise<SoroswapPoolAnalytics> {
    this.ensureInitialized();

    if (!poolAddress) {
      throw new Error('Pool address is required');
    }

    try {
      const sourceAccount = await this.loadSimulationAccount();
      const pairContract = new Contract(poolAddress);

      // ---- Reserves -------------------------------------------------------
      const reserveSim = await this.simulateCall(sourceAccount, pairContract, 'get_reserves');
      const native = scValToNative(
        this.extractRetval(reserveSim, 'get_reserves', poolAddress)
      ) as bigint[];
      if (!Array.isArray(native) || native.length < 2) {
        throw new Error('Unexpected return value from get_reserves');
      }
      const reserve0 = native[0] ?? 0n;
      const reserve1 = native[1] ?? 0n;
      const totalSupply = native[2] ?? 0n;

      // ---- Token addresses --------------------------------------------------
      const [token0, token1] = await Promise.all([
        this.resolveTokenFromPair(sourceAccount, pairContract, 'token_0'),
        this.resolveTokenFromPair(sourceAccount, pairContract, 'token_1'),
      ]);

      return calculateSoroswapPoolAnalytics({
        poolAddress,
        token0,
        token1,
        reserve0,
        reserve1,
        totalSupply,
        options,
      });
    } catch (error) {
      this.handleError(error, 'getPoolAnalytics');
    }
  }

  /**
   * Get analytics for all registered liquidity pools.
   *
   * Fetches the list of known pair addresses from the factory contract via
   * {@link getAllPairs} and resolves each pool's analytics in parallel.
   * Pools whose analytics cannot be fetched are silently omitted.
   *
   * @returns {Promise<PoolAnalytics[]>}
   */
  public async getAllPoolsAnalytics(
    options: SoroswapPoolAnalyticsOptions = {}
  ): Promise<SoroswapPoolAnalytics[]> {
    this.ensureInitialized();

    try {
      const pairs = await this.getAllPairs();

      const results = await Promise.allSettled(
        pairs.map(pairAddress => this.getPoolAnalytics(pairAddress, options))
      );

      return results
        .filter((r): r is PromiseFulfilledResult<SoroswapPoolAnalytics> => r.status === 'fulfilled')
        .map(r => r.value);
    } catch (error) {
      this.handleError(error, 'getAllPoolsAnalytics');
    }
  }
}
