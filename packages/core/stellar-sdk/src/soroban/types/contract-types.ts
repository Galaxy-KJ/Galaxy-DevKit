/**
 * @fileoverview Soroban contract types and interfaces
 * @description Type definitions for Soroban contract operations
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { xdr } from '@stellar/stellar-sdk';
import { Keypair } from '@stellar/stellar-sdk';

export interface ContractSpec {
  address: string;
  wasmHash?: string;
  functions: ContractFunction[];
  events: ContractEvent[];
}

export interface ContractFunction {
  name: string;
  inputs: Array<{ name: string; type: ScType }>;
  outputs: ScType[];
}

export interface ContractEvent {
  name: string;
  topics: ScType[];
  data: ScType[];
}

export type ScType =
  | 'void'
  | 'bool'
  | 'u32'
  | 'i32'
  | 'u64'
  | 'i64'
  | 'u128'
  | 'i128'
  | 'u256'
  | 'i256'
  | 'f32'
  | 'f64'
  | 'bytes'
  | 'string'
  | 'symbol'
  | 'address'
  | 'option'
  | 'result'
  | 'vec'
  | 'map'
  | 'set'
  | 'tuple';

export interface ContractDeploymentParams {
  wasm: Buffer;
  deployer: Keypair;
  networkPassphrase: string;
  salt?: xdr.ScVal;
}

export interface ContractInvocationParams {
  contractId: string;
  method: string;
  args: any[];
  caller: Keypair;
  networkPassphrase: string;
  simulateOnly?: boolean;
}

export interface ContractStateQueryParams {
  contractId: string;
  key: string | xdr.ScVal;
  networkPassphrase: string;
}

export interface ContractEventQueryParams {
  contractId: string;
  startLedger?: number;
  endLedger?: number;
  eventTypes?: string[];
  topics?: xdr.ScVal[];
  networkPassphrase: string;
}

export interface ContractDeploymentResult {
  contractId: string;
  transactionHash: string;
  ledger: number;
}

export interface InvocationResult {
  result: xdr.ScVal;
  transactionHash: string;
  ledger: number;
  events: ContractEventDetail[];
  auth: xdr.SorobanAuthorizationEntry[];
}

export interface SimulationResult {
  result: xdr.ScVal;
  events: ContractEventDetail[];
  auth: xdr.SorobanAuthorizationEntry[];
  cpuInstructions: number;
  memoryBytes: number;
  transactionData: xdr.SorobanTransactionData;
  minResourceFee: string;
  cost: xdr.Cost;
}

export interface ContractEventDetail {
  contractId: string;
  type: string;
  topics: xdr.ScVal[];
  data: xdr.ScVal[];
  timestamp: number;
  ledger: number;
  txHash: string;
  decodedTopics?: any[];
  decodedData?: any;
  eventName?: string;
}

export interface EventSubscription {
  id: string;
  contractId: string;
  eventTypes?: string[];
  onEvent: (event: ContractEventDetail) => void;
  onError?: (error: Error) => void;
  onClose?: () => void;
}

export interface ContractAbi {
  name: string;
  version: string;
  functions: AbiFunction[];
  types: AbiType[];
}

export interface AbiFunction {
  name: string;
  doc?: string;
  inputs: AbiArgument[];
  outputs: AbiArgument[];
}

export interface AbiArgument {
  name: string;
  type: string;
  doc?: string;
}

export interface AbiType {
  name: string;
  kind: string;
  fields?: AbiField[];
  generics?: string[];
}

export interface AbiField {
  name: string;
  type: string;
  doc?: string;
}

export interface TokenContractInfo {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: string;
  admin: string;
}

export interface ContractFactoryConfig {
  wasm: Buffer;
  networkPassphrase: string;
  deployer?: Keypair;
}

export interface ContractWrapperOptions {
  contractId: string;
  networkPassphrase: string;
  rpcUrl: string;
}

export interface ContractUpgradeParams {
  contractId: string;
  newWasm: Buffer;
  admin: Keypair;
  networkPassphrase: string;
}

export interface ContractUpgradeResult {
  contractId: string;
  transactionHash: string;
  newWasmHash: string;
  ledger: number;
}
