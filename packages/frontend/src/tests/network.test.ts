/**
 * @fileoverview Tests for utils/network.ts
 * @description Covers NetworkStore state, localStorage persistence,
 *   subscriber notifications, write guards, UI helpers, and edge cases.
 * @author Galaxy DevKit Team
 */

// ─── localStorage mock ────────────────────────────────────────────────────────

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] ?? null),
    setItem: jest.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: jest.fn((key: string) => { delete store[key]; }),
    clear: jest.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// ─── window.location.reload mock ─────────────────────────────────────────────
// jsdom deeply proxies location.reload() through its internal Location wrapper,
// making it impossible to intercept via Object.defineProperty or jest.spyOn.
// Instead, NetworkStore exposes a _reloader injectable that tests override
// directly — no jsdom internals are touched at all.

const reloadMock = jest.fn();

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import {
  NetworkStore,
  ReadOnlyNetworkError,
  NETWORK_CONFIGS,
  syncWriteActions,
  syncNetworkPill,
  renderNetworkSwitcher,
  networkStore,
  type NetworkType,
} from '../utils/network.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function freshStore(initial?: NetworkType): NetworkStore {
  localStorageMock.clear();
  reloadMock.mockClear();
  if (initial) localStorageMock.setItem('galaxy_network', initial);
  const store = new NetworkStore();
  // Inject mock reloader — avoids jsdom's unimplemented navigation handler
  store._reloader = reloadMock;
  return store;
}

// ─── NETWORK_CONFIGS ─────────────────────────────────────────────────────────

describe('NETWORK_CONFIGS', () => {
  it('testnet is writable', () => {
    expect(NETWORK_CONFIGS.testnet.writable).toBe(true);
  });

  it('mainnet is not writable', () => {
    expect(NETWORK_CONFIGS.mainnet.writable).toBe(false);
  });

  it('testnet points to the correct Horizon URL', () => {
    expect(NETWORK_CONFIGS.testnet.horizonUrl).toBe('https://horizon-testnet.stellar.org');
  });

  it('mainnet points to the correct Horizon URL', () => {
    expect(NETWORK_CONFIGS.mainnet.horizonUrl).toBe('https://horizon.stellar.org');
  });
});

// ─── NetworkStore — initial state ─────────────────────────────────────────────

describe('NetworkStore — initial state', () => {
  beforeEach(() => localStorageMock.clear());

  it('defaults to testnet when localStorage is empty', () => {
    const store = freshStore();
    expect(store.getNetwork()).toBe('testnet');
  });

  it('restores testnet from localStorage', () => {
    const store = freshStore('testnet');
    expect(store.getNetwork()).toBe('testnet');
  });

  it('restores mainnet from localStorage', () => {
    const store = freshStore('mainnet');
    expect(store.getNetwork()).toBe('mainnet');
  });

  it('defaults to testnet when localStorage contains an invalid value', () => {
    localStorageMock.getItem.mockReturnValueOnce('invalid-network');
    const store = new NetworkStore();
    expect(store.getNetwork()).toBe('testnet');
  });
});

// ─── NetworkStore — read helpers ──────────────────────────────────────────────

describe('NetworkStore — read helpers', () => {
  it('isTestnet() returns true on testnet', () => {
    const store = freshStore('testnet');
    expect(store.isTestnet()).toBe(true);
    expect(store.isMainnet()).toBe(false);
  });

  it('isMainnet() returns true on mainnet', () => {
    const store = freshStore('mainnet');
    expect(store.isMainnet()).toBe(true);
    expect(store.isTestnet()).toBe(false);
  });

  it('getConfig() returns the correct config for the active network', () => {
    const store = freshStore('mainnet');
    expect(store.getConfig()).toStrictEqual(NETWORK_CONFIGS.mainnet);
  });
});

// ─── NetworkStore — switch ────────────────────────────────────────────────────

describe('NetworkStore — switch()', () => {
  beforeEach(() => {
    localStorageMock.clear();
    reloadMock.mockClear();
  });

  it('switches from testnet to mainnet', () => {
    const store = freshStore('testnet');
    store.switch('mainnet', false);
    expect(store.getNetwork()).toBe('mainnet');
  });

  it('persists the new network to localStorage', () => {
    const store = freshStore('testnet');
    store.switch('mainnet', false);
    expect(localStorageMock.setItem).toHaveBeenCalledWith('galaxy_network', 'mainnet');
  });

  it('triggers a page reload by default', () => {
    const store = freshStore('testnet');
    store.switch('mainnet'); // reload = true
    expect(reloadMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT reload when reload=false', () => {
    const store = freshStore('testnet');
    store.switch('mainnet', false);
    expect(reloadMock).not.toHaveBeenCalled();
  });

  it('is a no-op when switching to the current network', () => {
    const store = freshStore('testnet');
    const listener = jest.fn();
    store.subscribe(listener);
    store.switch('testnet', false);
    expect(listener).not.toHaveBeenCalled();
    expect(reloadMock).not.toHaveBeenCalled();
  });
});

// ─── NetworkStore — subscribers ───────────────────────────────────────────────

describe('NetworkStore — subscribe()', () => {
  it('notifies the listener with correct event on switch', () => {
    const store = freshStore('testnet');
    const listener = jest.fn();
    store.subscribe(listener);
    store.switch('mainnet', false);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      previous: 'testnet',
      current: 'mainnet',
      config: NETWORK_CONFIGS.mainnet,
    });
  });

  it('unsubscribe() stops further notifications', () => {
    const store = freshStore('testnet');
    const listener = jest.fn();
    const unsub = store.subscribe(listener);
    unsub();
    store.switch('mainnet', false);
    expect(listener).not.toHaveBeenCalled();
  });

  it('a throwing listener does not break other listeners', () => {
    const store = freshStore('testnet');
    const bad = jest.fn(() => { throw new Error('oops'); });
    const good = jest.fn();
    store.subscribe(bad);
    store.subscribe(good);
    store.switch('mainnet', false);
    expect(good).toHaveBeenCalledTimes(1);
  });

  it('multiple listeners all receive the event', () => {
    const store = freshStore('testnet');
    const a = jest.fn();
    const b = jest.fn();
    store.subscribe(a);
    store.subscribe(b);
    store.switch('mainnet', false);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});

// ─── NetworkStore — assertWritable ────────────────────────────────────────────

describe('NetworkStore — assertWritable()', () => {
  it('does not throw on testnet', () => {
    const store = freshStore('testnet');
    expect(() => store.assertWritable('Test op')).not.toThrow();
  });

  it('throws ReadOnlyNetworkError on mainnet', () => {
    const store = freshStore('mainnet');
    expect(() => store.assertWritable('Send transaction')).toThrow(ReadOnlyNetworkError);
  });

  it('error message contains the operation name', () => {
    const store = freshStore('mainnet');
    try {
      store.assertWritable('Sign XDR');
    } catch (err) {
      expect((err as Error).message).toContain('Sign XDR');
    }
  });

  it('error has type "read_only_network"', () => {
    const store = freshStore('mainnet');
    try {
      store.assertWritable();
    } catch (err) {
      expect((err as ReadOnlyNetworkError).type).toBe('read_only_network');
    }
  });
});

// ─── ReadOnlyNetworkError ─────────────────────────────────────────────────────

describe('ReadOnlyNetworkError', () => {
  it('is an instance of Error', () => {
    expect(new ReadOnlyNetworkError()).toBeInstanceOf(Error);
  });

  it('has name ReadOnlyNetworkError', () => {
    expect(new ReadOnlyNetworkError().name).toBe('ReadOnlyNetworkError');
  });

  it('includes a default message when no operation is passed', () => {
    expect(new ReadOnlyNetworkError().message).toContain('mainnet');
  });
});

// ─── syncWriteActions ─────────────────────────────────────────────────────────

describe('syncWriteActions()', () => {
  function buildRoot(network: NetworkType): HTMLElement {
    // Re-initialise store with the desired network
    localStorageMock.clear();
    localStorageMock.setItem('galaxy_network', network);

    const root = document.createElement('div');
    root.innerHTML = `
      <button data-write-action>Send</button>
      <input data-write-action type="submit" />
      <button>Read-only button</button>
    `;
    return root;
  }

  it('disables write-action elements on mainnet', () => {
    // Point the singleton to mainnet for this test
    (networkStore as any).current = 'mainnet';
    const root = buildRoot('mainnet');
    syncWriteActions(root);
    const buttons = root.querySelectorAll<HTMLButtonElement>('[data-write-action]');
    buttons.forEach(b => expect(b.disabled).toBe(true));
  });

  it('enables write-action elements on testnet', () => {
    (networkStore as any).current = 'testnet';
    const root = buildRoot('testnet');
    syncWriteActions(root);
    const buttons = root.querySelectorAll<HTMLButtonElement>('[data-write-action]');
    buttons.forEach(b => expect(b.disabled).toBe(false));
  });

  it('sets aria-disabled correctly', () => {
    (networkStore as any).current = 'mainnet';
    const root = buildRoot('mainnet');
    syncWriteActions(root);
    const btn = root.querySelector<HTMLButtonElement>('button[data-write-action]')!;
    expect(btn.getAttribute('aria-disabled')).toBe('true');
  });

  it('does not touch non-write-action elements', () => {
    (networkStore as any).current = 'mainnet';
    const root = buildRoot('mainnet');
    syncWriteActions(root);
    const plain = root.querySelector<HTMLButtonElement>('button:not([data-write-action])')!;
    expect(plain.disabled).toBe(false);
  });
});

// ─── syncNetworkPill ─────────────────────────────────────────────────────────

describe('syncNetworkPill()', () => {
  it('updates the pill text to match the active network label', () => {
    (networkStore as any).current = 'mainnet';
    const pill = document.createElement('div');
    pill.className = 'network-pill';
    document.body.appendChild(pill);
    syncNetworkPill();
    expect(pill.textContent).toBe('Mainnet');
    expect(pill.dataset['network']).toBe('mainnet');
    document.body.removeChild(pill);
  });

  it('does not throw when no pill element exists', () => {
    expect(() => syncNetworkPill('.nonexistent-pill')).not.toThrow();
  });
});

// ─── renderNetworkSwitcher ────────────────────────────────────────────────────

describe('renderNetworkSwitcher()', () => {
  beforeEach(() => {
    (networkStore as any).current = 'testnet';
    reloadMock.mockClear();
  });

  it('renders a <select> inside the container', () => {
    const container = document.createElement('div');
    renderNetworkSwitcher(container);
    expect(container.querySelector('select')).not.toBeNull();
  });

  it('pre-selects the current network option', () => {
    const container = document.createElement('div');
    renderNetworkSwitcher(container);
    const select = container.querySelector<HTMLSelectElement>('select')!;
    expect(select.value).toBe('testnet');
  });

  it('shows the mainnet warning when on mainnet', () => {
    (networkStore as any).current = 'mainnet';
    const container = document.createElement('div');
    renderNetworkSwitcher(container);
    expect(container.innerHTML).toContain('read-only');
  });

  it('does not show the warning on testnet', () => {
    (networkStore as any).current = 'testnet';
    const container = document.createElement('div');
    renderNetworkSwitcher(container);
    // Check the warning paragraph is absent — the option label contains
    // "read-only" as expected, so we query for the <p> element instead.
    expect(container.querySelector('.network-switcher__warning')).toBeNull();
  });

  it('calls networkStore.switch when the select changes', () => {
    const switchSpy = jest.spyOn(networkStore, 'switch');
    const container = document.createElement('div');
    renderNetworkSwitcher(container);
    const select = container.querySelector<HTMLSelectElement>('select')!;
    select.value = 'mainnet';
    select.dispatchEvent(new Event('change'));
    expect(switchSpy).toHaveBeenCalledWith('mainnet');
    switchSpy.mockRestore();
  });
});

// ─── Singleton ────────────────────────────────────────────────────────────────

describe('networkStore singleton', () => {
  it('is an instance of NetworkStore', () => {
    expect(networkStore).toBeInstanceOf(NetworkStore);
  });

  it('getNetwork() returns a valid NetworkType', () => {
    expect(['testnet', 'mainnet']).toContain(networkStore.getNetwork());
  });
});