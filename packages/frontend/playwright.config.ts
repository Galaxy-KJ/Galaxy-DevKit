/**
 * @fileoverview Playwright configuration for Galaxy DevKit frontend E2E tests
 * @description Configures Chromium (with CDP WebAuthn support) as the primary
 *   project. Firefox and WebKit are included as secondary projects so the same
 *   spec files can run against all engines — WebAuthn-specific tests are skipped
 *   automatically on non-Chromium via isCdpSupported() inside the helpers.
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-04-28
 */

import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
  // ── Test discovery ──────────────────────────────────────────────────────────
  testDir: './e2e',
  testMatch: '**/*.spec.ts',

  // ── Execution ───────────────────────────────────────────────────────────────
  /** Run all tests in each file sequentially to avoid shared state issues. */
  fullyParallel: false,
  /** Retry failed tests once in CI to absorb flakiness. */
  retries: process.env.CI ? 1 : 0,
  /** Use a single worker in CI; locally allow parallelism across spec files. */
  workers: process.env.CI ? 1 : undefined,

  // ── Reporting ───────────────────────────────────────────────────────────────
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],

  // ── Global test options ─────────────────────────────────────────────────────
  use: {
    baseURL: BASE_URL,
    /** Capture a screenshot only when a test fails. */
    screenshot: 'only-on-failure',
    /** Record a video only on the first retry of a failing test. */
    video: 'on-first-retry',
    /** Attach a Playwright trace on the first retry. */
    trace: 'on-first-retry',
    /** Default action timeout — generous to account for Soroban RPC latency. */
    actionTimeout: 15_000,
    /** Navigation timeout. */
    navigationTimeout: 30_000,
  },

  // ── Browser projects ────────────────────────────────────────────────────────
  projects: [
    // ── Primary: Chromium ─────────────────────────────────────────────────────
    // Only Chromium exposes the CDP WebAuthn domain required for virtual
    // authenticator tests. All smart wallet passkey flows run here.
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Launch args needed for the CDP WebAuthn virtual authenticator API
        launchOptions: {
          args: [
            '--enable-web-authentication-testing-api',
          ],
        },
        // Allow CDP sessions (required by webauthn-mock helpers)
        channel: 'chromium',
      },
    },

    // ── Secondary: Firefox ────────────────────────────────────────────────────
    // WebAuthn CDP not available — isCdpSupported() skips those tests.
    // Navigation, accessibility, and non-WebAuthn UI tests still run.
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    // ── Secondary: WebKit ─────────────────────────────────────────────────────
    // Same as Firefox — WebAuthn tests are skipped, UI tests run.
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    // ── Mobile viewports (Chromium engine) ───────────────────────────────────
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
    },
  ],

  // ── Dev server ──────────────────────────────────────────────────────────────
  // Automatically start the Vite dev server before running tests locally.
  // In CI, set PLAYWRIGHT_BASE_URL to the already-running preview URL instead.
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 60_000,
        stdout: 'pipe',
        stderr: 'pipe',
      },

  // ── Output ──────────────────────────────────────────────────────────────────
  outputDir: 'playwright-results',
});