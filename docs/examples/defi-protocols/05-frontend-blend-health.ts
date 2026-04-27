/**
 * Frontend Blend panel example
 *
 * Demonstrates how to mount BlendPanel and prefill a signer key to
 * test borrow/repay flows with live health-factor updates.
 */

import { BlendClient, BlendPanel } from '@galaxy-kj/frontend';

const root = document.getElementById('blend-root');

if (!root) {
  throw new Error('Expected #blend-root container');
}

const panel = new BlendPanel(root, new BlendClient({
  baseUrl: '/api/v1/defi',
  jwt: '<YOUR_JWT>',
}));

// Optional: prefill a known wallet from your test fixtures.
const walletInput = root.querySelector('#blend-wallet') as HTMLInputElement | null;
if (walletInput) {
  walletInput.value = 'GBORROWER_TEST_ACCOUNT';
}

// Trigger first load for health-factor baseline.
const refreshButton = root.querySelector('#blend-refresh') as HTMLButtonElement | null;
refreshButton?.click();

void panel;
