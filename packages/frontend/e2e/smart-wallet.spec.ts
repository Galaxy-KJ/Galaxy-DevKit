/**
 * @fileoverview Smart Wallet E2E test suite — WebAuthn flows
 * @description End-to-end tests covering the full smart wallet lifecycle:
 *   passkey registration, signer management, session key creation, and TX signing.
 *   Uses Chromium's CDP virtual authenticator API via the webauthn-mock helpers.
 *
 *   Tests are automatically skipped on Firefox and WebKit (no CDP WebAuthn support).
 *
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-04-28
 */

import { test, expect, type Page } from '@playwright/test';
import {
  addVirtualAuthenticator,
  isCdpSupported,
  listCredentials,
  clearCredentials,
  type VirtualAuthenticator,
} from './helpers/webauthn-mock';

// ─── Config ───────────────────────────────────────────────────────────────────

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173';

/** Standard virtual authenticator options — platform authenticator with UV */
const AUTH_OPTIONS = {
  transport: 'internal' as const,
  hasResidentKey: true,
  hasUserVerification: true,
  isUserVerified: true,
};

// ─── Shared state ─────────────────────────────────────────────────────────────

let authenticator: VirtualAuthenticator;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Navigate to the playground and wait for the SDK status to show Ready.
 */
async function gotoPlayground(page: Page): Promise<void> {
  await page.goto(BASE_URL);
  await page.waitForSelector('text=Ready', { timeout: 10_000 });
}

/**
 * Click a sidebar nav link and wait for its panel to become visible.
 */
async function openPanel(page: Page, panelName: string): Promise<void> {
  await page.click(`[data-panel="${panelName}"]`);
  await page.waitForSelector(`#${panelName}:not([hidden])`, { timeout: 5_000 });
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

test.beforeEach(async ({ page }) => {
  // Skip non-Chromium browsers gracefully
  test.skip(!isCdpSupported(page), 'WebAuthn CDP virtual authenticator only available in Chromium');

  // Set up virtual authenticator BEFORE navigating so it is in place when
  // the browser's WebAuthn stack initialises
  authenticator = await addVirtualAuthenticator(page, AUTH_OPTIONS);
  await gotoPlayground(page);
});

test.afterEach(async ({ page }) => {
  if (authenticator && authenticator.authenticatorId !== 'noop') {
    await clearCredentials(page, authenticator.authenticatorId);
    await authenticator.dispose();
  }
});

// ─── 1. Passkey registration (Create Wallet) ──────────────────────────────────

test.describe('Passkey registration — Create Wallet panel', () => {
  test('shows the Create Wallet panel by default', async ({ page }) => {
    const panel = page.locator('#wallet-create-panel');
    await expect(panel).toBeVisible();
  });

  test('registers a new passkey and creates a smart wallet', async ({ page }) => {
    await openPanel(page, 'wallet-create-panel');

    // Fill in a wallet label if the UI has one
    const labelInput = page.locator('[data-testid="wallet-label-input"]');
    if (await labelInput.isVisible()) {
      await labelInput.fill('E2E Test Wallet');
    }

    // Trigger registration — virtual authenticator intercepts the WebAuthn call
    await page.click('[data-testid="create-wallet-btn"]');

    // The wallet address should appear after successful registration
    await expect(page.locator('[data-testid="wallet-address"]')).toBeVisible({
      timeout: 15_000,
    });

    // Verify a credential was stored on the virtual authenticator
    const credentials = await listCredentials(page, authenticator.authenticatorId);
    expect(credentials.length).toBeGreaterThanOrEqual(1);
  });

  test('shows an error when registration is cancelled', async ({ page }) => {
    await openPanel(page, 'wallet-create-panel');

    // Temporarily make the virtual authenticator refuse presence
    // by detaching — the browser will timeout or error
    await authenticator.dispose();
    authenticator = { authenticatorId: 'noop', dispose: async () => {} };

    await page.click('[data-testid="create-wallet-btn"]');

    await expect(page.locator('[data-testid="wallet-error"]')).toBeVisible({
      timeout: 15_000,
    });
  });

  test('disables the create button while registration is in progress', async ({ page }) => {
    await openPanel(page, 'wallet-create-panel');
    const btn = page.locator('[data-testid="create-wallet-btn"]');
    await btn.click();

    // During async operation the button should be disabled
    await expect(btn).toBeDisabled();

    // After completion it should be enabled (or replaced by address display)
    await page.waitForSelector('[data-testid="wallet-address"]', { timeout: 15_000 });
  });
});

// ─── 2. Signer management ─────────────────────────────────────────────────────

test.describe('Signer management — Signers panel', () => {
  test.beforeEach(async ({ page }) => {
    // Pre-create a wallet so signer tests have something to work with
    await openPanel(page, 'wallet-create-panel');
    await page.click('[data-testid="create-wallet-btn"]');
    await page.waitForSelector('[data-testid="wallet-address"]', { timeout: 15_000 });
  });

  test('lists the initial signer after wallet creation', async ({ page }) => {
    await openPanel(page, 'wallet-signers-panel');

    await expect(page.locator('[data-testid="signer-list"]')).toBeVisible();
    const signers = page.locator('[data-testid="signer-item"]');
    await expect(signers).toHaveCount(1, { timeout: 10_000 });
  });

  test('adds a new signer successfully', async ({ page }) => {
    await openPanel(page, 'wallet-signers-panel');

    // Fill in the new signer's public key
    await page.fill(
      '[data-testid="new-signer-key-input"]',
      'GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDE',
    );
    await page.fill('[data-testid="new-signer-weight-input"]', '1');

    await page.click('[data-testid="add-signer-btn"]');

    // Virtual authenticator intercepts the WebAuthn assertion for signing
    const signers = page.locator('[data-testid="signer-item"]');
    await expect(signers).toHaveCount(2, { timeout: 15_000 });
  });

  test('removes a signer with confirmation', async ({ page }) => {
    await openPanel(page, 'wallet-signers-panel');

    // First add a second signer so we have one to remove
    await page.fill(
      '[data-testid="new-signer-key-input"]',
      'GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDE',
    );
    await page.fill('[data-testid="new-signer-weight-input"]', '1');
    await page.click('[data-testid="add-signer-btn"]');
    await expect(page.locator('[data-testid="signer-item"]')).toHaveCount(2, { timeout: 15_000 });

    // Now remove the second signer
    await page.locator('[data-testid="remove-signer-btn"]').nth(1).click();

    // Confirm the removal dialog if present
    const confirmBtn = page.locator('[data-testid="confirm-remove-btn"]');
    if (await confirmBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    await expect(page.locator('[data-testid="signer-item"]')).toHaveCount(1, { timeout: 15_000 });
  });
});

// ─── 3. Session key creation ──────────────────────────────────────────────────

test.describe('Session key creation — Session Keys panel', () => {
  test.beforeEach(async ({ page }) => {
    await openPanel(page, 'wallet-create-panel');
    await page.click('[data-testid="create-wallet-btn"]');
    await page.waitForSelector('[data-testid="wallet-address"]', { timeout: 15_000 });
  });

  test('creates a session key with a TTL', async ({ page }) => {
    await openPanel(page, 'wallet-session-panel');

    await expect(page.locator('[data-testid="session-panel"]')).toBeVisible();

    // Fill in session key parameters
    const ttlInput = page.locator('[data-testid="session-ttl-input"]');
    if (await ttlInput.isVisible()) {
      await ttlInput.fill('3600'); // 1 hour
    }

    const keyInput = page.locator('[data-testid="session-pubkey-input"]');
    if (await keyInput.isVisible()) {
      await keyInput.fill('GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDE');
    }

    await page.click('[data-testid="add-session-key-btn"]');

    // Session key should appear in the list
    await expect(page.locator('[data-testid="session-key-item"]')).toBeVisible({
      timeout: 15_000,
    });
  });

  test('session key list is empty before adding any keys', async ({ page }) => {
    await openPanel(page, 'wallet-session-panel');
    const items = page.locator('[data-testid="session-key-item"]');
    await expect(items).toHaveCount(0);
  });

  test('shows expiry information on a session key', async ({ page }) => {
    await openPanel(page, 'wallet-session-panel');

    const ttlInput = page.locator('[data-testid="session-ttl-input"]');
    if (await ttlInput.isVisible()) await ttlInput.fill('3600');

    const keyInput = page.locator('[data-testid="session-pubkey-input"]');
    if (await keyInput.isVisible()) {
      await keyInput.fill('GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDE');
    }

    await page.click('[data-testid="add-session-key-btn"]');

    const item = page.locator('[data-testid="session-key-item"]').first();
    await expect(item).toBeVisible({ timeout: 15_000 });

    // Expiry ledger or timestamp should be shown
    await expect(item.locator('[data-testid="session-key-expiry"]')).toBeVisible();
  });

  test('rejects session key creation on mainnet', async ({ page }) => {
    // Switch to mainnet if the network switcher is available
    const switcher = page.locator('#network-select');
    if (await switcher.isVisible()) {
      await switcher.selectOption('mainnet');
      // Page reloads on network switch — wait for it
      await page.waitForLoadState('domcontentloaded');
      await addVirtualAuthenticator(page, AUTH_OPTIONS);
    }

    await openPanel(page, 'wallet-session-panel');
    const addBtn = page.locator('[data-testid="add-session-key-btn"]');

    // On mainnet the button should be disabled (write-action guard)
    if (await switcher.isVisible()) {
      await expect(addBtn).toBeDisabled();
    }
  });
});

// ─── 4. Transaction signing ───────────────────────────────────────────────────

test.describe('Transaction signing — Send Transaction panel', () => {
  test.beforeEach(async ({ page }) => {
    await openPanel(page, 'wallet-create-panel');
    await page.click('[data-testid="create-wallet-btn"]');
    await page.waitForSelector('[data-testid="wallet-address"]', { timeout: 15_000 });
  });

  test('shows the Send Transaction panel', async ({ page }) => {
    await openPanel(page, 'wallet-tx-panel');
    await expect(page.locator('#wallet-tx-panel')).toBeVisible();
  });

  test('signs and submits a transaction successfully', async ({ page }) => {
    await openPanel(page, 'wallet-tx-panel');

    // Fill in a recipient address
    const toInput = page.locator('[data-testid="tx-to-input"]');
    if (await toInput.isVisible()) {
      await toInput.fill('GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDE');
    }

    const amountInput = page.locator('[data-testid="tx-amount-input"]');
    if (await amountInput.isVisible()) {
      await amountInput.fill('10');
    }

    await page.click('[data-testid="send-tx-btn"]');

    // Virtual authenticator intercepts the WebAuthn assertion for signing
    await expect(page.locator('[data-testid="tx-success"]')).toBeVisible({
      timeout: 30_000,
    });
  });

  test('shows TX hash after successful submission', async ({ page }) => {
    await openPanel(page, 'wallet-tx-panel');

    const toInput = page.locator('[data-testid="tx-to-input"]');
    if (await toInput.isVisible()) {
      await toInput.fill('GABC1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890ABCDE');
    }

    const amountInput = page.locator('[data-testid="tx-amount-input"]');
    if (await amountInput.isVisible()) {
      await amountInput.fill('10');
    }

    await page.click('[data-testid="send-tx-btn"]');
    await page.waitForSelector('[data-testid="tx-success"]', { timeout: 30_000 });

    await expect(page.locator('[data-testid="tx-hash"]')).toBeVisible();
    const hash = await page.locator('[data-testid="tx-hash"]').textContent();
    expect(hash).toMatch(/^[a-f0-9]{64}$/i); // 64-char hex
  });

  test('shows error when transaction is rejected by the network', async ({ page }) => {
    await openPanel(page, 'wallet-tx-panel');

    // Submit with no inputs — should fail validation or network rejection
    await page.click('[data-testid="send-tx-btn"]');

    await expect(
      page.locator('[data-testid="tx-error"], [data-testid="tx-validation-error"]'),
    ).toBeVisible({ timeout: 15_000 });
  });

  test('send button is disabled on mainnet', async ({ page }) => {
    const switcher = page.locator('#network-select');
    if (!await switcher.isVisible()) {
      test.skip(true, 'Network switcher not present — skipping mainnet guard test');
      return;
    }

    await switcher.selectOption('mainnet');
    await page.waitForLoadState('domcontentloaded');
    await addVirtualAuthenticator(page, AUTH_OPTIONS);

    await openPanel(page, 'wallet-tx-panel');
    await expect(page.locator('[data-testid="send-tx-btn"]')).toBeDisabled();
  });
});

// ─── 5. TX History ────────────────────────────────────────────────────────────

test.describe('Transaction history — Tx History panel', () => {
  test('shows empty state before any transactions', async ({ page }) => {
    await openPanel(page, 'wallet-tx-history-panel');
    await expect(page.locator('#wallet-tx-history-panel')).toBeVisible();

    const empty = page.locator('[data-testid="tx-history-empty"]');
    const list = page.locator('[data-testid="tx-history-item"]');

    // Either an empty state or zero items
    const emptyVisible = await empty.isVisible().catch(() => false);
    const count = await list.count();
    expect(emptyVisible || count === 0).toBe(true);
  });
});

// ─── 6. Navigation & accessibility ───────────────────────────────────────────

test.describe('Navigation and accessibility', () => {
  test('all sidebar links are keyboard navigable', async ({ page }) => {
    const links = page.locator('.sidebar__nav-link');
    const count = await links.count();
    expect(count).toBeGreaterThan(0);

    // Tab through each link and verify it becomes focusable
    await links.first().focus();
    for (let i = 0; i < count - 1; i++) {
      await page.keyboard.press('ArrowDown');
    }

    // Last link should be focused
    await expect(links.last()).toBeFocused();
  });

  test('Escape key closes the mobile sidebar', async ({ page }) => {
    // Simulate mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });
    await page.reload();
    await page.waitForSelector('text=Ready', { timeout: 10_000 });

    // Open hamburger
    await page.click('#hamburger-btn');
    await expect(page.locator('#sidebar')).toHaveClass(/open/);

    // Escape should close it
    await page.keyboard.press('Escape');
    await expect(page.locator('#sidebar')).not.toHaveClass(/open/);
  });

  test('skip link is present and targets main content', async ({ page }) => {
    const skipLink = page.locator('.skip-link');
    await expect(skipLink).toHaveAttribute('href', '#main-content');
  });
});