export interface LpPosition {
  poolId: string;
  shares: string;
}

export interface SoroswapBrowserDeps {
  loadLpPositions: (publicKey: string) => Promise<LpPosition[]>;
}

export const DEFAULT_HORIZON_URL = 'https://horizon-testnet.stellar.org';

export async function fetchLpPositionsViaHorizon(
  publicKey: string,
  horizonUrl: string = DEFAULT_HORIZON_URL
): Promise<LpPosition[]> {
  const { Horizon } = await import('@galaxy-kj/core-stellar-sdk');
  const server = new Horizon.Server(horizonUrl);
  const account = await server.loadAccount(publicKey);
  return account.balances
    .filter((balance): balance is typeof balance & { liquidity_pool_id: string } =>
      balance.asset_type === 'liquidity_pool_shares'
    )
    .map((balance) => ({ poolId: balance.liquidity_pool_id, shares: balance.balance }));
}

export class SoroswapBrowserPanel {
  private readonly container: HTMLElement;
  private readonly deps: SoroswapBrowserDeps;

  constructor(container: string | HTMLElement, deps: Partial<SoroswapBrowserDeps> = {}) {
    this.container = typeof container === 'string'
      ? (document.getElementById(container) as HTMLElement)
      : container;

    if (!this.container) {
      throw new Error('SoroswapBrowserPanel container is required');
    }

    this.deps = { loadLpPositions: fetchLpPositionsViaHorizon, ...deps };
    this.render();
  }

  private render(): void {
    this.container.innerHTML = `
      <section class="soroswap-panel" aria-label="Soroswap liquidity positions">
        <h2>Soroswap Liquidity</h2>
        <p class="analytics-subtitle">Liquidity pool shares held by a wallet, read directly from Horizon.</p>

        <div class="form-field">
          <label for="sb-wallet">Wallet Public Key (G...)</label>
          <input id="sb-wallet" type="text" placeholder="G..." autocomplete="off" />
        </div>

        <div class="actions">
          <button id="sb-load" type="button">Load Positions</button>
        </div>

        <p id="sb-status" class="status status-info" role="status" aria-live="polite">Enter a wallet to load its pool shares.</p>
        <div id="sb-positions" class="analytics-section"></div>
      </section>
    `;

    this.byId<HTMLButtonElement>('sb-load').addEventListener('click', () => void this.load());
  }

  async load(): Promise<void> {
    const publicKey = this.byId<HTMLInputElement>('sb-wallet').value.trim();
    if (!publicKey) {
      this.setStatus('Enter a wallet public key first.', 'error');
      return;
    }

    this.setStatus('Loading pool shares…', 'info');
    try {
      const positions = await this.deps.loadLpPositions(publicKey);
      this.renderPositions(positions);
      this.setStatus(
        positions.length ? `${positions.length} pool position(s) found.` : 'No liquidity positions for this wallet.',
        'success'
      );
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : 'Failed to load pool shares.', 'error');
    }
  }

  private renderPositions(positions: LpPosition[]): void {
    const host = this.byId('sb-positions');
    if (positions.length === 0) {
      host.innerHTML = '<p class="analytics-activity-empty">No active liquidity pool positions.</p>';
      return;
    }

    const rows = positions
      .map(
        (position) => `
          <tr>
            <td><code>${position.poolId.slice(0, 12)}…</code></td>
            <td class="analytics-num">${position.shares}</td>
            <td><span class="analytics-muted">unavailable</span></td>
          </tr>`
      )
      .join('');

    host.innerHTML = `
      <h3>Pool positions</h3>
      <div class="analytics-table-scroll">
        <table class="analytics-table">
          <thead>
            <tr><th scope="col">Pool</th><th scope="col">Shares</th><th scope="col">Value (USD)</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  private setStatus(message: string, tone: 'info' | 'success' | 'error'): void {
    const status = this.byId('sb-status');
    status.textContent = message;
    status.className = `status status-${tone}`;
  }

  private byId<T extends HTMLElement>(id: string): T {
    return this.container.querySelector(`#${id}`) as T;
  }
}
