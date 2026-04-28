import { Buffer } from 'buffer';
import { Keypair, Networks } from '@galaxy-kj/core-stellar-sdk';
import { SmartWalletClient } from './services/smart-wallet.client';
import { WalletCreatePanel } from './panels/wallet-create';
import { WalletSignersPanel } from './panels/wallet-signers';
import { WalletSessionPanel, type SessionEntry } from './panels/wallet-session';
import { WalletTxPanel } from './panels/wallet-tx';
import { TxHistoryPanel } from './panels/tx-history';
import { TxTrackerService } from './services/tx-tracker';
import { TxBuilderClient } from './services/tx-builder.client';
import { BlendPanel } from './panels/blend';
import { BlendClient } from './services/blend.client';
import { SecurityLimitsPanel } from './panels/security-limits';
import { SecurityLimitsClient } from './services/security-limits.client';

const RPC_URL = 'https://soroban-testnet.stellar.org';

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

async function getCurrentLedger(): Promise<number> {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestLedger', params: [] }),
  });
  const data = await res.json();
  const sequence = data?.result?.sequence as number | undefined;
  if (typeof sequence !== 'number') {
    throw new Error('Could not fetch current ledger sequence from RPC');
  }
  return sequence;
}

function getStoredSessions(): SessionEntry[] {
  try {
    const raw = localStorage.getItem('galaxy_sessions');
    return raw ? (JSON.parse(raw) as SessionEntry[]) : [];
  } catch {
    return [];
  }
}

function storeSessions(sessions: SessionEntry[]): void {
  localStorage.setItem('galaxy_sessions', JSON.stringify(sessions));
}

export function renderPlayground(root: HTMLElement): PlaygroundStatus {
  const status = getPlaygroundStatus();

  root.innerHTML = `
    <a class="skip-link" href="#main-content">Skip to main content</a>

    <section class="shell">
      <header class="topbar">
        <button
          class="hamburger"
          id="hamburger-btn"
          aria-label="Open navigation menu"
          aria-expanded="false"
          aria-controls="sidebar"
        >
          <span class="hamburger__bar"></span>
          <span class="hamburger__bar"></span>
          <span class="hamburger__bar"></span>
        </button>
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

      <div id="sidebar-overlay" class="sidebar-overlay" role="presentation"></div>

      <div class="app-shell">
        <nav
          id="sidebar"
          class="sidebar"
          role="navigation"
          aria-label="Wallet playground navigation"
        >
          <ul class="sidebar__nav" role="list">
            <li class="sidebar__nav-item">
              <a href="#wallet-create" class="sidebar__nav-link" data-panel="wallet-create-panel" aria-current="page">Create Wallet</a>
            </li>
            <li class="sidebar__nav-item">
              <a href="#wallet-signers" class="sidebar__nav-link" data-panel="wallet-signers-panel">Signers</a>
            </li>
            <li class="sidebar__nav-item">
              <a href="#session" class="sidebar__nav-link" data-panel="wallet-session-panel">Session Keys</a>
            </li>
            <li class="sidebar__nav-item">
              <a href="#tx" class="sidebar__nav-link" data-panel="wallet-tx-panel">Send Transaction</a>
            </li>
            <li class="sidebar__nav-item">
              <a href="#tx-history" class="sidebar__nav-link" data-panel="wallet-tx-history-panel">Tx History</a>
            </li>
            <li class="sidebar__nav-item">
              <a href="#blend" class="sidebar__nav-link" data-panel="blend-panel">Blend</a>
            </li>
            <li class="sidebar__nav-item">
              <a href="#security-limits" class="sidebar__nav-link" data-panel="security-limits-panel">Security Limits</a>
            </li>
          </ul>
        </nav>

        <main id="main-content" class="main-content workspace" role="main" tabindex="-1" aria-label="Playground panels">
          <div id="wallet-create-panel" class="panel"></div>
          <div id="wallet-signers-panel" class="panel"></div>
          <div id="wallet-session-panel" class="panel" hidden></div>
          <div id="wallet-tx-panel" class="panel" hidden></div>
          <div id="wallet-tx-history-panel" class="panel" hidden></div>
          <div id="blend-panel" class="panel" hidden></div>
          <div id="security-limits-panel" class="panel" hidden></div>
        </main>
      </div>
    </section>
  `;

  (window as typeof window & { Buffer: typeof Buffer }).Buffer = Buffer;

  const client = new SmartWalletClient();
  const txTracker = new TxTrackerService();
  new WalletCreatePanel('wallet-create-panel', client);
  new WalletSignersPanel('wallet-signers-panel', client);

  mountSessionPanel(document.getElementById('wallet-session-panel')!);
  mountTxPanel(document.getElementById('wallet-tx-panel')!, client, txTracker);
  mountTxHistoryPanel(
    document.getElementById('wallet-tx-history-panel')!,
    txTracker
  );
  new BlendPanel('blend-panel', new BlendClient());
  new SecurityLimitsPanel('security-limits-panel', new SecurityLimitsClient());

  bindNav();
  bindHamburger();

  return status;
}

function mountSessionPanel(container: HTMLElement): void {
  const LEDGER_CLOSE = 5;
  const sessions = getStoredSessions();
  const panel = new WalletSessionPanel(container, {
    onAddSessionKey: async (params) => {
      const { SmartWalletService } = await import('@galaxy-kj/core-wallet');
      const { BrowserCredentialBackend } = await import('@galaxy-kj/core-wallet/credential-backends/browser.backend');
      const svc = new SmartWalletService(
        { relyingPartyId: window.location.hostname },
        RPC_URL,
        undefined,
        undefined,
        new BrowserCredentialBackend()
      );
      const xdr = await svc.addSessionSigner({
        walletAddress: params.walletAddress,
        sessionPublicKey: params.sessionPublicKey,
        ttlSeconds: params.ttlSeconds,
        credentialId: params.credentialId,
      });

      const currentLedger = await getCurrentLedger();
      const expiresAtLedger = currentLedger + Math.ceil(params.ttlSeconds / LEDGER_CLOSE);
      const updated: SessionEntry[] = [
        ...getStoredSessions(),
        {
          sessionPublicKey: params.sessionPublicKey,
          expiresAtLedger,
          createdAt: Date.now(),
          ttlSeconds: params.ttlSeconds,
        },
      ];
      storeSessions(updated);
      panel.setSessions(updated);
      return xdr;
    },
    getCurrentLedger,
  });
  panel.setSessions(sessions);
}

function mountTxPanel(
  container: HTMLElement,
  client: SmartWalletClient,
  txTracker: TxTrackerService
): void {
  const txClient = new TxBuilderClient(RPC_URL);

  new WalletTxPanel(
    container,
    { rpcUrl: RPC_URL, txTracker },
    {
      onSign: async (walletAddress: string, unsignedXdr: string, credentialId: string) => {
        const { TransactionBuilder, Networks } = await import('@stellar/stellar-sdk');
        const service = client.getService();
        const tx = TransactionBuilder.fromXDR(unsignedXdr, Networks.TESTNET);
        return service.sign(walletAddress, tx as any, credentialId);
      },
      onSubmit: (signedXdr: string) => txClient.submitSignedXdr(signedXdr),
    }
  );
}

function mountTxHistoryPanel(
  container: HTMLElement,
  txTracker: TxTrackerService
): void {
  const txClient = new TxBuilderClient(RPC_URL);
  new TxHistoryPanel(container, txTracker, {
    onResimulateFailedTx: async (entry) => {
      await txClient.resimulateXdr(entry.unsignedXdr);
    },
  });
}

function bindNav(): void {
  const links = document.querySelectorAll<HTMLAnchorElement>('.sidebar__nav-link');
  const panels = document.querySelectorAll<HTMLElement>('.main-content .panel');

  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = link.dataset['panel'];
      panels.forEach(p => { p.hidden = p.id !== targetId; });
      links.forEach(l => l.setAttribute('aria-current', l === link ? 'page' : 'false'));
      if (window.innerWidth <= 768) closeSidebar();
      (document.getElementById('main-content') as HTMLElement)?.focus();
    });
  });

  document.getElementById('sidebar')?.addEventListener('keydown', (e) => {
    const all = [...document.querySelectorAll<HTMLAnchorElement>('.sidebar__nav-link')];
    const idx = all.indexOf(document.activeElement as HTMLAnchorElement);
    if (idx === -1) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); all[(idx + 1) % all.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); all[(idx - 1 + all.length) % all.length]?.focus(); }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSidebar();
  });
}

function bindHamburger(): void {
  const btn = document.getElementById('hamburger-btn') as HTMLButtonElement | null;
  const overlay = document.getElementById('sidebar-overlay');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const sidebar = document.getElementById('sidebar')!;
    if (sidebar.classList.contains('open')) closeSidebar();
    else openSidebar();
  });

  overlay?.addEventListener('click', closeSidebar);
}

function openSidebar(): void {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const btn = document.getElementById('hamburger-btn') as HTMLButtonElement | null;
  sidebar?.classList.add('open');
  overlay?.classList.add('visible');
  btn?.setAttribute('aria-expanded', 'true');
  btn?.setAttribute('aria-label', 'Close navigation menu');
  sidebar?.querySelector<HTMLAnchorElement>('.sidebar__nav-link')?.focus();
}

function closeSidebar(): void {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  const btn = document.getElementById('hamburger-btn') as HTMLButtonElement | null;
  sidebar?.classList.remove('open');
  overlay?.classList.remove('visible');
  btn?.setAttribute('aria-expanded', 'false');
  btn?.setAttribute('aria-label', 'Open navigation menu');
}
