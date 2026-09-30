/**
 * @fileoverview Soroban Contract Manager
 * @description Main class for Soroban contract operations
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import {
  xdr,
  rpc as SorobanRpc,
  TransactionBuilder,
  Contract,
  BASE_FEE,
  Address,
  Account,
  StrKey,
  hash,
  Operation,
} from '@stellar/stellar-sdk';
import { randomBytes } from 'node:crypto';
import { resolveNetwork } from '../utils/network-utils.js';
import { ScValConverter } from './utils/scval-converter.js';
import { normalizeSalt } from './utils/contract-address.js';
import {
  ContractDeploymentParams,
  ContractInvocationParams,
  ContractStateQueryParams,
  ContractEventQueryParams,
  ContractDeploymentResult,
  InvocationResult,
  SimulationResult,
  ContractEventDetail,
  ContractUpgradeParams,
  ContractUpgradeResult,
} from './types/contract-types.js';

export class SorobanContractManager {
  private rpcUrl: string;
  private server: SorobanRpc.Server;

  constructor(rpcUrl: string = resolveNetwork('testnet').rpcUrl) {
    this.rpcUrl = rpcUrl;
    this.server = new SorobanRpc.Server(rpcUrl);
  }

  /**
   * Deploy a Soroban contract
   */
  async deployContract(
    params: ContractDeploymentParams
  ): Promise<ContractDeploymentResult> {
    const { wasm, deployer, networkPassphrase, salt } = params;

    try {
      // Get account information
      const account = await this.server.getAccount(deployer.publicKey());

      const hostFunction = xdr.HostFunction.hostFunctionTypeCreateContract(
        new xdr.CreateContractArgs({
          contractIdPreimage:
            xdr.ContractIdPreimage.contractIdPreimageFromAddress(
              new xdr.ContractIdPreimageFromAddress({
                address: new Address(deployer.publicKey()).toScAddress(),
                salt: salt ? normalizeSalt(salt) : randomBytes(32),
              })
            ),
          executable: xdr.ContractExecutable.contractExecutableWasm(wasm),
        })
      );

      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase,
      })
        .addOperation(Operation.invokeHostFunction({ func: hostFunction }))
        .setTimeout(30)
        .build();

      // Simulate transaction
      const simulation = await this.server.simulateTransaction(tx);
      if (!SorobanRpc.Api.isSimulationSuccess(simulation)) {
        throw new Error(`Simulation failed: ${simulation.error}`);
      }

      // Prepare transaction
      const preparedTx = await this.server.prepareTransaction(tx);

      // Sign transaction
      preparedTx.sign(deployer);

      // Send transaction
      const response = await this.server.sendTransaction(preparedTx);

      if (response.status !== 'PENDING') {
        throw new Error(`Transaction failed: ${response.status}`);
      }

      // Wait for transaction completion
      const result = await this.server.getTransaction(response.hash);

      if (result.status !== SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
        throw new Error(`Transaction execution failed: ${result.status}`);
      }

      // Extract contract ID
      const contractId = this.extractContractId(result);

      return {
        contractId,
        transactionHash: response.hash,
        ledger: result.ledger || 0,
      };
    } catch (error) {
      throw new Error(
        `Contract deployment failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Invoke a contract method
   */
  async invokeContract(
    params: ContractInvocationParams
  ): Promise<InvocationResult> {
    const {
      contractId,
      method,
      args,
      caller,
      networkPassphrase,
      simulateOnly,
    } = params;

    try {
      // Get account information
      const account = await this.server.getAccount(caller.publicKey());

      // Create contract instance
      const contract = new Contract(contractId);

      // Encode arguments
      const scArgs = ScValConverter.encodeArgs(args);

      // Create operation
      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase,
      })
        .addOperation(contract.call(method, ...scArgs))
        .setTimeout(30)
        .build();

      // Simulate transaction
      const simulation = await this.server.simulateTransaction(tx);

      if (!SorobanRpc.Api.isSimulationSuccess(simulation)) {
        throw new Error(`Simulation failed: ${simulation.error}`);
      }

      if (simulateOnly) {
        return this.convertSimulationToResult(simulation);
      }

      // Prepare transaction
      const preparedTx = await this.server.prepareTransaction(tx);

      // Sign transaction
      preparedTx.sign(caller);

      // Send transaction
      const response = await this.server.sendTransaction(preparedTx);

      if (response.status !== 'PENDING') {
        throw new Error(`Transaction failed: ${response.status}`);
      }

      // Wait for transaction completion
      const result = await this.server.getTransaction(response.hash);

      if (result.status !== SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
        throw new Error(`Transaction execution failed: ${result.status}`);
      }

      // Parse results
      const events = this.parseEvents(result.resultMetaXdr);
      const auth = this.parseAuth(result.returnValue);

      return {
        result: result.returnValue || xdr.ScVal.scvVoid(),
        transactionHash: response.hash,
        ledger: result.ledger || 0,
        events,
        auth,
      };
    } catch (error) {
      throw new Error(
        `Contract invocation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Simulate contract invocation
   */
  async simulateInvocation(
    params: Omit<ContractInvocationParams, 'caller' | 'networkPassphrase'> & {
      account?: string;
      networkPassphrase: string;
    }
  ): Promise<SimulationResult> {
    const { contractId, method, args, account, networkPassphrase } = params;

    try {
      // Use provided account or create a mock account
      const sourceAccount = account
        ? await this.server.getAccount(account)
        : new Account(
            'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
            '1'
          );

      // Create contract instance
      const contract = new Contract(contractId);

      // Encode arguments
      const scArgs = ScValConverter.encodeArgs(args);

      // Create transaction
      const tx = new TransactionBuilder(sourceAccount, {
        fee: BASE_FEE,
        networkPassphrase,
      })
        .addOperation(contract.call(method, ...scArgs))
        .setTimeout(30)
        .build();

      // Simulate transaction
      const simulation = await this.server.simulateTransaction(tx);

      if (!SorobanRpc.Api.isSimulationSuccess(simulation)) {
        throw new Error(`Simulation failed: ${simulation.error}`);
      }

      const result = simulation.result;
      const events = this.parseDiagnosticEvents(simulation.events);

      return {
        result: result?.retval || xdr.ScVal.scvVoid(),
        events,
        auth: result?.auth || [],
        cpuInstructions: 0,
        memoryBytes: 0,
        transactionData: simulation.transactionData.build(),
        minResourceFee: simulation.minResourceFee,
        cost: undefined,
      };
    } catch (error) {
      throw new Error(
        `Contract simulation failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Read contract state
   */
  async readContractState(params: ContractStateQueryParams): Promise<any> {
    const { contractId, key } = params;

    try {
      // Convert key to ScVal if it's a string
      const scKey = typeof key === 'string' ? ScValConverter.toScVal(key) : key;

      const response = await this.server.getContractData(contractId, scKey);

      return {
        key: scKey,
        value: ScValConverter.fromScVal(response.val.contractData().val()),
        lastModifiedLedgerSeq: response.lastModifiedLedgerSeq,
      };
    } catch (error) {
      throw new Error(
        `Contract state query failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Query contract events
   */
  async queryEvents(
    params: ContractEventQueryParams
  ): Promise<ContractEventDetail[]> {
    const {
      contractId,
      startLedger,
      endLedger,
      eventTypes,
    } = params;

    try {
      // Build event filters
      const filters: SorobanRpc.Api.EventFilter[] = [];

      if (eventTypes && eventTypes.length > 0) {
        filters.push({
          type: 'contract',
          contractIds: [contractId],
          topics: eventTypes.map(type => [type]),
        });
      } else {
        filters.push({
          type: 'contract',
          contractIds: [contractId],
        });
      }

      // Get events
      const events = await this.server.getEvents({
        filters,
        startLedger: startLedger || 0,
        ...(endLedger !== undefined ? { endLedger } : {}),
      });

      return events.events.map(event => ({
        contractId: event.contractId?.toString() || '',
        type: event.type,
        topics: event.topic,
        data: event.value,
        timestamp: 0,
        ledger: event.ledger,
        txHash: event.txHash,
      }));
    } catch (error) {
      throw new Error(
        `Event query failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Upgrade a contract
   */
  async upgradeContract(
    params: ContractUpgradeParams
  ): Promise<ContractUpgradeResult> {
    const { contractId, newWasm, admin, networkPassphrase } = params;

    try {
      // Get account information
      const account = await this.server.getAccount(admin.publicKey());

      // Create upload operation
      const uploadOp =
        xdr.HostFunction.hostFunctionTypeUploadContractWasm(newWasm);

      // Upgrade the contract to the new wasm via the built-in __update_wasm
      // function. The RPC's prepareTransaction attaches the required auth and
      // footprint from the simulation before signing.
      const upgradeOp =
        xdr.HostFunction.hostFunctionTypeInvokeContract(
          new xdr.InvokeContractArgs({
            contractAddress: new Address(contractId).toScAddress(),
            functionName: '__update_wasm',
            args: [xdr.ScVal.scvBytes(hash(newWasm))],
          })
        );

      // Build transaction
      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase,
      })
        .addOperation(Operation.invokeHostFunction({ func: uploadOp }))
        .addOperation(Operation.invokeHostFunction({ func: upgradeOp }))
        .setTimeout(30)
        .build();

      // Simulate transaction
      const simulation = await this.server.simulateTransaction(tx);

      if (!SorobanRpc.Api.isSimulationSuccess(simulation)) {
        throw new Error(`Simulation failed: ${simulation.error}`);
      }

      // Prepare transaction
      const preparedTx = await this.server.prepareTransaction(tx);

      // Sign transaction
      preparedTx.sign(admin);

      // Send transaction
      const response = await this.server.sendTransaction(preparedTx);

      if (response.status !== 'PENDING') {
        throw new Error(`Transaction failed: ${response.status}`);
      }

      // Wait for transaction completion
      const result = await this.server.getTransaction(response.hash);

      if (result.status !== SorobanRpc.Api.GetTransactionStatus.SUCCESS) {
        throw new Error(`Transaction execution failed: ${result.status}`);
      }

      // Get new WASM hash
      const newWasmHash = this.extractWasmHash(result);

      return {
        contractId,
        transactionHash: response.hash,
        newWasmHash,
        ledger: result.ledger || 0,
      };
    } catch (error) {
      throw new Error(
        `Contract upgrade failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Extract contract ID from transaction result
   */
  private extractContractId(
    result: SorobanRpc.Api.GetSuccessfulTransactionResponse
  ): string {
    // This is a simplified implementation
    // In practice, you'd parse the transaction meta to get the contract ID
    const returnValue = result.returnValue;
    if (!returnValue) return '';

    try {
      return Address.fromScVal(returnValue).toString();
    } catch {
      return ScValConverter.fromScVal(returnValue).toString();
    }
  }

  /**
   * Extract WASM hash from transaction result
   */
  private extractWasmHash(
    result: SorobanRpc.Api.GetSuccessfulTransactionResponse
  ): string {
    // This is a simplified implementation
    // In practice, you'd parse the transaction meta to get the WASM hash
    const returnValue = result.returnValue;
    if (!returnValue) return '';

    const decoded = ScValConverter.fromScVal(returnValue);
    return Buffer.isBuffer(decoded)
      ? decoded.toString('hex')
      : String(decoded);
  }

  /**
   * Parse events from transaction meta
   */
  private parseEvents(meta?: xdr.TransactionMeta): ContractEventDetail[] {
    if (!meta) return [];

    const sorobanMeta = meta.v3()?.sorobanMeta();
    if (!sorobanMeta) return [];

    return sorobanMeta.events().map(event => this.parseContractEvent(event));
  }

  /**
   * Parse diagnostic events from a simulation response
   */
  private parseDiagnosticEvents(
    diagnostics: xdr.DiagnosticEvent[]
  ): ContractEventDetail[] {
    return diagnostics.map(diagnostic =>
      this.parseContractEvent(diagnostic.event())
    );
  }

  /**
   * Map a single contract event to the shared event detail shape
   */
  private parseContractEvent(event: xdr.ContractEvent): ContractEventDetail {
    const contractId = event.contractId();
    return {
      contractId: contractId
        ? StrKey.encodeContract(Buffer.from(contractId as unknown as Uint8Array))
        : '',
      type: event.type().name,
      topics: event.body().v0().topics(),
      data: event.body().v0().data(),
      timestamp: 0,
      ledger: 0,
      txHash: '',
    };
  }

  /**
   * Parse auth from transaction result
   */
  private parseAuth(result?: xdr.ScVal): xdr.SorobanAuthorizationEntry[] {
    // This is a simplified implementation
    // In practice, you'd parse the auth entries from the result
    return [];
  }

  /**
   * Convert simulation result to invocation result
   */
  private convertSimulationToResult(
    simulation: SorobanRpc.Api.SimulateTransactionSuccessResponse
  ): InvocationResult {
    return {
      result: simulation.result?.retval || xdr.ScVal.scvVoid(),
      transactionHash: '',
      ledger: 0,
      events: this.parseDiagnosticEvents(simulation.events),
      auth: simulation.result?.auth || [],
    };
  }

  /**
   * Get the RPC server instance
   */
  getServer(): SorobanRpc.Server {
    return this.server;
  }

  /**
   * Get the RPC URL
   */
  getRpcUrl(): string {
    return this.rpcUrl;
  }
}