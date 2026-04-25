import { Buffer } from 'buffer';
import { Keypair, Networks } from '@galaxy-kj/core-stellar-sdk';
import { SmartWalletClient } from './services/smart-wallet.client';
import { WalletCreatePanel } from './panels/wallet-create';
import { WalletSignersPanel } from './panels/wallet-signers';

export interface PlaygroundStatus {
  network: string;
  sdkReady: boolean;
  generatedAccount: string;
}

export function getPlaygroundStatus(): PlaygroundStatus {
  const keypair = Keypair.random();

  return {
    network: Networks.TESTNET,
    sdkReady: true,
    generatedAccount: keypair.publicKey(),
  };
}

export function renderPlayground(root: HTMLElement): PlaygroundStatus {
  const status = getPlaygroundStatus();

  root.innerHTML = `
    <section class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">Galaxy DevKit</p>
          <h1>Smart wallet playground</h1>
        </div>
        <div class="network-pill">${status.network}</div>
      </header>

      <section class="status-grid" aria-label="SDK status">
        <article>
          <span>SDK import</span>
          <strong>${status.sdkReady ? 'Ready' : 'Unavailable'}</strong>
        </article>
        <article>
          <span>Generated testnet account</span>
          <code>${status.generatedAccount}</code>
        </article>
        <article>
          <span>USDC issuer</span>
          <code>GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5</code>
        </article>
      </section>

      <section class="workspace" aria-label="Playground panels">
        <div id="wallet-create-panel"></div>
        <div id="wallet-signers-panel"></div>
      </section>
    </section>
  `;

  (window as typeof window & { Buffer: typeof Buffer }).Buffer = Buffer;
  const client = new SmartWalletClient();
  new WalletCreatePanel('wallet-create-panel', client);
  new WalletSignersPanel('wallet-signers-panel', client);

  return status;
}
