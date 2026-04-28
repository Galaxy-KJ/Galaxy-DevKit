import {
  BlendAsset,
  BlendClient,
  type BlendPositionResponse,
  type BlendTransactionResponse,
} from '../services/blend.client';
import { assertWriteOperation } from '../actions';

interface BlendPanelClient {
  getPosition(publicKey: string): Promise<BlendPositionResponse>;
  borrow(params: { signerPublicKey: string; asset: BlendAsset; amount: string; jwt?: string }): Promise<BlendTransactionResponse>;
  repay(params: { signerPublicKey: string; asset: BlendAsset; amount: string; jwt?: string }): Promise<BlendTransactionResponse>;
}

export interface BlendHealthMetrics {
  collateral: number;
  debt: number;
  healthFactor: number;
}

export function calculateBlendHealth(position: BlendPositionResponse): BlendHealthMetrics {
  const collateral = parseValue(position.collateralValue, position.supplied);
  const debt = parseValue(position.debtValue, position.borrowed);

  const healthFactor = debt > 0 ? collateral / debt : Number.POSITIVE_INFINITY;

  return {
    collateral,
    debt,
    healthFactor,
  };
}

export function getHealthTone(healthFactor: number): 'green' | 'yellow' | 'red' {
  if (healthFactor > 1.5) return 'green';
  if (healthFactor > 1.2) return 'yellow';
  return 'red';
}

export class BlendPanel {
  private readonly container: HTMLElement;
  private readonly client: BlendPanelClient;

  constructor(container: string | HTMLElement, client: BlendPanelClient = new BlendClient()) {
    this.container = typeof container === 'string'
      ? (document.getElementById(container) as HTMLElement)
      : container;

    if (!this.container) {
      throw new Error('BlendPanel container is required');
    }

    this.client = client;
    this.render();
  }

  private render(): void {
    this.container.innerHTML = `
      <section class="blend-panel" aria-label="Blend lending and borrowing">
        <h2>Blend: Borrow, Repay, Health</h2>
        <p class="blend-subtitle">Use this panel to monitor health factor and prepare borrow/repay transactions.</p>

        <div class="form-field">
          <label for="blend-wallet">Signer Public Key (G...)</label>
          <input id="blend-wallet" type="text" placeholder="G..." autocomplete="off" />
        </div>

        <div class="form-field">
          <label for="blend-jwt">JWT (required by borrow/repay API)</label>
          <input id="blend-jwt" type="password" placeholder="Bearer token without the Bearer prefix" autocomplete="off" />
        </div>

        <div class="blend-grid">
          <div class="form-field">
            <label for="blend-asset">Asset</label>
            <select id="blend-asset">
              <option value="XLM">XLM (native)</option>
              <option value="USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5">USDC</option>
            </select>
          </div>
          <div class="form-field">
            <label for="blend-amount">Amount</label>
            <input id="blend-amount" type="number" min="0" step="any" placeholder="10" />
          </div>
        </div>

        <div class="actions">
          <button id="blend-refresh" type="button">Refresh Position</button>
          <button id="blend-borrow" type="button">Initiate Borrow</button>
          <button id="blend-repay" type="button">Initiate Repay</button>
        </div>

        <div id="blend-health" class="blend-health blend-health-red" role="status" aria-live="polite">
          <strong>Health Factor</strong>
          <span id="blend-health-value">-</span>
          <small id="blend-health-detail">Load a position to calculate health.</small>
        </div>

        <pre id="blend-position" class="blend-json" aria-label="Blend position response"></pre>
        <pre id="blend-tx" class="blend-json" aria-label="Blend transaction response"></pre>
        <p id="blend-status" class="status status-info" role="status" aria-live="polite">Ready.</p>
      </section>
    `;

    const refreshBtn = this.byId<HTMLButtonElement>('blend-refresh');
    const borrowBtn = this.byId<HTMLButtonElement>('blend-borrow');
    const repayBtn = this.byId<HTMLButtonElement>('blend-repay');

    refreshBtn.addEventListener('click', () => {
      void this.refreshPosition();
    });

    borrowBtn.addEventListener('click', () => {
      void this.submitTransaction('borrow');
    });

    repayBtn.addEventListener('click', () => {
      void this.submitTransaction('repay');
    });
  }

  private async refreshPosition(): Promise<void> {
    const wallet = this.byId<HTMLInputElement>('blend-wallet').value.trim();
    const status = this.byId<HTMLElement>('blend-status');

    if (!wallet) {
      this.setStatus('Signer public key is required to load position.', 'error');
      return;
    }

    this.setStatus('Loading position...', 'info');

    try {
      const position = await this.client.getPosition(wallet);
      this.byId<HTMLElement>('blend-position').textContent = JSON.stringify(position, null, 2);
      this.renderHealth(position);
      this.setStatus('Position refreshed.', 'success');
    } catch (err) {
      status.textContent = `Error: ${formatError(err)}`;
      status.className = 'status status-error';
    }
  }

  private async submitTransaction(kind: 'borrow' | 'repay'): Promise<void> {
    const wallet = this.byId<HTMLInputElement>('blend-wallet').value.trim();
    const jwt = this.byId<HTMLInputElement>('blend-jwt').value.trim();
    const amount = this.byId<HTMLInputElement>('blend-amount').value.trim();
    const asset = resolveAsset(this.byId<HTMLSelectElement>('blend-asset').value);

    if (!wallet) {
      this.setStatus('Signer public key is required.', 'error');
      return;
    }
    if (!amount || Number(amount) <= 0) {
      this.setStatus('Amount must be a positive number.', 'error');
      return;
    }

    this.setStatus(`${kind === 'borrow' ? 'Borrowing' : 'Repaying'}...`, 'info');

    try {
      assertWriteOperation();
      const result = kind === 'borrow'
        ? await this.client.borrow({ signerPublicKey: wallet, asset, amount, jwt })
        : await this.client.repay({ signerPublicKey: wallet, asset, amount, jwt });

      this.byId<HTMLElement>('blend-tx').textContent = JSON.stringify(result, null, 2);
      this.setStatus(`${kind === 'borrow' ? 'Borrow' : 'Repay'} transaction prepared.`, 'success');
      await this.refreshPosition();
    } catch (err) {
      this.setStatus(`Error: ${formatError(err)}`, 'error');
    }
  }

  private renderHealth(position: BlendPositionResponse): void {
    const metrics = calculateBlendHealth(position);
    const tone = Number.isFinite(metrics.healthFactor) ? getHealthTone(metrics.healthFactor) : 'green';

    const health = this.byId<HTMLElement>('blend-health');
    const value = this.byId<HTMLElement>('blend-health-value');
    const detail = this.byId<HTMLElement>('blend-health-detail');

    health.className = `blend-health blend-health-${tone}`;
    value.textContent = Number.isFinite(metrics.healthFactor)
      ? metrics.healthFactor.toFixed(4)
      : 'Infinity';

    detail.textContent = `Collateral ${metrics.collateral.toFixed(4)} / Debt ${metrics.debt.toFixed(4)} ` +
      `(thresholds: green > 1.5, yellow > 1.2, red < 1.2)`;
  }

  private setStatus(message: string, tone: 'info' | 'success' | 'error'): void {
    const el = this.byId<HTMLElement>('blend-status');
    el.textContent = message;
    el.className = `status status-${tone}`;
  }

  private byId<T extends HTMLElement>(id: string): T {
    return this.container.querySelector(`#${id}`) as T;
  }
}

function parseValue(direct: string | undefined, entries: Array<{ amount: string; valueUSD?: string }> | undefined): number {
  const directValue = Number.parseFloat(direct ?? '');
  if (Number.isFinite(directValue) && directValue >= 0) {
    return directValue;
  }

  if (!entries?.length) {
    return 0;
  }

  return entries.reduce((sum, item) => {
    const fromUsd = Number.parseFloat(item.valueUSD ?? '');
    if (Number.isFinite(fromUsd)) {
      return sum + fromUsd;
    }
    const fromAmount = Number.parseFloat(item.amount);
    return Number.isFinite(fromAmount) ? sum + fromAmount : sum;
  }, 0);
}

function resolveAsset(raw: string): BlendAsset {
  if (raw === 'XLM') {
    return { code: 'XLM', type: 'native' };
  }

  const [code, issuer] = raw.split(':');
  return {
    code,
    issuer,
    type: code.length > 4 ? 'credit_alphanum12' : 'credit_alphanum4',
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
