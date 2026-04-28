/**
 * @fileoverview Jest globalSetup module
 * @description Funds a shared Stellar testnet account once before all test
 *   suites run.  Point `jest.config.js` at this file via:
 *
 *   ```js
 *   globalSetup: './packages/core/test-utils/src/setup/global-setup.ts'
 *   ```
 *
 *   The funded account's secret key is exported via
 *   `process.env.GALAXY_TEST_SHARED_ACCOUNT_SECRET` so individual tests can
 *   call `getSharedKeypair()` to reuse it.
 *
 *   ⚠️  For **parallel** test runs give each worker its own funded account by
 *   calling `fundTestAccount()` inside `beforeAll` instead of reading the
 *   shared key.  This avoids `SequenceNumber` conflicts when multiple workers
 *   submit transactions simultaneously.
 *
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2025-04-28
 */

import { globalSetup as runGlobalSetup } from '../testnet-helpers';
import type { TestnetConfig } from '../testnet-helpers';

/**
 * Jest `globalSetup` entry-point.
 * Called once by the Jest runner before any test environment is set up.
 */
export default async function globalSetup(
  _jestConfig: unknown
): Promise<void> {
  // Allow the network to be overridden via env; fall through to testnet default.
  const config: TestnetConfig = {};

  try {
    await runGlobalSetup(config);
  } catch (err) {
    // Wrap with context so CI logs are clear.
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[galaxy-test-utils] globalSetup failed — is testnet reachable? ${message}`
    );
  }
}
