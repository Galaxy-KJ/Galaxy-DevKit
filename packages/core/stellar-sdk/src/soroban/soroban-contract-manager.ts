/**
 * @fileoverview Soroban Contract Manager
 * @description Main class for Soroban contract operations
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import {
  xdr,
  SorobanRpc,
  TransactionBuilder,
  Keypair,
  Contract,
  Networks,
  BASE_FEE,
  ScInt,
  Address,
} from '@stellar/stellar-sdk';
import { ScValConverter } from '../utils/scval-converter';
import {
  ContractDeploymentParams,
  ContractInvocationParams,
  ContractStateQueryParams,
  ContractEventQueryParams,
  ContractDeploymentResult,
  InvocationResult,
  SimulationResult,
  ContractEventDetail,
  ContractAbi,
  ContractUpgradeParams,
  ContractUpgradeResult,
} from '../types/contract-types';

export class SorobanContractManager {
  private rpcUrl: string;
  private server: SorobanRpc.Server;

  constructor(rpcUrl: string = 'https://soroban-testnet.stellar.org') {
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

      // Create contract deployment transaction
      const contractArgs = salt ? [salt] : [];
      const contract = new Contract(deployer.publicKey());

      const operation = xdr.HostFunction.hostFunctionTypeCreateContract({
        contractIdPreimage:
          xdr.ContractIdPreimage.contractIdPreimageFromAddress(
            new Address(deployer.publicKey()).toScAddress(),
            salt || xdr.ScVal.scvVoid()
          ),
        executable: xdr.ContractExecutable.contractExecutableWasm(wasm),
      });

      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase,
      })
        .addOperation({
          type: 'invokeHostFunction',
          hostFunction: operation,
        })
        .setTimeout(30)
        .build();

      // Simulate transaction
      const simulation = await this.server.simulateTransaction(tx);
      if (!SorobanRpc.Api.isSimulationSuccess(simulation)) {
        throw new Error(`Simulation failed: ${simulation.error}`);
      }

      // Prepare transaction
      const preparedTx = SorobanRpc.Api.prepareTransaction(tx, simulation);

      // Sign transaction
      preparedTx.sign(deployer);

      // Send transaction
      const response = await this.server.sendTransaction(preparedTx);

      if (response.status !== 'PENDING') {
        throw new Error(`Transaction failed: ${response.status}`);
      }

      // Wait for transaction completion
      const result = await this.server.getTransaction(response.hash);

      if (!SorobanRpc.Api.isGetTransactionSuccess(result)) {
        throw new Error(`Transaction execution failed: ${result.resultXdr}`);
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
      const preparedTx = SorobanRpc.Api.prepareTransaction(tx, simulation);

      // Sign transaction
      preparedTx.sign(caller);

      // Send transaction
      const response = await this.server.sendTransaction(preparedTx);

      if (response.status !== 'PENDING') {
        throw new Error(`Transaction failed: ${response.status}`);
      }

      // Wait for transaction completion
      const result = await this.server.getTransaction(response.hash);

      if (!SorobanRpc.Api.isGetTransactionSuccess(result)) {
        throw new Error(`Transaction execution failed: ${result.resultXdr}`);
      }

      // Parse results
      const txMeta = result.resultMetaXdr;
      const events = this.parseEvents(txMeta);
      const auth = this.parseAuth(result.returnValue);

      return {
        result: result.returnValue,
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
        : new SorobanRpc.Api.Account(
            account ||
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

      return {
        result: simulation.result!,
        events: this.parseEvents(simulation.result),
        auth: this.parseAuth(simulation.result),
        cpuInstructions: simulation.cpuInstructions || 0,
        memoryBytes: simulation.memoryBytes || 0,
        transactionData: simulation.transactionData!,
        minResourceFee: simulation.minResourceFee || '0',
        cost: simulation.cost!,
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
    const { contractId, key, networkPassphrase } = params;

    try {
      const contract = new Contract(contractId);

      // Convert key to ScVal if it's a string
      const scKey = typeof key === 'string' ? ScValConverter.toScVal(key) : key;

      // Get ledger key
      const ledgerKey = contract.getFootprint().toLedgerKey(scKey);

      // Get ledger entries
      const response = await this.server.getLedgerEntries(ledgerKey);

      if (!response.entries || response.entries.length === 0) {
        return null;
      }

      const entry = response.entries[0];
      if (!entry.val) {
        return null;
      }

      // Convert from ScVal
      return ScValConverter.fromScVal(entry.val);
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
      topics,
      networkPassphrase,
    } = params;

    try {
      // Build event filters
      const filters: SorobanRpc.EventFilter[] = [];

      if (eventTypes && eventTypes.length > 0) {
        filters.push({
          type: 'contract',
          contractIds: [contractId],
          topics: eventTypes.map((type: string) => ({
            type: 'string' as const,
            value: type,
          })),
        });
      } else {
        filters.push({
          type: 'contract',
          contractIds: [contractId],
        });
      }

      // Get events
      const events = await this.server.getEvents({
        startLedger,
        endLedger,
        filters,
      });

      return events.events.map(event => ({
        contractId: event.contractId?.toString() || '',
        type: event.type.toString(),
        topics: event.topics || [],
        data: event.data || xdr.ScVal.scvVoid(),
        timestamp: event.timestamp || 0,
        ledger: event.ledger || 0,
        txHash: event.txHash || '',
        ...event,
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

      // Create contract instance
      const contract = new Contract(contractId);

      // Create upload operation
      const uploadOp =
        xdr.HostFunction.hostFunctionTypeUploadContractWasm(newWasm);

      // Create upgrade operation
      const upgradeOp = xdr.HostFunction.hostFunctionTypeCreateContract({
        contractIdPreimage:
          xdr.ContractIdPreimage.contractIdPreimageFromAddress(
            new Address(contractId).toScAddress(),
            xdr.ScVal.scvVoid()
          ),
        executable: xdr.ContractExecutable.contractExecutableStellarAsset(),
      });

      // Build transaction
      const tx = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase,
      })
        .addOperation({ type: 'invokeHostFunction', hostFunction: uploadOp })
        .addOperation({ type: 'invokeHostFunction', hostFunction: upgradeOp })
        .setTimeout(30)
        .build();

      // Simulate transaction
      const simulation = await this.server.simulateTransaction(tx);

      if (!SorobanRpc.Api.isSimulationSuccess(simulation)) {
        throw new Error(`Simulation failed: ${simulation.error}`);
      }

      // Prepare transaction
      const preparedTx = SorobanRpc.Api.prepareTransaction(tx, simulation);

      // Sign transaction
      preparedTx.sign(admin);

      // Send transaction
      const response = await this.server.sendTransaction(preparedTx);

      if (response.status !== 'PENDING') {
        throw new Error(`Transaction failed: ${response.status}`);
      }

      // Wait for transaction completion
      const result = await this.server.getTransaction(response.hash);

      if (!SorobanRpc.Api.isGetTransactionSuccess(result)) {
        throw new Error(`Transaction execution failed: ${result.resultXdr}`);
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
    result: SorobanRpc.Api.GetTransactionResponse
  ): string {
    // This is a simplified implementation
    // In practice, you'd parse the transaction meta to get the contract ID
    return result.returnValue?.toString() || '';
  }

  /**
   * Extract WASM hash from transaction result
   */
  private extractWasmHash(
    result: SorobanRpc.Api.GetTransactionResponse
  ): string {
    // This is a simplified implementation
    // In practice, you'd parse the transaction meta to get the WASM hash
    return result.returnValue?.toString() || '';
  }

  /**
   * Parse events from transaction meta
   */
  private parseEvents(meta?: xdr.TransactionMeta): ContractEventDetail[] {
    if (!meta) return [];

    const events: ContractEventDetail[] = [];
    const sorobanMeta = meta.v3()?.sorobanMeta();

    if (sorobanMeta) {
      for (const event of sorobanMeta.events()) {
        events.push({
          contractId: event.contractId?.toString() || '',
          type: event.type.toString(),
          topics: event.topics(),
          data: event.data(),
          timestamp: 0,
          ledger: 0,
          txHash: '',
        });
      }
    }

    return events;
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
    simulation: SorobanRpc.Api.SimulateTransactionResponse
  ): InvocationResult {
    return {
      result: simulation.result!,
      transactionHash: '',
      ledger: 0,
      events: this.parseEvents(simulation.result),
      auth: this.parseAuth(simulation.result),
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
