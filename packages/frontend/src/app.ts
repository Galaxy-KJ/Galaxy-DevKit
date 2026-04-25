/**
 * Galaxy DevKit — Smart Wallet Playground
 *
 * App shell: wires the sidebar nav, session panel, TX panel, and handles
 * responsive drawer open/close with full keyboard navigation support.
 * WCAG 2.1 AA: skip link, ARIA landmarks, focus trap for mobile drawer.
 */

import './styles/main.css';
import { WalletSessionPanel, type SessionEntry } from './panels/wallet-session';
import { WalletTxPanel } from './panels/wallet-tx';

const RPC_URL = 'https://soroban-testnet.stellar.org';

type PanelId = 'session' | 'tx';

function getCurrentLedger(): Promise<number> {
  return fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestLedger', params: [] }),
  })
    .then(r => r.json())
    .then(data => (data?.result?.sequence as number) ?? 0)
    .catch(() => 0);
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

class App {
  private sidebar!: HTMLElement;
  private overlay!: HTMLElement;
  private hamburger!: HTMLButtonElement;
  private navLinks!: NodeListOf<HTMLAnchorElement>;
  private activePanel: PanelId = 'session';
  private panels: Map<PanelId, HTMLElement> = new Map();

  init(): void {
    document.documentElement.lang = 'en';

    const root = document.getElementById('app');
    if (!root) throw new Error('Missing #app root element');
    root.innerHTML = this.buildShellHTML();

    this.sidebar = document.getElementById('sidebar') as HTMLElement;
    this.overlay = document.getElementById('sidebar-overlay') as HTMLElement;
    this.hamburger = document.getElementById('hamburger-btn') as HTMLButtonElement;
    this.navLinks = document.querySelectorAll<HTMLAnchorElement>('.sidebar__nav-link');

    this.bindHamburger();
    this.bindNavLinks();
    this.bindOverlayClose();
    this.bindKeyboardNav();

    // Mount panels
    const sessionContainer = document.getElementById('panel-session') as HTMLElement;
    const txContainer = document.getElementById('panel-tx') as HTMLElement;
    this.panels.set('session', sessionContainer);
    this.panels.set('tx', txContainer);

    this.mountSessionPanel(sessionContainer);
    this.mountTxPanel(txContainer);

    this.showPanel('session');
  }

  private buildShellHTML(): string {
    return `
      <a class="skip-link" href="#main-content">Skip to main content</a>

      <header class="app-header" role="banner">
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
        <span class="app-header__logo">Galaxy DevKit — Wallet Playground</span>
      </header>

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
              <a
                href="#session"
                class="sidebar__nav-link"
                data-panel="session"
                aria-current="page"
              >Session Keys</a>
            </li>
            <li class="sidebar__nav-item">
              <a
                href="#tx"
                class="sidebar__nav-link"
                data-panel="tx"
              >Send Transaction</a>
            </li>
          </ul>
        </nav>

        <main id="main-content" class="main-content" role="main" tabindex="-1">
          <div id="panel-session" class="panel" role="region" aria-label="Session key management" hidden></div>
          <div id="panel-tx" class="panel" role="region" aria-label="Transaction builder" hidden></div>
        </main>
      </div>
    `;
  }

  private mountSessionPanel(container: HTMLElement): void {
    const sessions = getStoredSessions();
    const panel = new WalletSessionPanel(container, {
      onAddSessionKey: async (params) => {
        // Dynamic import keeps the wallet service out of the initial bundle
        const { SmartWalletService } = await import(
          '../../core/wallet/src/smart-wallet.service'
        );
        const { BrowserCredentialBackend } = await import(
          '../../core/wallet/src/credential-backends/browser.backend'
        );
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

        // Record the session locally for the active-sessions display
        const currentLedger = await getCurrentLedger();
        const LEDGER_CLOSE = 5;
        const expiresAtLedger =
          currentLedger + Math.ceil(params.ttlSeconds / LEDGER_CLOSE);
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

  private mountTxPanel(container: HTMLElement): void {
    new WalletTxPanel(
      container,
      { rpcUrl: RPC_URL },
      {
        onSign: async (walletAddress, unsignedXdr, credentialId) => {
          const { SmartWalletService } = await import(
            '../../core/wallet/src/smart-wallet.service'
          );
          const { BrowserCredentialBackend } = await import(
            '../../core/wallet/src/credential-backends/browser.backend'
          );
          const { TransactionBuilder } = await import('@stellar/stellar-sdk');
          const { Networks } = await import('@stellar/stellar-sdk');
          const svc = new SmartWalletService(
            { relyingPartyId: window.location.hostname },
            RPC_URL,
            undefined,
            undefined,
            new BrowserCredentialBackend()
          );
          const tx = TransactionBuilder.fromXDR(unsignedXdr, Networks.TESTNET);
          return svc.sign(walletAddress, tx as any, credentialId);
        },
        onSubmit: async (signedXdr) => {
          const { TxBuilderClient } = await import('./services/tx-builder.client');
          const client = new TxBuilderClient(RPC_URL);
          return client.submitSignedXdr(signedXdr);
        },
      }
    );
  }

  // ── Hamburger / drawer ───────────────────────────────────

  private bindHamburger(): void {
    this.hamburger.addEventListener('click', () => this.toggleDrawer());
  }

  private bindOverlayClose(): void {
    this.overlay.addEventListener('click', () => this.closeDrawer());
  }

  private openDrawer(): void {
    this.sidebar.classList.add('open');
    this.overlay.classList.add('visible');
    this.hamburger.setAttribute('aria-expanded', 'true');
    this.hamburger.setAttribute('aria-label', 'Close navigation menu');
    // Move focus to first nav link so keyboard users can navigate
    (this.sidebar.querySelector<HTMLAnchorElement>('.sidebar__nav-link'))?.focus();
  }

  private closeDrawer(): void {
    this.sidebar.classList.remove('open');
    this.overlay.classList.remove('visible');
    this.hamburger.setAttribute('aria-expanded', 'false');
    this.hamburger.setAttribute('aria-label', 'Open navigation menu');
    this.hamburger.focus();
  }

  private toggleDrawer(): void {
    if (this.sidebar.classList.contains('open')) {
      this.closeDrawer();
    } else {
      this.openDrawer();
    }
  }

  // ── Nav links ────────────────────────────────────────────

  private bindNavLinks(): void {
    this.navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const panelId = link.dataset['panel'] as PanelId;
        if (panelId) {
          this.showPanel(panelId);
          // Close drawer on mobile after selection
          if (window.innerWidth <= 768) this.closeDrawer();
          // Move focus to main content for screen readers
          (document.getElementById('main-content') as HTMLElement)?.focus();
        }
      });
    });
  }

  private showPanel(id: PanelId): void {
    this.activePanel = id;
    this.panels.forEach((el, key) => {
      el.hidden = key !== id;
    });
    this.navLinks.forEach(link => {
      const isCurrent = link.dataset['panel'] === id;
      link.setAttribute('aria-current', isCurrent ? 'page' : 'false');
    });
  }

  // ── Keyboard navigation ─────────────────────────────────

  private bindKeyboardNav(): void {
    // Close drawer on Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.sidebar.classList.contains('open')) {
        this.closeDrawer();
      }
    });

    // Arrow-key navigation within the sidebar nav list
    this.sidebar.addEventListener('keydown', (e) => {
      const links = [...this.sidebar.querySelectorAll<HTMLAnchorElement>('.sidebar__nav-link')];
      const idx = links.indexOf(document.activeElement as HTMLAnchorElement);
      if (idx === -1) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        links[(idx + 1) % links.length]?.focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        links[(idx - 1 + links.length) % links.length]?.focus();
      }
    });
  }
}

// Bootstrap when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new App().init());
} else {
  new App().init();
}
