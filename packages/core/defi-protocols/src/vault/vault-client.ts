/**
 * @fileoverview Yield Vault TypeScript client
 * @description Client for interacting with the YieldVault Soroban contract
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-05-30
 */

import {
  Contract,
  Keypair,
  TransactionBuilder,
  BASE_FEE,
  nativeToScVal,
  scValToNative,
  Address,
  rpc,
  xdr,
} from '@stellar/stellar-sdk';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Result returned by a successful withdrawal */
export interface WithdrawResult {
  /** Number of shares burned */
  sharesBurned: string;
  /** Underlying assets returned to the caller */
  assetsReturned: string;
}

/** Snapshot of vault state */
export interface VaultInfo {
  admin: string;
  asset: string;
  totalShares: string;
  totalAssets: string;
  lastHarvest: number;
}

/** Strategy allocation entry */
export interface StrategyAllocation {
  name: string;
  strategyType: 'Blend' | 'Soroswap';
  contractAddress: string;
  weightBps: number;
  active: boolean;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

/**
 * TypeScript client for the YieldVault Soroban contract.
 *
 * @example
 * ```ts
 * const client = new YieldVaultClient({
 *   contractId: 'C...',
 *   rpcUrl: 'https://soroban-testnet.stellar.org',
 *   networkPassphrase: Networks.TESTNET,
 * });
 *
 * const shares = await client.deposit(keypair, '1000');
 * const tvl    = await client.getTotalValueLocked();
 * ```
 */
export class YieldVaultClient {
  private readonly server: rpc.Server;
  private readonly contract: Contract;
  private readonly networkPassphrase: string;

  constructor(config: {
    contractId: string;
    rpcUrl: string;
    networkPassphrase: string;
  }) {
    this.server = new rpc.Server(config.rpcUrl);
    this.contract = new Contract(config.contractId);
    this.networkPassphrase = config.networkPassphrase;
  }

  // -------------------------------------------------------------------------
  // Core operations
  // -------------------------------------------------------------------------

  /**
   * Deposit `amount` of the underlying asset into the vault.
   *
   * @param keypair  - Signer / depositor keypair
   * @param amount   - Amount in stroops (string to avoid JS precision loss)
   * @returns Number of shares minted (as string)
   */
  async deposit(keypair: Keypair, amount: string): Promise<string> {
    const result = await this.invokeContract(keypair, 'deposit', [
      nativeToScVal(keypair.publicKey(), { type: 'address' }),
      nativeToScVal(BigInt(amount), { type: 'u64' }),
    ]);
    return String(scValToNative(result));
  }

  /**
   * Withdraw by burning `shares` and receiving the proportional underlying assets.
   *
   * @param keypair - Signer / owner keypair
   * @param shares  - Number of shares to burn (string)
   * @returns `WithdrawResult` with shares burned and assets returned
   */
  async withdraw(keypair: Keypair, shares: string): Promise<WithdrawResult> {
    const result = await this.invokeContract(keypair, 'withdraw', [
      nativeToScVal(keypair.publicKey(), { type: 'address' }),
      nativeToScVal(BigInt(shares), { type: 'u64' }),
    ]);
    const native = scValToNative(result) as { shares_burned: bigint; assets_returned: bigint };
    return {
      sharesBurned: String(native.shares_burned),
      assetsReturned: String(native.assets_returned),
    };
  }

  // -------------------------------------------------------------------------
  // View functions
  // -------------------------------------------------------------------------

  /**
   * Current value of one share in underlying asset units (scaled by 1e7).
   */
  async getShareValue(): Promise<number> {
    const result = await this.simulateContract('get_share_value', []);
    return Number(scValToNative(result));
  }

  /**
   * Total underlying assets managed by the vault (TVL).
   */
  async getTotalValueLocked(): Promise<number> {
    const result = await this.simulateContract('get_total_value_locked', []);
    return Number(scValToNative(result));
  }

  /**
   * Share balance of a specific address.
   */
  async getBalance(address: string): Promise<string> {
    const result = await this.simulateContract('get_balance', [
      nativeToScVal(address, { type: 'address' }),
    ]);
    return String(scValToNative(result));
  }

  /**
   * Full vault state snapshot.
   */
  async getVaultInfo(): Promise<VaultInfo> {
    const result = await this.simulateContract('get_vault_info', []);
    const native = scValToNative(result) as {
      admin: string;
      asset: string;
      total_shares: bigint;
      total_assets: bigint;
      last_harvest: bigint;
    };
    return {
      admin: native.admin,
      asset: native.asset,
      totalShares: String(native.total_shares),
      totalAssets: String(native.total_assets),
      lastHarvest: Number(native.last_harvest),
    };
  }

  /**
   * Current strategy allocations.
   */
  async getStrategies(): Promise<StrategyAllocation[]> {
    const result = await this.simulateContract('get_strategies', []);
    const native = scValToNative(result) as Array<{
      name: string;
      strategy_type: { tag: string };
      contract_address: string;
      weight_bps: number;
      active: boolean;
    }>;
    return native.map((s) => ({
      name: s.name,
      strategyType: s.strategy_type.tag as 'Blend' | 'Soroswap',
      contractAddress: s.contract_address,
      weightBps: s.weight_bps,
      active: s.active,
    }));
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  /** Simulate a read-only contract call and return the return value ScVal. */
  private async simulateContract(
    method: string,
    args: xdr.ScVal[],
  ): Promise<xdr.ScVal> {
    const account = await this.server.getAccount(
      // Use a dummy account for simulations – the server only needs a source
      'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
    );
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(this.contract.call(method, ...args))
      .setTimeout(30)
      .build();

    const sim = await this.server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
      throw new Error(`Simulation failed: ${sim.error}`);
    }
    const successSim = sim as rpc.Api.SimulateTransactionSuccessResponse;
    return successSim.result!.retval;
  }

  /** Build, sign, submit and wait for a state-changing contract call. */
  private async invokeContract(
    keypair: Keypair,
    method: string,
    args: xdr.ScVal[],
  ): Promise<xdr.ScVal> {
    const account = await this.server.getAccount(keypair.publicKey());
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(this.contract.call(method, ...args))
      .setTimeout(30)
      .build();

    const sim = await this.server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
      throw new Error(`Simulation failed: ${sim.error}`);
    }

    const prepared = rpc.assembleTransaction(tx, sim).build();
    prepared.sign(keypair);

    const sendResp = await this.server.sendTransaction(prepared);
    if (sendResp.status === 'ERROR') {
      throw new Error(`Transaction failed: ${sendResp.errorResult?.toXDR('base64')}`);
    }

    // Poll until final status
    let getResp = await this.server.getTransaction(sendResp.hash);
    while (getResp.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
      await new Promise((r) => setTimeout(r, 1000));
      getResp = await this.server.getTransaction(sendResp.hash);
    }

    if (getResp.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
      throw new Error(`Transaction not successful: ${getResp.status}`);
    }

    return (getResp as rpc.Api.GetSuccessfulTransactionResponse).returnValue!;
  }
}
