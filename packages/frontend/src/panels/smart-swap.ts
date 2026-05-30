import {
  SmartSwapClient,
  type CreateSwapConditionInput,
  type SwapCondition,
  type SwapConditionTypeVariant,
  type SwapExecution,
  formatConditionType,
} from '../services/smart-swap.client';
import { assertWriteOperation } from '../actions';

interface SmartSwapPanelClient {
  setContractId(contractId: string): void;
  getContractId(): string;
  createSwapCondition(input: CreateSwapConditionInput): Promise<{ xdr: string }>;
  executeSwapCondition(owner: string, conditionId: number): Promise<{ xdr: string }>;
  cancelCondition(owner: string, conditionId: number): Promise<{ xdr: string }>;
  getActiveConditions(owner: string): Promise<SwapCondition[]>;
  getExecutionHistory(conditionId: number, owner: string): Promise<SwapExecution[]>;
}

export function buildConditionTypeFromForm(
  kind: string,
  value: number,
): SwapConditionTypeVariant {
  switch (kind) {
    case 'PercentageIncrease':
    case 'PercentageDecrease':
      return { kind, value: Math.round(value) };
    case 'TargetPrice':
    case 'PriceAbove':
    case 'PriceBelow':
      return { kind, value: Math.round(value) };
    default:
      throw new Error(`Unsupported condition kind: ${kind}`);
  }
}

export class SmartSwapPanel {
  private readonly container: HTMLElement;
  private readonly client: SmartSwapPanelClient;

  constructor(container: string | HTMLElement, client: SmartSwapPanelClient = new SmartSwapClient()) {
    this.container = typeof container === 'string'
      ? (document.getElementById(container) as HTMLElement)
      : container;

    if (!this.container) {
      throw new Error('SmartSwapPanel container is required');
    }

    this.client = client;
    this.render();
  }

  private render(): void {
    this.container.innerHTML = `
      <section class="smart-swap-panel" aria-label="Smart Swap conditional orders">
        <h2>Smart Swap: Conditional Orders</h2>
        <p class="smart-swap-subtitle">
          Create limit-style swap conditions, monitor active orders, cancel them, and review execution history.
        </p>

        <div class="form-field">
          <label for="smart-swap-contract">Contract ID (C...)</label>
          <input id="smart-swap-contract" type="text" placeholder="Deployed smart-swap contract address" autocomplete="off" />
        </div>

        <div class="form-field">
          <label for="smart-swap-owner">Owner Public Key (G...)</label>
          <input id="smart-swap-owner" type="text" placeholder="G..." autocomplete="off" />
        </div>

        <fieldset class="smart-swap-fieldset">
          <legend>Create condition</legend>
          <div class="smart-swap-grid">
            <div class="form-field">
              <label for="smart-swap-source">Source asset</label>
              <input id="smart-swap-source" type="text" value="XLM" />
            </div>
            <div class="form-field">
              <label for="smart-swap-dest">Destination asset</label>
              <input id="smart-swap-dest" type="text" value="USDC" />
            </div>
            <div class="form-field">
              <label for="smart-swap-condition-kind">Condition type</label>
              <select id="smart-swap-condition-kind">
                <option value="PriceAbove">PriceAbove</option>
                <option value="PriceBelow">PriceBelow</option>
                <option value="TargetPrice">TargetPrice</option>
                <option value="PercentageIncrease">PercentageIncrease</option>
                <option value="PercentageDecrease">PercentageDecrease</option>
              </select>
            </div>
            <div class="form-field">
              <label for="smart-swap-condition-value">Condition value</label>
              <input id="smart-swap-condition-value" type="number" min="0" step="any" value="1000" />
            </div>
            <div class="form-field">
              <label for="smart-swap-amount">Amount to swap</label>
              <input id="smart-swap-amount" type="number" min="0" step="any" value="100" />
            </div>
            <div class="form-field">
              <label for="smart-swap-min-out">Min amount out</label>
              <input id="smart-swap-min-out" type="number" min="0" step="any" value="95" />
            </div>
            <div class="form-field">
              <label for="smart-swap-slippage">Max slippage (bps)</label>
              <input id="smart-swap-slippage" type="number" min="0" max="10000" value="50" />
            </div>
            <div class="form-field">
              <label for="smart-swap-expires">Expires in (hours)</label>
              <input id="smart-swap-expires" type="number" min="1" value="24" />
            </div>
          </div>
        </fieldset>

        <div class="actions">
          <button id="smart-swap-create" type="button">Create Condition</button>
          <button id="smart-swap-refresh" type="button">Refresh Active</button>
        </div>

        <div class="form-field">
          <label for="smart-swap-condition-id">Condition ID (execute / cancel / history)</label>
          <input id="smart-swap-condition-id" type="number" min="1" placeholder="1" />
        </div>

        <div class="actions">
          <button id="smart-swap-execute" type="button">Execute Condition</button>
          <button id="smart-swap-cancel" type="button">Cancel Condition</button>
          <button id="smart-swap-history" type="button">Load History</button>
        </div>

        <pre id="smart-swap-active" class="smart-swap-json" aria-label="Active swap conditions"></pre>
        <pre id="smart-swap-tx" class="smart-swap-json" aria-label="Prepared transaction XDR"></pre>
        <pre id="smart-swap-history-out" class="smart-swap-json" aria-label="Execution history"></pre>
        <p id="smart-swap-status" class="status status-info" role="status" aria-live="polite">Ready.</p>
      </section>
    `;

    this.byId<HTMLInputElement>('smart-swap-contract').value = this.client.getContractId();

    this.byId<HTMLButtonElement>('smart-swap-create').addEventListener('click', () => {
      void this.createCondition();
    });
    this.byId<HTMLButtonElement>('smart-swap-refresh').addEventListener('click', () => {
      void this.refreshActive();
    });
    this.byId<HTMLButtonElement>('smart-swap-execute').addEventListener('click', () => {
      void this.runConditionAction('execute');
    });
    this.byId<HTMLButtonElement>('smart-swap-cancel').addEventListener('click', () => {
      void this.runConditionAction('cancel');
    });
    this.byId<HTMLButtonElement>('smart-swap-history').addEventListener('click', () => {
      void this.loadHistory();
    });
  }

  private syncContractId(): void {
    const contractId = this.byId<HTMLInputElement>('smart-swap-contract').value.trim();
    if (contractId) {
      this.client.setContractId(contractId);
    }
  }

  private readOwner(): string {
    return this.byId<HTMLInputElement>('smart-swap-owner').value.trim();
  }

  private readConditionId(): number {
    const raw = this.byId<HTMLInputElement>('smart-swap-condition-id').value.trim();
    const id = Number.parseInt(raw, 10);
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error('A valid condition ID is required');
    }
    return id;
  }

  private async createCondition(): Promise<void> {
    const owner = this.readOwner();
    if (!owner) {
      this.setStatus('Owner public key is required.', 'error');
      return;
    }

    try {
      assertWriteOperation();
      this.syncContractId();
      this.setStatus('Building create_swap_condition transaction...', 'info');

      const kind = this.byId<HTMLSelectElement>('smart-swap-condition-kind').value;
      const value = Number(this.byId<HTMLInputElement>('smart-swap-condition-value').value);
      const expiresHours = Number(this.byId<HTMLInputElement>('smart-swap-expires').value);
      const expiresAt = Math.floor(Date.now() / 1000) + Math.max(1, expiresHours) * 3600;

      const input: CreateSwapConditionInput = {
        owner,
        sourceAsset: this.byId<HTMLInputElement>('smart-swap-source').value.trim(),
        destinationAsset: this.byId<HTMLInputElement>('smart-swap-dest').value.trim(),
        conditionType: buildConditionTypeFromForm(kind, value),
        amountToSwap: Number(this.byId<HTMLInputElement>('smart-swap-amount').value),
        minAmountOut: Number(this.byId<HTMLInputElement>('smart-swap-min-out').value),
        maxSlippage: Number(this.byId<HTMLInputElement>('smart-swap-slippage').value),
        expiresAt,
      };

      const result = await this.client.createSwapCondition(input);
      this.byId<HTMLElement>('smart-swap-tx').textContent = result.xdr;
      this.setStatus(
        `Condition prepared (${formatConditionType(input.conditionType)}). Sign and submit the XDR.`,
        'success',
      );
      await this.refreshActive();
    } catch (err) {
      this.setStatus(`Error: ${formatError(err)}`, 'error');
    }
  }

  private async refreshActive(): Promise<void> {
    const owner = this.readOwner();
    if (!owner) {
      this.setStatus('Owner public key is required.', 'error');
      return;
    }

    try {
      this.syncContractId();
      this.setStatus('Loading active conditions...', 'info');
      const conditions = await this.client.getActiveConditions(owner);
      const formatted = conditions.map((c) => ({
        ...c,
        conditionLabel: formatConditionType(c.conditionType),
      }));
      this.byId<HTMLElement>('smart-swap-active').textContent = JSON.stringify(formatted, null, 2);
      this.setStatus(`Loaded ${conditions.length} active condition(s).`, 'success');
    } catch (err) {
      this.setStatus(`Error: ${formatError(err)}`, 'error');
    }
  }

  private async runConditionAction(action: 'execute' | 'cancel'): Promise<void> {
    const owner = this.readOwner();
    if (!owner) {
      this.setStatus('Owner public key is required.', 'error');
      return;
    }

    try {
      assertWriteOperation();
      this.syncContractId();
      const conditionId = this.readConditionId();
      this.setStatus(`${action === 'execute' ? 'Executing' : 'Cancelling'} condition #${conditionId}...`, 'info');

      const result = action === 'execute'
        ? await this.client.executeSwapCondition(owner, conditionId)
        : await this.client.cancelCondition(owner, conditionId);

      this.byId<HTMLElement>('smart-swap-tx').textContent = result.xdr;
      this.setStatus(
        `${action === 'execute' ? 'Execute' : 'Cancel'} transaction prepared. Sign and submit the XDR.`,
        'success',
      );
      await this.refreshActive();
    } catch (err) {
      this.setStatus(`Error: ${formatError(err)}`, 'error');
    }
  }

  private async loadHistory(): Promise<void> {
    const owner = this.readOwner();
    if (!owner) {
      this.setStatus('Owner public key is required.', 'error');
      return;
    }

    try {
      this.syncContractId();
      const conditionId = this.readConditionId();
      this.setStatus(`Loading execution history for #${conditionId}...`, 'info');
      const history = await this.client.getExecutionHistory(conditionId, owner);
      this.byId<HTMLElement>('smart-swap-history-out').textContent = JSON.stringify(history, null, 2);
      this.setStatus(`Loaded ${history.length} execution record(s).`, 'success');
    } catch (err) {
      this.setStatus(`Error: ${formatError(err)}`, 'error');
    }
  }

  private setStatus(message: string, tone: 'info' | 'success' | 'error'): void {
    const el = this.byId<HTMLElement>('smart-swap-status');
    el.textContent = message;
    el.className = `status status-${tone}`;
  }

  private byId<T extends HTMLElement>(id: string): T {
    return this.container.querySelector(`#${id}`) as T;
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
