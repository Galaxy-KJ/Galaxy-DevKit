/**
 * @fileoverview Network switcher utility — testnet / mainnet state management
 * @description Atomic network store that persists selection in localStorage,
 *   exposes typed helpers for read-only guard checks, and notifies subscribers
 *   on network changes. All write-action dispatchers should call
 *   `assertWritable()` (or `isMainnet()`) before executing.
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-04-26
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type NetworkType = 'testnet' | 'mainnet';

export interface NetworkConfig {
  /** Human-readable label shown in the UI pill */
  label: string;
  /** Soroban / Horizon RPC base URL */
  rpcUrl: string;
  /** Horizon REST base URL */
  horizonUrl: string;
  /** Stellar network passphrase */
  passphrase: string;
  /** Whether write operations (transactions) are permitted */
  writable: boolean;
}

export interface NetworkChangeEvent {
  previous: NetworkType;
  current: NetworkType;
  config: NetworkConfig;
}

export type NetworkChangeListener = (event: NetworkChangeEvent) => void;

// ─── Constants ────────────────────────────────────────────────────────────────

const STORAGE_KEY = 'galaxy_network';
const DEFAULT_NETWORK: NetworkType = 'testnet';

export const NETWORK_CONFIGS: Record<NetworkType, NetworkConfig> = {
  testnet: {
    label: 'Testnet',
    rpcUrl: 'https://soroban-testnet.stellar.org',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    passphrase: 'Test SDF Network ; September 2015',
    writable: true,
  },
  mainnet: {
    label: 'Mainnet',
    rpcUrl: 'https://soroban-mainnet.stellar.org',
    horizonUrl: 'https://horizon.stellar.org',
    passphrase: 'Public Global Stellar Network ; September 2015',
    writable: false,
  },
};

// ─── Read-only error ──────────────────────────────────────────────────────────

export class ReadOnlyNetworkError extends Error {
  readonly type = 'read_only_network' as const;

  constructor(operation = 'This operation') {
    super(
      `${operation} is not allowed on mainnet. Switch to testnet to perform write operations.`,
    );
    this.name = 'ReadOnlyNetworkError';
  }
}

// ─── Network store ────────────────────────────────────────────────────────────

/**
 * NetworkStore — singleton that owns the active network selection.
 *
 * Usage:
 * ```ts
 * import { networkStore } from './utils/network.js';
 *
 * // Read current network
 * const { rpcUrl } = networkStore.getConfig();
 *
 * // Guard write actions
 * networkStore.assertWritable('Send transaction');
 *
 * // Switch networks (persists + notifies listeners + reloads DOM)
 * networkStore.switch('mainnet');
 *
 * // Subscribe to changes
 * const unsub = networkStore.subscribe(({ current }) => console.log(current));
 * unsub(); // unsubscribe
 * ```
 */
export class NetworkStore {
  private current: NetworkType;
  private listeners: Set<NetworkChangeListener> = new Set();

  /**
   * Injectable reload function — overridden in tests to avoid jsdom's
   * unimplemented navigation handler. In production this calls
   * window.location.reload() as normal.
   * @internal
   */
  _reloader: () => void = () => {
    if (typeof window !== 'undefined') window.location.reload();
  };

  constructor() {
    this.current = this.loadFromStorage();
  }

  // ── Read ──────────────────────────────────────────────────────────────────

  /** Returns the active network key ('testnet' | 'mainnet'). */
  getNetwork(): NetworkType {
    return this.current;
  }

  /** Returns the full config object for the active network. */
  getConfig(): NetworkConfig {
    return NETWORK_CONFIGS[this.current];
  }

  /** Returns true when the active network is mainnet (read-only). */
  isMainnet(): boolean {
    return this.current === 'mainnet';
  }

  /** Returns true when the active network is testnet (writable). */
  isTestnet(): boolean {
    return this.current === 'testnet';
  }

  /**
   * Assert that the current network permits write operations.
   * Throws `ReadOnlyNetworkError` on mainnet.
   *
   * Call this at the top of every action that submits a transaction:
   * ```ts
   * networkStore.assertWritable('Send transaction');
   * await wallet.sign(...);
   * ```
   */
  assertWritable(operationName = 'This operation'): void {
    if (!this.getConfig().writable) {
      throw new ReadOnlyNetworkError(operationName);
    }
  }

  // ── Write ─────────────────────────────────────────────────────────────────

  /**
   * Switch the active network.
   *
   * - Persists the selection to localStorage.
   * - Notifies all subscribers synchronously.
   * - Reloads the page so no stale RPC connections, SDK instances, or
   *   panel state from the previous network survive in memory.
   *   (Per the issue notes: "Changing networks should forcefully reload the
   *   DOM to avoid trailing variables in memory from another network instance.")
   *
   * @param network  Target network key.
   * @param reload   Set to false only in tests or when you want to handle the
   *                 reload yourself. Defaults to true.
   */
  switch(network: NetworkType, reload = true): void {
    if (network === this.current) return;

    const previous = this.current;
    this.current = network;
    this.saveToStorage(network);

    const event: NetworkChangeEvent = {
      previous,
      current: network,
      config: NETWORK_CONFIGS[network],
    };
    this.notify(event);

    if (reload) {
      this._reloader();
    }
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────

  /**
   * Subscribe to network change events.
   * Returns an unsubscribe function.
   */
  subscribe(listener: NetworkChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // ── Storage ───────────────────────────────────────────────────────────────

  private loadFromStorage(): NetworkType {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'testnet' || stored === 'mainnet') return stored;
    } catch {
      // localStorage unavailable (SSR, private mode, etc.)
    }
    return DEFAULT_NETWORK;
  }

  private saveToStorage(network: NetworkType): void {
    try {
      localStorage.setItem(STORAGE_KEY, network);
    } catch {
      // Silently ignore write failures
    }
  }

  private notify(event: NetworkChangeEvent): void {
    this.listeners.forEach((fn) => {
      try { fn(event); } catch { /* listener errors must not break the store */ }
    });
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

/** Global network store — import this everywhere instead of instantiating. */
export const networkStore = new NetworkStore();

// ─── UI helpers ───────────────────────────────────────────────────────────────

/**
 * Update every element with `data-write-action` to reflect the current
 * network's writability. Adds `disabled` + `aria-disabled` on mainnet,
 * removes them on testnet.
 *
 * Call this once after `renderPlayground()` and again inside any
 * `networkStore.subscribe()` handler (before reload fires).
 */
export function syncWriteActions(root: Document | HTMLElement = document): void {
  const writable = networkStore.getConfig().writable;

  root
    .querySelectorAll<HTMLButtonElement | HTMLInputElement>('[data-write-action]')
    .forEach((el) => {
      el.disabled = !writable;
      el.setAttribute('aria-disabled', String(!writable));

      const hint = el.closest('[data-write-action-wrapper]')
        ?.querySelector<HTMLElement>('.mainnet-hint');

      if (hint) {
        hint.hidden = writable;
      }
    });
}

/**
 * Update the network pill element in the topbar to match the active network.
 * Adds a `data-network` attribute so CSS can colour it per network.
 */
export function syncNetworkPill(pillSelector = '.network-pill'): void {
  const pill = document.querySelector<HTMLElement>(pillSelector);
  if (!pill) return;
  const config = networkStore.getConfig();
  pill.textContent = config.label;
  pill.dataset['network'] = networkStore.getNetwork();
}

/**
 * Render a `<select>` network switcher into a given container element.
 *
 * ```ts
 * renderNetworkSwitcher(document.getElementById('network-switcher-slot')!);
 * ```
 */
export function renderNetworkSwitcher(container: HTMLElement): void {
  const current = networkStore.getNetwork();

  container.innerHTML = `
    <label class="network-switcher__label" for="network-select">
      Network
    </label>
    <div class="network-switcher__wrapper" data-network="${current}">
      <select
        id="network-select"
        class="network-switcher__select"
        aria-label="Select network"
      >
        <option value="testnet" ${current === 'testnet' ? 'selected' : ''}>
          🟢 Testnet
        </option>
        <option value="mainnet" ${current === 'mainnet' ? 'selected' : ''}>
          🔴 Mainnet (read-only)
        </option>
      </select>
    </div>
    ${
      networkStore.isMainnet()
        ? `<p class="network-switcher__warning" role="alert">
             ⚠️ Mainnet is <strong>read-only</strong>. Transaction buttons are disabled.
           </p>`
        : ''
    }
  `;

  container
    .querySelector<HTMLSelectElement>('#network-select')
    ?.addEventListener('change', (e) => {
      const value = (e.target as HTMLSelectElement).value as NetworkType;
      networkStore.switch(value); // triggers reload
    });
}