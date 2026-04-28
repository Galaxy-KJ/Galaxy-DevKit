/**
 * @fileoverview Public API for @galaxy-kj/core-test-utils
 * @description Re-exports everything from the sub-modules so consumers only
 *   need a single import path.
 *
 * @example
 * ```ts
 * import {
 *   fundTestAccount,
 *   ContractFixture,
 *   FixtureRegistry,
 *   globalSetup,
 * } from '@galaxy-kj/core-test-utils';
 * ```
 *
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2025-04-28
 */

// Testnet account + transaction helpers
export {
  resolveConfig,
  requestFriendbot,
  fundTestAccount,
  fundExistingAccount,
  sleep,
  pollForTransaction,
  submitAndVerifyTransaction,
  buildAndSubmitPayment,
  globalSetup,
  getSharedKeypair,
  createRpcServer,
  SHARED_ACCOUNT_SECRET_ENV,
} from './testnet-helpers';

export type {
  StellarNetwork,
  TestnetConfig,
  FundedAccount,
  SubmitResult,
} from './testnet-helpers';

// Contract deployment fixtures
export {
  WasmStore,
  ContractFixture,
  FixtureRegistry,
  knownContract,
} from './contract-fixtures';

export type {
  DeployParams,
  DeployResult,
  InvokeParams,
  InvokeResult,
} from './contract-fixtures';
