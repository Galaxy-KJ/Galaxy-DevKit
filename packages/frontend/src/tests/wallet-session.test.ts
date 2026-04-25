/**
 * @jest-environment jest-environment-jsdom
 */
import {
  ttlToSeconds,
  formatRemainingLedgers,
  WalletSessionPanel,
  type SessionEntry,
  type SessionKeyPanelCallbacks,
} from '../panels/wallet-session';
import { ttlSecondsToLedgers } from '../../../core/wallet/src/smart-wallet.service';

// ── ttlToSeconds ─────────────────────────────────────────────────────────────

describe('ttlToSeconds', () => {
  it('returns raw value for seconds unit', () => {
    expect(ttlToSeconds(30, 'seconds')).toBe(30);
  });

  it('multiplies by 60 for minutes', () => {
    expect(ttlToSeconds(5, 'minutes')).toBe(300);
  });

  it('multiplies by 3600 for hours', () => {
    expect(ttlToSeconds(2, 'hours')).toBe(7200);
  });
});

// ── ttlSecondsToLedgers ──────────────────────────────────────────────────────

describe('ttlSecondsToLedgers', () => {
  it('converts exactly divisible seconds', () => {
    expect(ttlSecondsToLedgers(100)).toBe(20);
  });

  it('rounds up for non-divisible seconds', () => {
    expect(ttlSecondsToLedgers(6)).toBe(2);
    expect(ttlSecondsToLedgers(11)).toBe(3);
  });

  it('returns 1 ledger for values less than close time', () => {
    expect(ttlSecondsToLedgers(1)).toBe(1);
  });
});

// ── formatRemainingLedgers ───────────────────────────────────────────────────

describe('formatRemainingLedgers', () => {
  it('returns "Expired" when expiresAtLedger <= currentLedger', () => {
    expect(formatRemainingLedgers(100, 100)).toBe('Expired');
    expect(formatRemainingLedgers(99, 100)).toBe('Expired');
  });

  it('shows seconds for < 60 seconds remaining', () => {
    // 10 ledgers * 5 s = 50 s
    expect(formatRemainingLedgers(110, 100)).toBe('50s');
  });

  it('shows minutes for < 3600 seconds remaining', () => {
    // 60 ledgers * 5 s = 300 s = 5 m
    expect(formatRemainingLedgers(160, 100)).toBe('5m');
  });

  it('shows hours and minutes for >= 3600 seconds remaining', () => {
    // 900 ledgers * 5 s = 4500 s = 1h 15m
    expect(formatRemainingLedgers(1000, 100)).toBe('1h 15m');
  });

  it('uses custom ledgerCloseTimeSeconds', () => {
    // 10 ledgers * 6 s = 60 s = 1m
    expect(formatRemainingLedgers(110, 100, 6)).toBe('1m');
  });
});

// ── WalletSessionPanel DOM integration ──────────────────────────────────────

function createContainer(): HTMLDivElement {
  const div = document.createElement('div');
  document.body.appendChild(div);
  return div;
}

function makeCallbacks(
  overrides: Partial<SessionKeyPanelCallbacks> = {}
): SessionKeyPanelCallbacks {
  return {
    onAddSessionKey: jest.fn().mockResolvedValue('AXDR=='),
    getCurrentLedger: jest.fn().mockResolvedValue(1000),
    ...overrides,
  };
}

describe('WalletSessionPanel', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = createContainer();
  });

  afterEach(() => {
    container.remove();
  });

  it('renders form and session list', () => {
    new WalletSessionPanel(container, makeCallbacks());
    expect(container.querySelector('#add-session-form')).not.toBeNull();
    expect(container.querySelector('#session-list')).not.toBeNull();
  });

  it('shows empty state when no sessions', () => {
    new WalletSessionPanel(container, makeCallbacks());
    expect(container.querySelector('#session-list')?.textContent).toContain('No active sessions');
  });

  it('sets aria-label on the region', () => {
    new WalletSessionPanel(container, makeCallbacks());
    expect(container.getAttribute('aria-label')).toBe('Session key management');
  });

  it('renders session items when setSessions is called', async () => {
    const panel = new WalletSessionPanel(container, makeCallbacks());
    const sessions: SessionEntry[] = [
      { sessionPublicKey: 'GABC123', expiresAtLedger: 2000, createdAt: Date.now(), ttlSeconds: 3600 },
    ];
    panel.setSessions(sessions);
    // getCurrentLedger resolves async; flush microtasks
    await Promise.resolve();
    const list = container.querySelector('#session-list') as HTMLUListElement;
    expect(list.children.length).toBe(1);
  });

  it('disables submit and shows error for empty wallet address', async () => {
    new WalletSessionPanel(container, makeCallbacks());
    const form = container.querySelector('#add-session-form') as HTMLFormElement;
    // Set required fields but leave wallet address empty
    (form.querySelector('#session-public-key') as HTMLInputElement).value = 'GXXX';
    (form.querySelector('#session-credential-id') as HTMLInputElement).value = 'cred123';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    const status = container.querySelector('#session-form-status') as HTMLElement;
    expect(status.textContent).toContain('required');
  });

  it('calls onAddSessionKey with correct seconds conversion', async () => {
    const onAddSessionKey = jest.fn().mockResolvedValue('XDR');
    new WalletSessionPanel(container, makeCallbacks({ onAddSessionKey }));
    const form = container.querySelector('#add-session-form') as HTMLFormElement;

    (form.querySelector('#session-wallet-address') as HTMLInputElement).value = 'CADDR';
    (form.querySelector('#session-public-key') as HTMLInputElement).value = 'GKEY';
    (form.querySelector('#session-credential-id') as HTMLInputElement).value = 'CRED';
    (form.querySelector('#session-ttl-value') as HTMLInputElement).value = '1';
    (form.querySelector('#session-ttl-unit') as HTMLSelectElement).value = 'hours';

    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await Promise.resolve();
    await Promise.resolve(); // second tick for async callback

    expect(onAddSessionKey).toHaveBeenCalledWith(
      expect.objectContaining({ ttlSeconds: 3600 })
    );
  });

  it('shows ledger preview that updates with TTL input', () => {
    new WalletSessionPanel(container, makeCallbacks());
    const ttlInput = container.querySelector('#session-ttl-value') as HTMLInputElement;
    const preview = container.querySelector('#session-ledger-preview') as HTMLElement;
    ttlInput.value = '2';
    ttlInput.dispatchEvent(new Event('input'));
    // 2 hours = 7200 s → 1440 ledgers
    expect(preview.textContent).toContain('1,440');
  });
});
