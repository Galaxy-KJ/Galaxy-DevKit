/**
 * @fileoverview Smart Swap Soroban contract client
 * @description Browser client for conditional swap orders on the smart-swap contract
 */

import { Buffer } from 'buffer';
import {
  Address,
  Contract,
  nativeToScVal,
  scValToNative,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';
import { Server, Api, assembleTransaction } from '@stellar/stellar-sdk/rpc';

/** Matches Rust SwapConditionType enum variants */
export type SwapConditionTypeVariant =
  | { kind: 'PercentageIncrease'; value: number }
  | { kind: 'PercentageDecrease'; value: number }
  | { kind: 'TargetPrice'; value: number }
  | { kind: 'PriceAbove'; value: number }
  | { kind: 'PriceBelow'; value: number };

/** Matches Rust SwapStatus enum */
export type SwapStatus = 'Active' | 'Executed' | 'Expired' | 'Cancelled';

export interface SwapCondition {
  id: number;
  owner: string;
  sourceAsset: string;
  destinationAsset: string;
  conditionType: SwapConditionTypeVariant;
  amountToSwap: number;
  minAmountOut: number;
  maxSlippage: number;
  referencePrice: number;
  createdAt: number;
  expiresAt: number;
  status: SwapStatus;
}

export interface SwapExecution {
  conditionId: number;
  executedAt: number;
  actualAmountOut: number;
  priceAtExecution: number;
  transactionHash: string;
}

export interface CreateSwapConditionInput {
  owner: string;
  sourceAsset: string;
  destinationAsset: string;
  conditionType: SwapConditionTypeVariant;
  amountToSwap: number;
  minAmountOut: number;
  maxSlippage: number;
  expiresAt: number;
}

export interface SmartSwapClientOptions {
  rpcUrl?: string;
  networkPassphrase?: string;
  contractId?: string;
}

export interface InvokeResult {
  xdr: string;
  simulation?: Api.SimulateTransactionResponse;
}

const DEFAULT_CONTRACT_ID = 'CSMARTSWAP000000000000000000000000000000000000000000000000000';

export function buildConditionTypeScVal(conditionType: SwapConditionTypeVariant): xdr.ScVal {
  switch (conditionType.kind) {
    case 'PercentageIncrease':
      return xdr.ScVal.scvVec([
        xdr.ScVal.scvSymbol('PercentageIncrease'),
        nativeToScVal(conditionType.value, { type: 'u32' }),
      ]);
    case 'PercentageDecrease':
      return xdr.ScVal.scvVec([
        xdr.ScVal.scvSymbol('PercentageDecrease'),
        nativeToScVal(conditionType.value, { type: 'u32' }),
      ]);
    case 'TargetPrice':
      return xdr.ScVal.scvVec([
        xdr.ScVal.scvSymbol('TargetPrice'),
        nativeToScVal(conditionType.value, { type: 'u64' }),
      ]);
    case 'PriceAbove':
      return xdr.ScVal.scvVec([
        xdr.ScVal.scvSymbol('PriceAbove'),
        nativeToScVal(conditionType.value, { type: 'u64' }),
      ]);
    case 'PriceBelow':
      return xdr.ScVal.scvVec([
        xdr.ScVal.scvSymbol('PriceBelow'),
        nativeToScVal(conditionType.value, { type: 'u64' }),
      ]);
    default:
      throw new Error(`Unsupported condition type: ${(conditionType as SwapConditionTypeVariant).kind}`);
  }
}

export function parseConditionType(raw: unknown): SwapConditionTypeVariant {
  if (Array.isArray(raw) && raw.length >= 2) {
    const [tag, value] = raw;
    const kind = String(tag);
    if (kind === 'PercentageIncrease' || kind === 'PercentageDecrease') {
      return { kind, value: Number(value) } as SwapConditionTypeVariant;
    }
    return { kind, value: Number(value) } as SwapConditionTypeVariant;
  }
  if (typeof raw === 'object' && raw !== null) {
    const entries = Object.entries(raw as Record<string, unknown>);
    if (entries.length === 1) {
      const [kind, value] = entries[0];
      return parseConditionType([kind, value]);
    }
  }
  throw new Error('Unable to parse SwapConditionType from contract response');
}

export function formatConditionType(conditionType: SwapConditionTypeVariant): string {
  switch (conditionType.kind) {
    case 'PercentageIncrease':
      return `+${conditionType.value}%`;
    case 'PercentageDecrease':
      return `-${conditionType.value}%`;
    case 'TargetPrice':
      return `target ${conditionType.value}`;
    case 'PriceAbove':
      return `above ${conditionType.value}`;
    case 'PriceBelow':
      return `below ${conditionType.value}`;
    default:
      return String((conditionType as SwapConditionTypeVariant).kind);
  }
}

export class SmartSwapClient {
  private readonly rpc: Server;
  private readonly networkPassphrase: string;
  private contractId: string;

  constructor(options: SmartSwapClientOptions = {}) {
    const rpcUrl = options.rpcUrl ?? 'https://soroban-testnet.stellar.org';
    this.networkPassphrase = options.networkPassphrase ?? 'Test SDF Network ; September 2015';
    this.rpc = new Server(rpcUrl, { allowHttp: rpcUrl.startsWith('http://') });
    this.contractId = options.contractId ?? DEFAULT_CONTRACT_ID;
  }

  setContractId(contractId: string): void {
    this.contractId = contractId.trim();
  }

  getContractId(): string {
    return this.contractId;
  }

  async createSwapCondition(input: CreateSwapConditionInput): Promise<InvokeResult> {
    this.validateCreateInput(input);
    const contract = new Contract(this.contractId);
    const operation = contract.call(
      'create_swap_condition',
      Address.fromString(input.owner).toScVal(),
      nativeToScVal(input.sourceAsset, { type: 'symbol' }),
      nativeToScVal(input.destinationAsset, { type: 'symbol' }),
      buildConditionTypeScVal(input.conditionType),
      nativeToScVal(input.amountToSwap, { type: 'u64' }),
      nativeToScVal(input.minAmountOut, { type: 'u64' }),
      nativeToScVal(input.maxSlippage, { type: 'u32' }),
      nativeToScVal(input.expiresAt, { type: 'u64' }),
    );
    return this.simulateInvoke(input.owner, operation);
  }

  async executeSwapCondition(owner: string, conditionId: number): Promise<InvokeResult> {
    const contract = new Contract(this.contractId);
    const operation = contract.call(
      'execute_swap_condition',
      nativeToScVal(conditionId, { type: 'u64' }),
    );
    return this.simulateInvoke(owner, operation);
  }

  async cancelCondition(owner: string, conditionId: number): Promise<InvokeResult> {
    const contract = new Contract(this.contractId);
    const operation = contract.call(
      'cancel_condition',
      nativeToScVal(conditionId, { type: 'u64' }),
      Address.fromString(owner).toScVal(),
    );
    return this.simulateInvoke(owner, operation);
  }

  async getActiveConditions(owner: string): Promise<SwapCondition[]> {
    const contract = new Contract(this.contractId);
    const operation = contract.call(
      'get_active_conditions',
      Address.fromString(owner).toScVal(),
    );
    const result = await this.simulateRead(owner, operation);
    const native = scValToNative(result as xdr.ScVal);
    if (!Array.isArray(native)) return [];
    return native.map((item) => this.mapCondition(item));
  }

  async getExecutionHistory(conditionId: number, owner: string): Promise<SwapExecution[]> {
    const contract = new Contract(this.contractId);
    const operation = contract.call(
      'get_execution_history',
      nativeToScVal(conditionId, { type: 'u64' }),
    );
    const result = await this.simulateRead(owner, operation);
    const native = scValToNative(result as xdr.ScVal);
    if (!Array.isArray(native)) return [];
    return native.map((item) => this.mapExecution(item));
  }

  private async simulateInvoke(source: string, operation: xdr.Operation): Promise<InvokeResult> {
    const tx = await this.buildTransaction(source, operation);
    const simulation = await this.rpc.simulateTransaction(tx);
    if (Api.isSimulationError(simulation)) {
      throw new Error(simulation.error ?? 'Smart swap simulation failed');
    }
    const assembled = assembleTransaction(tx, simulation).build();
    return { xdr: assembled.toXDR(), simulation };
  }

  private async simulateRead(source: string, operation: xdr.Operation): Promise<unknown> {
    const tx = await this.buildTransaction(source, operation);
    const simulation = await this.rpc.simulateTransaction(tx);
    if (Api.isSimulationError(simulation)) {
      throw new Error(simulation.error ?? 'Smart swap read simulation failed');
    }
    return simulation.result?.retval;
  }

  private async buildTransaction(source: string, operation: xdr.Operation) {
    const { sequence } = await this.rpc.getLatestLedger();
    const account = {
      accountId: () => source,
      sequenceNumber: () => String(BigInt(sequence) + 1n),
      incrementSequenceNumber: () => {},
    };
    return new TransactionBuilder(account as never, {
      fee: '100',
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build();
  }

  private mapCondition(raw: Record<string, unknown>): SwapCondition {
    return {
      id: Number(raw.id),
      owner: String(raw.owner ?? ''),
      sourceAsset: String(raw.source_asset ?? raw.sourceAsset ?? ''),
      destinationAsset: String(raw.destination_asset ?? raw.destinationAsset ?? ''),
      conditionType: parseConditionType(raw.condition_type ?? raw.conditionType),
      amountToSwap: Number(raw.amount_to_swap ?? raw.amountToSwap ?? 0),
      minAmountOut: Number(raw.min_amount_out ?? raw.minAmountOut ?? 0),
      maxSlippage: Number(raw.max_slippage ?? raw.maxSlippage ?? 0),
      referencePrice: Number(raw.reference_price ?? raw.referencePrice ?? 0),
      createdAt: Number(raw.created_at ?? raw.createdAt ?? 0),
      expiresAt: Number(raw.expires_at ?? raw.expiresAt ?? 0),
      status: String(raw.status ?? 'Active') as SwapStatus,
    };
  }

  private mapExecution(raw: Record<string, unknown>): SwapExecution {
    const hashRaw = raw.transaction_hash ?? raw.transactionHash;
    let transactionHash = '';
    if (typeof hashRaw === 'string') {
      transactionHash = hashRaw;
    } else if (hashRaw instanceof Uint8Array) {
      transactionHash = Buffer.from(hashRaw).toString('hex');
    }

    return {
      conditionId: Number(raw.condition_id ?? raw.conditionId ?? 0),
      executedAt: Number(raw.executed_at ?? raw.executedAt ?? 0),
      actualAmountOut: Number(raw.actual_amount_out ?? raw.actualAmountOut ?? 0),
      priceAtExecution: Number(raw.price_at_execution ?? raw.priceAtExecution ?? 0),
      transactionHash,
    };
  }

  private validateCreateInput(input: CreateSwapConditionInput): void {
    if (!input.owner.trim()) throw new Error('owner is required');
    if (!input.sourceAsset.trim()) throw new Error('sourceAsset is required');
    if (!input.destinationAsset.trim()) throw new Error('destinationAsset is required');
    if (input.amountToSwap <= 0) throw new Error('amountToSwap must be positive');
    if (input.minAmountOut <= 0) throw new Error('minAmountOut must be positive');
    if (input.maxSlippage < 0 || input.maxSlippage > 10_000) {
      throw new Error('maxSlippage must be between 0 and 10000 bps');
    }
    if (input.expiresAt <= Math.floor(Date.now() / 1000)) {
      throw new Error('expiresAt must be in the future');
    }
  }
}
