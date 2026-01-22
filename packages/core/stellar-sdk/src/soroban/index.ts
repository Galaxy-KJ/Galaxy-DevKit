/**
 * @fileoverview Soroban exports
 * @description Main exports for Soroban functionality
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

// Main classes
export { SorobanContractManager } from './soroban-contract-manager';
export { ContractEventMonitor } from './utils/event-monitor';
export { TokenContractWrapper } from './helpers/token-contract-wrapper';
export { ContractFactory } from './helpers/contract-factory';

// Utilities
export { ScValConverter } from './utils/scval-converter';
export { AbiParser } from './utils/abi-parser';
export { ErrorParser, SorobanError } from './utils/error-parser';
export { FunctionSignatureBuilder } from './utils/function-signature-builder';
export { EventDecoder } from './utils/event-decoder';

// Types
export type {
  ContractSpec,
  ContractFunction,
  ContractEvent,
  ContractDeploymentParams,
  ContractInvocationParams,
  ContractStateQueryParams,
  ContractEventQueryParams,
  ContractDeploymentResult,
  InvocationResult,
  SimulationResult,
  ContractEventDetail,
  EventSubscription,
  ContractAbi,
  TokenContractInfo,
  ContractFactoryConfig,
  ContractUpgradeParams,
  ContractUpgradeResult,
  ContractWrapperOptions,
  AbiFunction,
  AbiArgument,
  AbiType,
  AbiField,
} from './types/contract-types';

export type { ScType } from './types/contract-types';
