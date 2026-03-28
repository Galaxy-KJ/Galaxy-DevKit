/**
 * E2E test setup helpers for smart-wallet integration tests.
 *
 * Provides:
 *  - Playwright browser + virtual WebAuthn authenticator lifecycle management.
 *  - Helper functions that run WebAuthn operations in the browser page, so
 *    that real P-256 keypairs are exercised rather than mocked stubs.
 *  - Testnet RPC configuration derived from environment variables.
 *
 * ## Why Playwright?
 * `navigator.credentials.create/get` are browser APIs.  Playwright's CDP
 * (Chrome DevTools Protocol) virtual authenticator feature lets CI runners
 * simulate a platform authenticator that creates real P-256 credentials,
 * produces real CBOR-encoded attestations, and signs challenges — without
 * requiring physical hardware or a real display.
 *
 * ## Usage
 * ```ts
 * const env = await createE2EEnv();
 * const cred = await registerCredential(env.page);
 * // ... run tests ...
 * await teardownE2EEnv(env);
 * ```
 */

import { chromium, Browser, BrowserContext, Page, CDPSession } from '@playwright/test';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface E2EEnv {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  cdp: CDPSession;
  authenticatorId: string;
  testnetConfig: TestnetConfig;
}

export interface TestnetConfig {
  rpcUrl: string;
  networkPassphrase: string;
  factoryContractId: string;
  feeSponsorSecretKey: string;
  submitTxUrl: string;
}

/**
 * Credential data extracted from the browser after a successful
 * `navigator.credentials.create()` call.
 */
export interface BrowserCredential {
  /** base64url-encoded credential ID */
  credentialId: string;
  /** 65-byte SEC-1 uncompressed P-256 public key, base64-encoded */
  publicKeyBase64: string;
}

/**
 * WebAuthn assertion produced by the virtual authenticator when
 * `navigator.credentials.get()` is called from a browser page.
 */
export interface BrowserAssertion {
  credentialId: string;
  /** base64-encoded authenticatorData */
  authenticatorDataBase64: string;
  /** base64-encoded clientDataJSON */
  clientDataJSONBase64: string;
  /** base64-encoded DER-encoded ECDSA signature */
  signatureBase64: string;
}

// ---------------------------------------------------------------------------
// Environment / testnet config
// ---------------------------------------------------------------------------

/**
 * Reads testnet configuration from environment variables.
 *
 * Required env vars (set in `.env.local` or CI secrets):
 *   STELLAR_RPC_URL           — Soroban RPC endpoint (default: testnet public).
 *   STELLAR_NETWORK_PASSPHRASE — Network passphrase (default: testnet).
 *   FACTORY_CONTRACT_ID       — Deployed factory contract address (C…).
 *   FEE_SPONSOR_SECRET_KEY    — Stellar secret key (S…) of the fee-sponsor account.
 *   E2E_SUBMIT_TX_URL         — REST API base URL for /api/v1/wallets/submit-tx.
 */
export function getTestnetConfig(): TestnetConfig {
  return {
    rpcUrl:
      process.env.STELLAR_RPC_URL ??
      'https://soroban-testnet.stellar.org',
    networkPassphrase:
      process.env.STELLAR_NETWORK_PASSPHRASE ??
      'Test SDF Network ; September 2015',
    factoryContractId:
      process.env.FACTORY_CONTRACT_ID ??
      'CAX5RLKVBMYLASX546TKXCZIQSROJGQ7DUIH3LUDG3PR4UB3RRW5O5PE',
    feeSponsorSecretKey: process.env.FEE_SPONSOR_SECRET_KEY ?? '',
    submitTxUrl:
      process.env.E2E_SUBMIT_TX_URL ??
      'http://localhost:3000/api/v1/wallets/submit-tx',
  };
}

// ---------------------------------------------------------------------------
// Browser / authenticator lifecycle
// ---------------------------------------------------------------------------

/**
 * Launch a headless Chromium browser, create a blank page, and attach a
 * CDP virtual authenticator that intercepts `navigator.credentials.*` calls.
 *
 * The authenticator is configured as:
 *   - Protocol: CTAP2
 *   - Transport: internal (platform authenticator)
 *   - Resident keys: enabled
 *   - User verification: enabled and always succeeds
 */
export async function createE2EEnv(): Promise<E2EEnv> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Navigate to a blank page so the page's origin is predictable.
  await page.goto('about:blank');

  const cdp = await context.newCDPSession(page);

  // Enable the WebAuthn CDP domain.
  await cdp.send('WebAuthn.enable', { enableUI: false });

  // Add a virtual authenticator that behaves like a built-in platform
  // biometric sensor (Face ID / Touch ID) — always approves.
  const { authenticatorId } = (await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })) as { authenticatorId: string };

  const testnetConfig = getTestnetConfig();

  return { browser, context, page, cdp, authenticatorId, testnetConfig };
}

/**
 * Close the Playwright browser and release all resources.
 * Always call this in `afterAll` / `afterEach` to prevent resource leaks.
 */
export async function teardownE2EEnv(env: E2EEnv): Promise<void> {
  await env.browser.close();
}

// ---------------------------------------------------------------------------
// WebAuthn helpers (run in browser page via page.evaluate)
// ---------------------------------------------------------------------------

/**
 * Register a new WebAuthn credential using the virtual authenticator.
 *
 * Calls `navigator.credentials.create()` inside the browser page context.
 * The virtual authenticator intercepts the call, generates a real P-256
 * keypair, and returns a proper `AuthenticatorAttestationResponse`.
 *
 * @param page   An active Playwright Page with a virtual authenticator attached.
 * @param rpId   Relying-party ID (must match `page.url()` origin or "localhost").
 * @returns      `{ credentialId, publicKeyBase64 }` extracted from the response.
 */
export async function registerCredential(
  page: Page,
  rpId = 'localhost',
): Promise<BrowserCredential> {
  const result = await page.evaluate(
    async ({ rpId }: { rpId: string }) => {
      // Minimal valid create() options — enough to exercise the full pipeline.
      const credential = (await navigator.credentials.create({
        publicKey: {
          rp: { name: 'Galaxy Wallet E2E', id: rpId },
          user: {
            id: new Uint8Array(16).fill(1),
            name: 'e2e-test@galaxy.dev',
            displayName: 'E2E Test User',
          },
          challenge: new Uint8Array(32).fill(0xca),
          pubKeyCredParams: [{ alg: -7, type: 'public-key' as const }],
          authenticatorSelection: {
            authenticatorAttachment: 'platform',
            userVerification: 'required',
            residentKey: 'required',
          },
          timeout: 30_000,
        },
      })) as PublicKeyCredential | null;

      if (!credential) throw new Error('navigator.credentials.create() returned null');

      const response = credential.response as AuthenticatorAttestationResponse;
      const spkiBytes = response.getPublicKey();
      if (!spkiBytes) throw new Error('getPublicKey() returned null');

      // Extract the 65-byte uncompressed P-256 point from the SPKI DER blob.
      // The last 65 bytes of an EC P-256 SPKI are always the raw point.
      const spki = new Uint8Array(spkiBytes);
      const rawPoint = spki.slice(spki.length - 65);

      return {
        credentialId: credential.id,
        publicKeyBase64: btoa(String.fromCharCode(...rawPoint)),
      };
    },
    { rpId },
  );

  return result;
}

/**
 * Produce a WebAuthn assertion for an existing credential using the virtual
 * authenticator.
 *
 * Calls `navigator.credentials.get()` inside the browser page context, which
 * the virtual authenticator services with the P-256 key created during
 * `registerCredential()`.
 *
 * @param page          An active Playwright Page.
 * @param rpId          Relying-party ID (same value used at registration time).
 * @param credentialId  base64url credential ID returned by `registerCredential`.
 * @param challenge     The 32-byte challenge to sign (Soroban auth-entry hash).
 * @returns             Assertion data needed to build the Soroban `Signature` type.
 */
export async function getAssertion(
  page: Page,
  rpId: string,
  credentialId: string,
  challenge: Uint8Array,
): Promise<BrowserAssertion> {
  const result = await page.evaluate(
    async ({
      rpId,
      credentialId,
      challengeArray,
    }: {
      rpId: string;
      credentialId: string;
      challengeArray: number[];
    }) => {
      // Decode base64url credential ID to ArrayBuffer
      const b64 = credentialId.replace(/-/g, '+').replace(/_/g, '/');
      const rawId = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

      const credential = (await navigator.credentials.get({
        publicKey: {
          challenge: new Uint8Array(challengeArray),
          rpId,
          allowCredentials: [{ type: 'public-key' as const, id: rawId }],
          userVerification: 'required',
          timeout: 30_000,
        },
      })) as PublicKeyCredential | null;

      if (!credential) throw new Error('navigator.credentials.get() returned null');

      const response = credential.response as AuthenticatorAssertionResponse;

      const toBase64 = (buf: ArrayBuffer) =>
        btoa(String.fromCharCode(...new Uint8Array(buf)));

      return {
        credentialId: credential.id,
        authenticatorDataBase64: toBase64(response.authenticatorData),
        clientDataJSONBase64: toBase64(response.clientDataJSON),
        signatureBase64: toBase64(response.signature),
      };
    },
    { rpId, credentialId, challengeArray: Array.from(challenge) },
  );

  return result;
}

// ---------------------------------------------------------------------------
// Node-side assertion mock factory
// ---------------------------------------------------------------------------

/**
 * Build a `PublicKeyCredential`-shaped object (as seen in Node.js) from a
 * `BrowserAssertion` returned by `getAssertion()`.
 *
 * This lets you hand the browser-produced assertion directly to
 * `SmartWalletService.addSigner({ webAuthnAssertion: ... })` without
 * re-implementing WebAuthn in Node.js.
 */
export function buildPublicKeyCredential(
  assertion: BrowserAssertion,
): PublicKeyCredential {
  const decode = (b64: string) =>
    Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;

  return {
    id: assertion.credentialId,
    rawId: decode(assertion.credentialId),
    type: 'public-key',
    response: {
      clientDataJSON: decode(assertion.clientDataJSONBase64),
      authenticatorData: decode(assertion.authenticatorDataBase64),
      signature: decode(assertion.signatureBase64),
      userHandle: null,
    } as AuthenticatorAssertionResponse,
    getClientExtensionResults: () => ({}),
  } as unknown as PublicKeyCredential;
}
