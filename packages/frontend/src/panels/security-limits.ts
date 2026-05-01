import {
  SecurityLimitsClient,
  type LimitType,
  type RiskLevel,
} from '../services/security-limits.client';
import { assertWriteOperation } from '../actions';

interface SecurityLimitsPanelClient {
  createSecurityLimit(input: {
    owner: string;
    limitType: LimitType;
    asset: string;
    maxAmount: number;
    customWindowSeconds?: number;
  }): Promise<unknown>;
  listSecurityLimits(owner: string): Promise<Array<{
    id: number;
    asset: string;
    limitType: LimitType;
    maxAmount: number;
    currentUsage: number;
    isActive: boolean;
  }>>;
  setRiskProfile(input: {
    owner: string;
    riskLevel: RiskLevel;
    maxDailyVolume: number;
    maxSingleTransaction: number;
    allowedAssets: string[];
    blacklistedAssets: string[];
  }): Promise<unknown>;
  checkTransactionAllowed(owner: string, asset: string, amount: number): Promise<{ allowed: boolean; reason: string }>;
  recordTransaction(owner: string, asset: string, amount: number, txHash?: string): Promise<unknown>;
  getTransactionRecords(owner?: string): Promise<Array<{
    id: number;
    asset: string;
    amount: number;
    transactionHash: string;
  }>>;
}

const LIMIT_TYPES: LimitType[] = ['Daily', 'Weekly', 'Monthly', 'PerTransaction', 'PerHour', 'Custom'];
const RISK_LEVELS: RiskLevel[] = ['Low', 'Medium', 'High', 'Restricted'];

export class SecurityLimitsPanel {
  private readonly container: HTMLElement;
  private readonly client: SecurityLimitsPanelClient;

  constructor(
    container: string | HTMLElement,
    client: SecurityLimitsPanelClient = new SecurityLimitsClient()
  ) {
    this.container = typeof container === 'string'
      ? (document.getElementById(container) as HTMLElement)
      : container;

    if (!this.container) {
      throw new Error('SecurityLimitsPanel container is required');
    }

    this.client = client;
    this.render();
  }

  private render(): void {
    this.container.innerHTML = `
      <section class="security-limits-panel" aria-label="Security limits management">
        <h2>Security Limits</h2>
        <p class="blend-subtitle">Create limits, set risk profiles, and check transactions before execution.</p>

        <div class="form-field">
          <label for="sl-owner">Owner Address</label>
          <input id="sl-owner" type="text" placeholder="G... or C..." autocomplete="off" />
        </div>

        <h3>Create Allowance</h3>
        <div class="blend-grid">
          <div class="form-field">
            <label for="sl-asset">Asset</label>
            <input id="sl-asset" type="text" value="XLM" />
          </div>
          <div class="form-field">
            <label for="sl-max-amount">Max Amount</label>
            <input id="sl-max-amount" type="number" min="0" step="any" value="1000" />
          </div>
          <div class="form-field">
            <label for="sl-limit-type">Limit Type</label>
            <select id="sl-limit-type">${LIMIT_TYPES.map((v) => `<option value="${v}">${v}</option>`).join('')}</select>
          </div>
          <div class="form-field">
            <label for="sl-custom-window">Custom Window (seconds)</label>
            <input id="sl-custom-window" type="number" min="1" step="1" value="3600" />
          </div>
        </div>

        <div class="actions">
          <button id="sl-create-limit" type="button">Create Limit</button>
          <button id="sl-refresh" type="button">Refresh Limits</button>
        </div>

        <h3>Risk Profile</h3>
        <div class="blend-grid">
          <div class="form-field">
            <label for="sl-risk-level">Risk Level</label>
            <select id="sl-risk-level">${RISK_LEVELS.map((v) => `<option value="${v}">${v}</option>`).join('')}</select>
          </div>
          <div class="form-field">
            <label for="sl-max-daily">Max Daily Volume</label>
            <input id="sl-max-daily" type="number" min="0" step="any" value="5000" />
          </div>
          <div class="form-field">
            <label for="sl-max-single">Max Single Tx</label>
            <input id="sl-max-single" type="number" min="0" step="any" value="1000" />
          </div>
          <div class="form-field">
            <label for="sl-allowed-assets">Allowed Assets (comma-separated)</label>
            <input id="sl-allowed-assets" type="text" placeholder="XLM,USDC" />
          </div>
          <div class="form-field">
            <label for="sl-blacklisted-assets">Blacklisted Assets (comma-separated)</label>
            <input id="sl-blacklisted-assets" type="text" placeholder="BLND" />
          </div>
        </div>

        <div class="actions">
          <button id="sl-set-profile" type="button">Set Risk Profile</button>
        </div>

        <h3>Check Transaction</h3>
        <div class="blend-grid">
          <div class="form-field">
            <label for="sl-check-asset">Asset</label>
            <input id="sl-check-asset" type="text" value="XLM" />
          </div>
          <div class="form-field">
            <label for="sl-check-amount">Amount</label>
            <input id="sl-check-amount" type="number" min="0" step="any" value="25" />
          </div>
        </div>

        <div class="actions">
          <button id="sl-check" type="button">Check Allowed</button>
          <button id="sl-record" type="button">Record Transaction</button>
        </div>

        <p id="sl-check-result" class="status status-info" role="status" aria-live="polite">No transaction checked yet.</p>
        <pre id="sl-limits" class="blend-json" aria-label="Security limits"></pre>
        <pre id="sl-records" class="blend-json" aria-label="Security transaction records"></pre>
        <p id="sl-status" class="status status-info" role="status" aria-live="polite">Ready.</p>
      </section>
    `;

    this.byId<HTMLButtonElement>('sl-create-limit').addEventListener('click', () => {
      void this.createLimit();
    });
    this.byId<HTMLButtonElement>('sl-set-profile').addEventListener('click', () => {
      void this.setRiskProfile();
    });
    this.byId<HTMLButtonElement>('sl-check').addEventListener('click', () => {
      void this.checkTransaction();
    });
    this.byId<HTMLButtonElement>('sl-record').addEventListener('click', () => {
      void this.recordTransaction();
    });
    this.byId<HTMLButtonElement>('sl-refresh').addEventListener('click', () => {
      void this.refreshData();
    });
  }

  private async createLimit(): Promise<void> {
    const owner = this.byId<HTMLInputElement>('sl-owner').value.trim();
    const asset = this.byId<HTMLInputElement>('sl-asset').value.trim();
    const maxAmount = Number(this.byId<HTMLInputElement>('sl-max-amount').value);
    const limitType = this.byId<HTMLSelectElement>('sl-limit-type').value as LimitType;
    const customWindowSeconds = Number(this.byId<HTMLInputElement>('sl-custom-window').value);

    if (!owner || !asset || !(maxAmount > 0)) {
      this.setStatus('Owner, asset, and max amount are required.', 'error');
      return;
    }

    try {
      assertWriteOperation();
      await this.client.createSecurityLimit({
        owner,
        asset,
        maxAmount,
        limitType,
        customWindowSeconds: limitType === 'Custom' ? customWindowSeconds : undefined,
      });
      this.setStatus('Security limit created.', 'success');
      await this.refreshData();
    } catch (err) {
      this.setStatus(`Error: ${formatError(err)}`, 'error');
    }
  }

  private async setRiskProfile(): Promise<void> {
    const owner = this.byId<HTMLInputElement>('sl-owner').value.trim();
    if (!owner) {
      this.setStatus('Owner is required.', 'error');
      return;
    }

    try {
      assertWriteOperation();
      await this.client.setRiskProfile({
        owner,
        riskLevel: this.byId<HTMLSelectElement>('sl-risk-level').value as RiskLevel,
        maxDailyVolume: Number(this.byId<HTMLInputElement>('sl-max-daily').value) || 0,
        maxSingleTransaction: Number(this.byId<HTMLInputElement>('sl-max-single').value) || 0,
        allowedAssets: splitCsv(this.byId<HTMLInputElement>('sl-allowed-assets').value),
        blacklistedAssets: splitCsv(this.byId<HTMLInputElement>('sl-blacklisted-assets').value),
      });
      this.setStatus('Risk profile updated.', 'success');
    } catch (err) {
      this.setStatus(`Error: ${formatError(err)}`, 'error');
    }
  }

  private async checkTransaction(): Promise<void> {
    const owner = this.byId<HTMLInputElement>('sl-owner').value.trim();
    const asset = this.byId<HTMLInputElement>('sl-check-asset').value.trim();
    const amount = Number(this.byId<HTMLInputElement>('sl-check-amount').value);
    if (!owner || !asset || !(amount > 0)) {
      this.setStatus('Owner, asset, and amount are required.', 'error');
      return;
    }

    try {
      const result = await this.client.checkTransactionAllowed(owner, asset, amount);
      const resultEl = this.byId<HTMLElement>('sl-check-result');
      resultEl.textContent = `${result.allowed ? 'Allowed' : 'Blocked'}: ${result.reason}`;
      resultEl.className = `status ${result.allowed ? 'status-success' : 'status-error'}`;
      this.setStatus('Transaction check completed.', 'info');
    } catch (err) {
      this.setStatus(`Error: ${formatError(err)}`, 'error');
    }
  }

  private async recordTransaction(): Promise<void> {
    const owner = this.byId<HTMLInputElement>('sl-owner').value.trim();
    const asset = this.byId<HTMLInputElement>('sl-check-asset').value.trim();
    const amount = Number(this.byId<HTMLInputElement>('sl-check-amount').value);

    if (!owner || !asset || !(amount > 0)) {
      this.setStatus('Owner, asset, and amount are required to record a transaction.', 'error');
      return;
    }

    try {
      assertWriteOperation();
      await this.client.recordTransaction(owner, asset, amount);
      this.setStatus('Transaction recorded.', 'success');
      await this.refreshData();
    } catch (err) {
      this.setStatus(`Error: ${formatError(err)}`, 'error');
    }
  }

  private async refreshData(): Promise<void> {
    const owner = this.byId<HTMLInputElement>('sl-owner').value.trim();
    if (!owner) {
      this.byId<HTMLElement>('sl-limits').textContent = '[]';
      this.byId<HTMLElement>('sl-records').textContent = '[]';
      return;
    }

    try {
      const [limits, records] = await Promise.all([
        this.client.listSecurityLimits(owner),
        this.client.getTransactionRecords(owner),
      ]);

      this.byId<HTMLElement>('sl-limits').textContent = JSON.stringify(limits, null, 2);
      this.byId<HTMLElement>('sl-records').textContent = JSON.stringify(records, null, 2);
    } catch (err) {
      this.setStatus(`Error: ${formatError(err)}`, 'error');
    }
  }

  private setStatus(message: string, tone: 'info' | 'success' | 'error'): void {
    const el = this.byId<HTMLElement>('sl-status');
    el.textContent = message;
    el.className = `status status-${tone}`;
  }

  private byId<T extends HTMLElement>(id: string): T {
    return this.container.querySelector(`#${id}`) as T;
  }
}

function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
