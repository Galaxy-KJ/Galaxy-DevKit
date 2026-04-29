/**
 * @fileoverview WebAuthn virtual authenticator helpers for Playwright E2E tests
 * @description Wraps Chromium's CDP WebAuthn domain to create, manage, and tear
 *   down a virtual authenticator in-process. Tests import these helpers instead
 *   of touching CDP directly.
 *
 *   Non-Chromium browsers (Firefox, WebKit) do not expose the CDP WebAuthn API.
 *   Every exported function checks `isCdpSupported()` and no-ops gracefully so
 *   the same spec file can be run against any browser without crashing.
 *
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-04-28
 */

import type { BrowserContext, CDPSession, Page } from '@playwright/test';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VirtualAuthenticatorOptions {
  /**
   * Authenticator transport. Use 'internal' for platform authenticators
   * (Touch ID / Windows Hello style) which is the most realistic for
   * passkey / smart wallet flows.
   */
  transport?: 'usb' | 'nfc' | 'ble' | 'internal';
  /** Whether the authenticator supports resident (discoverable) credentials. */
  hasResidentKey?: boolean;
  /** Whether the authenticator supports user verification (biometric). */
  hasUserVerification?: boolean;
  /** Simulate user verification always passing. */
  isUserVerified?: boolean;
}

export interface VirtualAuthenticator {
  /** CDP authenticator ID returned by the browser. */
  authenticatorId: string;
  /** Tear down the authenticator and disable the CDP WebAuthn domain. */
  dispose: () => Promise<void>;
}

export interface CredentialInfo {
  credentialId: string;
  isResidentCredential: boolean;
  rpId: string;
  privateKey: string;
  userHandle: string;
  signCount: number;
}

// ─── Browser capability detection ─────────────────────────────────────────────

/**
 * Returns true when the page is running in Chromium (the only engine that
 * exposes the CDP WebAuthn virtual authenticator API).
 *
 * Use this to skip WebAuthn setup in Firefox / WebKit test runs:
 * ```ts
 * test.skip(!isCdpSupported(page), 'WebAuthn CDP only available in Chromium');
 * ```
 */
export function isCdpSupported(page: Page): boolean {
  // Playwright exposes browserType().name() via the browser context
  try {
    const ctx = page.context();
    // @ts-expect-error — _browser is an internal Playwright property
    const name: string = ctx._browser?.browserType()?.name?.() ?? '';
    return name === 'chromium';
  } catch {
    return false;
  }
}

// ─── CDP session helper ───────────────────────────────────────────────────────

/**
 * Open a CDP session on the given page.
 * Caller is responsible for closing it when done.
 */
export async function openCdpSession(page: Page): Promise<CDPSession> {
  return page.context().newCDPSession(page);
}

// ─── Virtual authenticator lifecycle ─────────────────────────────────────────

/**
 * Enable the CDP WebAuthn domain and add a virtual software authenticator.
 *
 * Must be called **before** navigating to the page under test so the
 * authenticator is in place when the browser's WebAuthn stack initialises.
 *
 * On non-Chromium browsers this returns a no-op stub so the same test file
 * works across all configured projects without crashing.
 *
 * @example
 * ```ts
 * test.beforeEach(async ({ page, context }) => {
 *   authenticator = await addVirtualAuthenticator(page, {
 *     transport: 'internal',
 *     hasResidentKey: true,
 *     hasUserVerification: true,
 *     isUserVerified: true,
 *   });
 * });
 *
 * test.afterEach(async () => {
 *   await authenticator.dispose();
 * });
 * ```
 */
export async function addVirtualAuthenticator(
  page: Page,
  options: VirtualAuthenticatorOptions = {},
): Promise<VirtualAuthenticator> {
  const {
    transport = 'internal',
    hasResidentKey = true,
    hasUserVerification = true,
    isUserVerified = true,
  } = options;

  // Graceful no-op for non-Chromium
  if (!isCdpSupported(page)) {
    return {
      authenticatorId: 'noop',
      dispose: async () => {},
    };
  }

  const cdp = await openCdpSession(page);

  await cdp.send('WebAuthn.enable', { enableUI: false });

  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport,
      hasResidentKey,
      hasUserVerification,
      isUserVerified,
      automaticPresenceSimulation: true,
    },
  });

  return {
    authenticatorId,
    dispose: async () => {
      try {
        await cdp.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
        await cdp.send('WebAuthn.disable');
      } catch {
        // Ignore errors during cleanup — the page may already be closed
      } finally {
        await cdp.detach().catch(() => {});
      }
    },
  };
}

// ─── Credential management ────────────────────────────────────────────────────

/**
 * List all credentials stored on a virtual authenticator.
 * Useful for asserting that registration created a credential.
 */
export async function listCredentials(
  page: Page,
  authenticatorId: string,
): Promise<CredentialInfo[]> {
  if (!isCdpSupported(page) || authenticatorId === 'noop') return [];

  const cdp = await openCdpSession(page);
  try {
    const { credentials } = await cdp.send('WebAuthn.getCredentials', {
      authenticatorId,
    });
    return credentials as CredentialInfo[];
  } finally {
    await cdp.detach().catch(() => {});
  }
}

/**
 * Clear all credentials from a virtual authenticator.
 * Call between tests to avoid credential bleed-through.
 */
export async function clearCredentials(
  page: Page,
  authenticatorId: string,
): Promise<void> {
  if (!isCdpSupported(page) || authenticatorId === 'noop') return;

  const cdp = await openCdpSession(page);
  try {
    await cdp.send('WebAuthn.clearCredentials', { authenticatorId });
  } finally {
    await cdp.detach().catch(() => {});
  }
}

// ─── Context-level helper (multi-page flows) ──────────────────────────────────

/**
 * Attach a virtual authenticator to an entire BrowserContext rather than a
 * single page. Use this when the test opens multiple pages (e.g. popup flows).
 *
 * Returns the same VirtualAuthenticator shape as addVirtualAuthenticator.
 */
export async function addVirtualAuthenticatorToContext(
  context: BrowserContext,
  options: VirtualAuthenticatorOptions = {},
): Promise<VirtualAuthenticator> {
  // Create an initial page just to open a CDP session on the context
  const page = context.pages()[0] ?? await context.newPage();
  return addVirtualAuthenticator(page, options);
}