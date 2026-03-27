import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Galaxy DevKit E2E tests.
 *
 * Run with:
 *   npx playwright test                          # all E2E tests
 *   npx playwright test smart-wallet.e2e         # specific file
 *   STELLAR_NETWORK=testnet npx playwright test  # against testnet
 *
 * Tests that require env vars (FEE_SPONSOR_SECRET_KEY, FACTORY_CONTRACT_ID,
 * E2E_SUBMIT_TX_URL) skip gracefully when those vars are absent, so the suite
 * is always safe to run in CI — even without testnet access.
 */
export default defineConfig({
  testMatch: ['**/*.e2e.test.ts'],
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // E2E tests share testnet state; run sequentially.

  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],

  use: {
    // All tests run headless in CI.
    headless: true,
    // Capture screenshots on failure for debugging.
    screenshot: 'only-on-failure',
    // Capture traces on first retry for debugging.
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
