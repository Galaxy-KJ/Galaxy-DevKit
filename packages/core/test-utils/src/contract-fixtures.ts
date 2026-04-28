/**
 * @fileoverview Contract deployment fixtures
 * @description Reusable fixtures for deploying, invoking, and introspecting
 *   Soroban smart contracts in integration tests.
 *
 * Design notes
 * ─────────────
 * • `ContractFixture` is a lightweight wrapper around the raw Soroban RPC calls
 *   so that tests stay readable and don't duplicate boilerplate.
 * • `FixtureRegistry` is a keyed store that lets a globalSetup phase deploy
 *   contracts once and share their IDs across many test suites.
 * • `WasmStore` provides a tiny in-memory cache so the same WASM binary is not
 *   uploaded multiple times across fixtures that share a deployer account.
 *
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2025-04-28
 */

import {
  Keypair,
  rpc,
  TransactionBuilder,
  BASE_FEE,
  Contract,
  xdr,
  Address,
} from '@stellar/stellar-sdk';
import type { Transaction } from '@stellar/stellar-sdk';
import {
  resolveConfig,
  submitAndVerifyTransaction,
  pollForTransaction,
  createRpcServer,
  type TestnetConfig,
  type SubmitResult,
} from './testnet-helpers';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Params required to deploy a new Soroban contract. */
export interface DeployParams {
  /** Compiled WASM bytes. */
  wasm: Buffer;
  /** Keypair that pays for + authorises the deployment. */
  deployer: Keypair;
  /**
   * Optional 32-byte salt for deterministic contract IDs.
   * Defaults to a random buffer when omitted.
   */
  salt?: Buffer;
  /** Config overrides forwarded to the RPC helpers. */
  config?: TestnetConfig;
}

/** Result returned after a successful contract deployment. */
export interface DeployResult {
  /** Bech32-encoded Soroban contract ID. */
  contractId: string;
  /** Hash of the deployment transaction. */
  transactionHash: string;
  /** Ledger at which the deployment was confirmed. */
  ledger: number;
  /** Hex-encoded WASM hash of the uploaded bytecode. */
  wasmHash: string;
}

/** Params for calling a contract method in a test. */
export interface InvokeParams {
  /** Method (function) name to call. */
  method: string;
  /** Positional ScVal arguments. */
  args?: xdr.ScVal[];
  /** Keypair that signs and submits the invocation. */
  caller: Keypair;
  /** If `true`, only simulate — do not broadcast. */
  simulateOnly?: boolean;
  /** Config overrides. */
  config?: TestnetConfig;
}

/** Outcome of a contract invocation. */
export interface InvokeResult extends SubmitResult {
  /** Decoded return value from the contract call, if available. */
  decoded?: unknown;
}

// ─── WasmStore ────────────────────────────────────────────────────────────────

/**
 * Simple in-memory WASM cache keyed by hex-encoded SHA-256 of the bytes.
 *
 * Prevents uploading the same binary more than once when multiple fixtures
 * reuse the same contract (e.g. the token contract used across DeFi tests).
 */
export class WasmStore {
  private readonly cache = new Map<string, string>(); // sha256hex → wasmHash

  private hexSha256(buf: Buffer): string {
    // Fast-path: use crypto if available (Node ≥ 15)
    try {
      const { createHash } = require('crypto') as typeof import('crypto');
      return createHash('sha256').update(buf).digest('hex');
    } catch {
      // Fallback — deterministic string from first/last bytes
      return `${buf.length}_${buf[0]}_${buf[buf.length - 1]}`;
    }
  }

  /** Returns `true` if the binary has already been uploaded. */
  has(wasm: Buffer): boolean {
    return this.cache.has(this.hexSha256(wasm));
  }

  /** Record the RPC WASM hash for a given binary. */
  set(wasm: Buffer, wasmHash: string): void {
    this.cache.set(this.hexSha256(wasm), wasmHash);
  }

  /** Retrieve the stored RPC hash, or `undefined` if not cached. */
  get(wasm: Buffer): string | undefined {
    return this.cache.get(this.hexSha256(wasm));
  }

  /** Clear all cached entries. */
  clear(): void {
    this.cache.clear();
  }
}

// ─── ContractFixture ──────────────────────────────────────────────────────────

/**
 * Encapsulates a deployed Soroban contract for use in integration tests.
 *
 * @example
 * ```ts
 * const fixture = await ContractFixture.deploy({
 *   wasm: fs.readFileSync('./token.wasm'),
 *   deployer: myKeypair,
 * });
 *
 * const result = await fixture.invoke({
 *   method: 'balance',
 *   args: [new Address(wallet.publicKey()).toScVal()],
 *   caller: myKeypair,
 * });
 * ```
 */
export class ContractFixture {
  private readonly server: rpc.Server;
  private readonly resolvedConfig: Required<TestnetConfig>;

  /** The on-chain contract ID of this fixture. */
  readonly contractId: string;

  /** Hex WASM hash as recorded on-chain. */
  readonly wasmHash: string;

  /** Transaction hash of the deployment. */
  readonly deployTxHash: string;

  /** Ledger at which the contract was deployed. */
  readonly ledger: number;

  private constructor(
    deployResult: DeployResult,
    server: rpc.Server,
    config: Required<TestnetConfig>
  ) {
    this.contractId = deployResult.contractId;
    this.wasmHash = deployResult.wasmHash;
    this.deployTxHash = deployResult.transactionHash;
    this.ledger = deployResult.ledger;
    this.server = server;
    this.resolvedConfig = config;
  }

  // ── Static factory ─────────────────────────────────────────────────────────

  /**
   * Deploy a Soroban contract and return a ready-to-use `ContractFixture`.
   *
   * Internally calls `uploadWasm` then `createContract` as two separate
   * Soroban host-function transactions.
   */
  static async deploy(params: DeployParams): Promise<ContractFixture> {
    const { wasm, deployer, salt, config = {} } = params;
    const resolved = resolveConfig(config);
    const server = createRpcServer(config);

    // Step 1: Upload WASM
    const wasmHash = await ContractFixture.uploadWasm(wasm, deployer, server, resolved);

    // Step 2: Create contract from the uploaded WASM hash
    const contractId = await ContractFixture.instantiateContract(
      wasmHash,
      deployer,
      server,
      resolved,
      salt
    );

    // Fetch deploy ledger from a lightweight getTransaction call
    const deployResult: DeployResult = {
      contractId,
      transactionHash: '', // Not tracked here — callers can record separately
      ledger: 0,
      wasmHash,
    };

    return new ContractFixture(deployResult, server, resolved);
  }

  /**
   * Wrap an **already deployed** contract ID in a `ContractFixture` without
   * uploading any WASM.  Useful when the contract was deployed in globalSetup.
   */
  static fromExisting(
    contractId: string,
    wasmHash: string,
    config: TestnetConfig = {}
  ): ContractFixture {
    const resolved = resolveConfig(config);
    const server = createRpcServer(config);

    const deployResult: DeployResult = {
      contractId,
      wasmHash,
      transactionHash: '',
      ledger: 0,
    };

    return new ContractFixture(deployResult, server, resolved);
  }

  // ── Internal deployment helpers ────────────────────────────────────────────

  /**
   * Upload raw WASM bytes to the Stellar network via `hostFunctionTypeUploadContractWasm`.
   * Returns the hex-encoded WASM hash.
   */
  static async uploadWasm(
    wasm: Buffer,
    deployer: Keypair,
    server: rpc.Server,
    resolved: Required<TestnetConfig>
  ): Promise<string> {
    const account = await server.getAccount(deployer.publicKey());

    const uploadOp = xdr.HostFunction.hostFunctionTypeUploadContractWasm(wasm);

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: resolved.networkPassphrase,
    })
      .addOperation({
        type: 'invokeHostFunction',
        hostFunction: uploadOp,
        auth: [],
      } as any)
      .setTimeout(30)
      .build();

    // Simulate to get resource estimates & auth entries
    const simulation = await server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(simulation)) {
      throw new Error(`WASM upload simulation failed: ${(simulation as any).error}`);
    }

    const preparedTx = rpc.assembleTransaction(tx, simulation).build() as Transaction;
    preparedTx.sign(deployer);

    const submitResult = await submitAndVerifyTransaction(preparedTx, server, {
      maxPollAttempts: resolved.maxPollAttempts,
      pollIntervalMs: resolved.pollIntervalMs,
    });

    if (submitResult.status !== 'SUCCESS') {
      throw new Error(`WASM upload transaction failed: ${submitResult.transactionHash}`);
    }

    // The return value of upload is the wasm hash as ScBytes
    const wasmHashVal = submitResult.returnValue;
    if (!wasmHashVal) {
      throw new Error('WASM upload returned no hash');
    }

    return Buffer.from(wasmHashVal.bytes()).toString('hex');
  }

  /**
   * Instantiate a contract from a WASM hash via
   * `hostFunctionTypeCreateContract`.  Returns the Bech32 contract ID.
   */
  static async instantiateContract(
    wasmHash: string,
    deployer: Keypair,
    server: rpc.Server,
    resolved: Required<TestnetConfig>,
    salt?: Buffer
  ): Promise<string> {
    const account = await server.getAccount(deployer.publicKey());
    const saltBytes = salt ?? crypto.getRandomValues(new Uint8Array(32));

    const createOp = xdr.HostFunction.hostFunctionTypeCreateContract(
      new xdr.CreateContractArgs({
        contractIdPreimage: xdr.ContractIdPreimage.contractIdPreimageFromAddress(
          new xdr.ContractIdPreimageFromAddress({
            address: new Address(deployer.publicKey()).toScAddress(),
            salt: Buffer.from(saltBytes),
          })
        ),
        executable: xdr.ContractExecutable.contractExecutableWasm(
          Buffer.from(wasmHash, 'hex')
        ),
      })
    );

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: resolved.networkPassphrase,
    })
      .addOperation({
        type: 'invokeHostFunction',
        hostFunction: createOp,
        auth: [],
      } as any)
      .setTimeout(30)
      .build();

    const simulation = await server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(simulation)) {
      throw new Error(`Contract instantiation simulation failed: ${(simulation as any).error}`);
    }

    const preparedTx = rpc.assembleTransaction(tx, simulation).build() as Transaction;
    preparedTx.sign(deployer);

    const submitResult = await submitAndVerifyTransaction(preparedTx, server, {
      maxPollAttempts: resolved.maxPollAttempts,
      pollIntervalMs: resolved.pollIntervalMs,
    });

    if (submitResult.status !== 'SUCCESS') {
      throw new Error(`Contract instantiation failed: ${submitResult.transactionHash}`);
    }

    // Return value is the contract ID address
    if (!submitResult.returnValue) {
      throw new Error('Contract instantiation returned no contract ID');
    }

    return Address.fromScAddress(submitResult.returnValue.address()).toString();
  }

  // ── Instance methods ───────────────────────────────────────────────────────

  /**
   * Invoke a contract method.
   *
   * When `simulateOnly` is `true`, the transaction is simulated but NOT
   * submitted.  Returns the simulation cost breakdown instead.
   */
  async invoke(params: InvokeParams): Promise<InvokeResult> {
    const { method, args = [], caller, simulateOnly = false, config = {} } = params;
    const mergedConfig = { ...this.resolvedConfig, ...resolveConfig(config) };

    const account = await this.server.getAccount(caller.publicKey());
    const contract = new Contract(this.contractId);

    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: mergedConfig.networkPassphrase,
    })
      .addOperation(contract.call(method, ...args))
      .setTimeout(30)
      .build();

    const simulation = await this.server.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(simulation)) {
      throw new Error(
        `Simulation of ${method}() failed: ${(simulation as any).error}`
      );
    }

    if (simulateOnly) {
      return {
        transactionHash: '',
        ledger: 0,
        status: 'SUCCESS',
        returnValue: (simulation as any).result?.retval,
      };
    }

    const preparedTx = rpc.assembleTransaction(tx, simulation).build() as Transaction;
    preparedTx.sign(caller);

    const submitResult = await submitAndVerifyTransaction(
      preparedTx,
      this.server,
      mergedConfig
    );

    return submitResult;
  }

  /**
   * Fetch a raw ledger entry for this contract by ScVal key.
   *
   * @returns The `ScVal` stored at `key`, or `null` if not present.
   */
  async readStorage(key: xdr.ScVal): Promise<xdr.ScVal | null> {
    const ledgerKey = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: new Address(this.contractId).toScAddress(),
        key,
        durability: xdr.ContractDataDurability.persistent(),
      })
    );

    const response = await this.server.getLedgerEntries(ledgerKey);
    if (!response.entries || response.entries.length === 0) return null;

    const entry = response.entries[0];
    return (entry.val.contractData().val()) ?? null;
  }

  /**
   * Convenience: return a `Contract` instance for low-level usage.
   */
  toContract(): Contract {
    return new Contract(this.contractId);
  }

  /** Expose the underlying RPC server for advanced usage. */
  getServer(): rpc.Server {
    return this.server;
  }
}

// ─── FixtureRegistry ──────────────────────────────────────────────────────────

/**
 * A simple named registry of `ContractFixture` instances.
 *
 * Typical usage: deploy all required contracts in `globalSetup`, store them in
 * a registry serialised to `process.env`, then re-hydrate via
 * `FixtureRegistry.fromEnv()` in each worker.
 *
 * @example — globalSetup
 * ```ts
 * const registry = new FixtureRegistry();
 * registry.set('token', await ContractFixture.deploy({ wasm, deployer }));
 * registry.toEnv(); // writes GALAXY_FIXTURES to process.env
 * ```
 *
 * @example — test file
 * ```ts
 * const registry = FixtureRegistry.fromEnv();
 * const token = registry.get('token');
 * ```
 */
export class FixtureRegistry {
  private static readonly ENV_KEY = 'GALAXY_TEST_FIXTURES';

  private readonly store = new Map<string, ContractFixture>();

  /** Store a named fixture. */
  set(name: string, fixture: ContractFixture): this {
    this.store.set(name, fixture);
    return this;
  }

  /**
   * Retrieve a fixture by name.
   * @throws {Error} when no fixture is registered under `name`.
   */
  get(name: string): ContractFixture {
    const fixture = this.store.get(name);
    if (!fixture) {
      throw new Error(
        `No fixture registered under "${name}". ` +
          `Available: ${[...this.store.keys()].join(', ') || '(none)'}`
      );
    }
    return fixture;
  }

  /** Returns `true` if a fixture exists under `name`. */
  has(name: string): boolean {
    return this.store.has(name);
  }

  /** Remove all stored fixtures. */
  clear(): this {
    this.store.clear();
    return this;
  }

  /**
   * Serialise all fixtures to `process.env` as a JSON string so they can be
   * shared across Jest workers via environment variables.
   */
  toEnv(): void {
    const serialised: Record<string, { contractId: string; wasmHash: string }> = {};
    for (const [name, fixture] of this.store) {
      serialised[name] = {
        contractId: fixture.contractId,
        wasmHash: fixture.wasmHash,
      };
    }
    process.env[FixtureRegistry.ENV_KEY] = JSON.stringify(serialised);
  }

  /**
   * Re-hydrate a `FixtureRegistry` from the environment variable written by
   * `toEnv()`.  Uses `ContractFixture.fromExisting` — no network calls.
   *
   * @throws {Error} when `GALAXY_TEST_FIXTURES` is not set.
   */
  static fromEnv(config: TestnetConfig = {}): FixtureRegistry {
    const raw = process.env[FixtureRegistry.ENV_KEY];
    if (!raw) {
      throw new Error(
        `${FixtureRegistry.ENV_KEY} is not set. ` +
          `Did you call registry.toEnv() in globalSetup?`
      );
    }

    const parsed = JSON.parse(raw) as Record<
      string,
      { contractId: string; wasmHash: string }
    >;

    const registry = new FixtureRegistry();
    for (const [name, { contractId, wasmHash }] of Object.entries(parsed)) {
      registry.set(name, ContractFixture.fromExisting(contractId, wasmHash, config));
    }

    return registry;
  }
}

// ─── Convenience factory ──────────────────────────────────────────────────────

/**
 * Create a minimal `ContractFixture` from an already-known contract ID, e.g.
 * the factory contract defined in `.env`.
 *
 * ```ts
 * const factory = knownContract(process.env.FACTORY_CONTRACT_ID!);
 * ```
 */
export function knownContract(
  contractId: string,
  config: TestnetConfig = {}
): ContractFixture {
  return ContractFixture.fromExisting(contractId, '', config);
}
