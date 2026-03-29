/**
 * @fileoverview Soroban exports
 * @description Main exports for Soroban functionality
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

// Main classes
export { SorobanContractManager } from './soroban-contract-manager.js';
export { ContractEventMonitor } from './utils/event-monitor.js';
export { TokenContractWrapper } from './helpers/token-contract-wrapper.js';
export { ContractFactory } from './helpers/contract-factory.js';

// Utilities
export { ScValConverter } from './utils/scval-converter.js';
export { AbiParser } from './utils/abi-parser.js';
export { ErrorParser, SorobanError } from './utils/error-parser.js';
export { FunctionSignatureBuilder } from './utils/function-signature-builder.js';
export { EventDecoder } from './utils/event-decoder.js';

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
} from './types/contract-types.js';

export type { ScType } from './types/contract-types.js';
