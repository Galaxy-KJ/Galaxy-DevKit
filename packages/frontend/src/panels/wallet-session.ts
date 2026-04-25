/**
 * Session key creation and TTL management panel.
 *
 * Renders a form that lets users specify an Ed25519 public key and a
 * human-readable TTL (seconds, minutes, or hours).  On submit it calls
 * walletContract.add_session_key via SmartWalletService.addSessionSigner,
 * displays active sessions with remaining time, and handles timezone-safe
 * ledger-bound TTL conversions.
 */

import { ttlSecondsToLedgers } from '../../../core/wallet/src/smart-wallet.service';

export interface SessionEntry {
  sessionPublicKey: string;
  /** Ledger number at which this session expires */
  expiresAtLedger: number;
  /** Wall-clock creation timestamp (ms) */
  createdAt: number;
  /** Requested TTL in seconds */
  ttlSeconds: number;
}

/** Unit options exposed in the UI so users don't have to do mental maths */
export type TtlUnit = 'seconds' | 'minutes' | 'hours';

export function ttlToSeconds(value: number, unit: TtlUnit): number {
  switch (unit) {
    case 'minutes':
      return value * 60;
    case 'hours':
      return value * 3600;
    default:
      return value;
  }
}

/**
 * Returns ledger-based remaining TTL as a human-readable string.
 * Uses ledger count difference, not wall-clock time, so timezone
 * differences never affect the displayed value.
 */
export function formatRemainingLedgers(
  expiresAtLedger: number,
  currentLedger: number,
  ledgerCloseTimeSeconds = 5
): string {
  const remainingLedgers = expiresAtLedger - currentLedger;
  if (remainingLedgers <= 0) return 'Expired';
  const remainingSeconds = remainingLedgers * ledgerCloseTimeSeconds;
  if (remainingSeconds < 60) return `${remainingSeconds}s`;
  if (remainingSeconds < 3600) return `${Math.floor(remainingSeconds / 60)}m`;
  return `${Math.floor(remainingSeconds / 3600)}h ${Math.floor((remainingSeconds % 3600) / 60)}m`;
}

export interface AddSessionKeyParams {
  walletAddress: string;
  sessionPublicKey: string;
  ttlSeconds: number;
  credentialId: string;
}

export interface SessionKeyPanelCallbacks {
  /** Called when the user submits the form to add a session key */
  onAddSessionKey: (params: AddSessionKeyParams) => Promise<string>;
  /** Called to refresh the current ledger sequence */
  getCurrentLedger: () => Promise<number>;
}

export class WalletSessionPanel {
  private sessions: SessionEntry[] = [];
  private container: HTMLElement;
  private callbacks: SessionKeyPanelCallbacks;

  constructor(container: HTMLElement, callbacks: SessionKeyPanelCallbacks) {
    this.container = container;
    this.callbacks = callbacks;
    this.render();
  }

  /** Reload sessions list (e.g. after a new one is added) */
  setSessions(sessions: SessionEntry[]): void {
    this.sessions = sessions;
    this.renderSessionList();
  }

  private render(): void {
    this.container.innerHTML = '';
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'Session key management');

    const heading = document.createElement('h2');
    heading.id = 'session-panel-heading';
    heading.textContent = 'Session Keys';
    this.container.appendChild(heading);

    this.container.appendChild(this.buildForm());

    const listSection = document.createElement('section');
    listSection.id = 'session-list-section';
    listSection.setAttribute('aria-labelledby', 'session-list-heading');
    const listHeading = document.createElement('h3');
    listHeading.id = 'session-list-heading';
    listHeading.textContent = 'Active Sessions';
    listSection.appendChild(listHeading);

    const list = document.createElement('ul');
    list.id = 'session-list';
    list.setAttribute('aria-label', 'Active session keys');
    listSection.appendChild(list);
    this.container.appendChild(listSection);

    this.renderSessionList();
  }

  private buildForm(): HTMLFormElement {
    const form = document.createElement('form');
    form.id = 'add-session-form';
    form.setAttribute('aria-labelledby', 'session-panel-heading');
    form.setAttribute('novalidate', '');

    form.appendChild(this.buildField({
      id: 'session-wallet-address',
      label: 'Wallet Address (C…)',
      type: 'text',
      placeholder: 'CContract…',
      required: true,
    }));

    form.appendChild(this.buildField({
      id: 'session-public-key',
      label: 'Ed25519 Session Public Key (G…)',
      type: 'text',
      placeholder: 'GXXXXXXXX…',
      required: true,
    }));

    form.appendChild(this.buildField({
      id: 'session-credential-id',
      label: 'WebAuthn Credential ID',
      type: 'text',
      placeholder: 'base64url credential id',
      required: true,
    }));

    // TTL value + unit row
    const ttlRow = document.createElement('div');
    ttlRow.className = 'form-row';

    const ttlValueWrapper = document.createElement('div');
    const ttlValueLabel = document.createElement('label');
    ttlValueLabel.htmlFor = 'session-ttl-value';
    ttlValueLabel.textContent = 'TTL Value';
    const ttlValueInput = document.createElement('input');
    ttlValueInput.type = 'number';
    ttlValueInput.id = 'session-ttl-value';
    ttlValueInput.name = 'ttlValue';
    ttlValueInput.min = '1';
    ttlValueInput.value = '1';
    ttlValueInput.required = true;
    ttlValueInput.setAttribute('aria-describedby', 'session-ttl-hint');
    ttlValueWrapper.appendChild(ttlValueLabel);
    ttlValueWrapper.appendChild(ttlValueInput);

    const ttlUnitWrapper = document.createElement('div');
    const ttlUnitLabel = document.createElement('label');
    ttlUnitLabel.htmlFor = 'session-ttl-unit';
    ttlUnitLabel.textContent = 'Unit';
    const ttlUnitSelect = document.createElement('select');
    ttlUnitSelect.id = 'session-ttl-unit';
    ttlUnitSelect.name = 'ttlUnit';
    ttlUnitSelect.setAttribute('aria-label', 'TTL time unit');
    (['seconds', 'minutes', 'hours'] as TtlUnit[]).forEach(unit => {
      const opt = document.createElement('option');
      opt.value = unit;
      opt.textContent = unit.charAt(0).toUpperCase() + unit.slice(1);
      if (unit === 'hours') opt.selected = true;
      ttlUnitSelect.appendChild(opt);
    });
    ttlUnitWrapper.appendChild(ttlUnitLabel);
    ttlUnitWrapper.appendChild(ttlUnitSelect);

    ttlRow.appendChild(ttlValueWrapper);
    ttlRow.appendChild(ttlUnitWrapper);
    form.appendChild(ttlRow);

    const ttlHint = document.createElement('small');
    ttlHint.id = 'session-ttl-hint';
    ttlHint.textContent = 'Converted to ledger count using ~5 s/ledger. Timezone does not affect ledger TTL.';
    form.appendChild(ttlHint);

    // Ledger preview
    const ledgerPreview = document.createElement('p');
    ledgerPreview.id = 'session-ledger-preview';
    ledgerPreview.setAttribute('aria-live', 'polite');
    ledgerPreview.textContent = '';
    form.appendChild(ledgerPreview);

    const updatePreview = (): void => {
      const val = parseFloat(ttlValueInput.value);
      const unit = ttlUnitSelect.value as TtlUnit;
      if (!isNaN(val) && val > 0) {
        const secs = ttlToSeconds(val, unit);
        const ledgers = ttlSecondsToLedgers(secs);
        ledgerPreview.textContent = `≈ ${ledgers.toLocaleString()} ledgers (${secs.toLocaleString()} seconds)`;
      } else {
        ledgerPreview.textContent = '';
      }
    };
    ttlValueInput.addEventListener('input', updatePreview);
    ttlUnitSelect.addEventListener('change', updatePreview);
    updatePreview();

    // Status
    const status = document.createElement('p');
    status.id = 'session-form-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    form.appendChild(status);

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.textContent = 'Add Session Key';
    form.appendChild(submitBtn);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.textContent = '';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Adding…';

      const walletAddress = (form.querySelector('#session-wallet-address') as HTMLInputElement).value.trim();
      const sessionPublicKey = (form.querySelector('#session-public-key') as HTMLInputElement).value.trim();
      const credentialId = (form.querySelector('#session-credential-id') as HTMLInputElement).value.trim();
      const ttlValue = parseFloat(ttlValueInput.value);
      const ttlUnit = ttlUnitSelect.value as TtlUnit;

      if (!walletAddress || !sessionPublicKey || !credentialId) {
        status.textContent = 'All fields are required.';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Add Session Key';
        return;
      }
      if (isNaN(ttlValue) || ttlValue <= 0) {
        status.textContent = 'TTL must be a positive number.';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Add Session Key';
        return;
      }

      const ttlSeconds = ttlToSeconds(ttlValue, ttlUnit);

      try {
        const xdr = await this.callbacks.onAddSessionKey({
          walletAddress,
          sessionPublicKey,
          ttlSeconds,
          credentialId,
        });
        status.textContent = `Session key added. XDR: ${xdr.slice(0, 40)}…`;
        form.reset();
        updatePreview();
      } catch (err) {
        status.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Add Session Key';
      }
    });

    return form;
  }

  private buildField(opts: {
    id: string;
    label: string;
    type: string;
    placeholder?: string;
    required?: boolean;
  }): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'form-field';
    const label = document.createElement('label');
    label.htmlFor = opts.id;
    label.textContent = opts.label;
    const input = document.createElement('input');
    input.type = opts.type;
    input.id = opts.id;
    input.name = opts.id;
    if (opts.placeholder) input.placeholder = opts.placeholder;
    if (opts.required) input.required = true;
    wrapper.appendChild(label);
    wrapper.appendChild(input);
    return wrapper;
  }

  private renderSessionList(): void {
    const list = this.container.querySelector('#session-list');
    if (!list) return;
    list.innerHTML = '';

    if (this.sessions.length === 0) {
      const empty = document.createElement('li');
      empty.textContent = 'No active sessions.';
      list.appendChild(empty);
      return;
    }

    // getCurrentLedger is async; render optimistically and update once resolved
    this.callbacks.getCurrentLedger().then(currentLedger => {
      list.innerHTML = '';
      this.sessions.forEach(session => {
        const li = document.createElement('li');
        li.className = 'session-item';
        const remaining = formatRemainingLedgers(session.expiresAtLedger, currentLedger);
        const isExpired = remaining === 'Expired';
        if (isExpired) li.classList.add('session-expired');
        li.setAttribute('aria-label', `Session key ${session.sessionPublicKey.slice(0, 8)}… expires in ${remaining}`);
        li.innerHTML = `
          <span class="session-key">${session.sessionPublicKey.slice(0, 12)}…</span>
          <span class="session-ttl ${isExpired ? 'expired' : ''}" aria-label="Remaining time">${remaining}</span>
          <span class="session-ledger">Expires ledger ${session.expiresAtLedger.toLocaleString()}</span>
        `;
        list.appendChild(li);
      });
    });
  }
}
