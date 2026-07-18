import { MarketSocketClient, type PriceUpdate } from '../services/market-socket.client';

export const DEFAULT_WS_URL = 'http://localhost:3001';

export interface LiveMarketFeedDeps {
  client: MarketSocketClient;
}

function rowId(pair: string): string {
  return `lmf-${pair.replace('/', '-')}`;
}

export class LiveMarketFeedPanel {
  private readonly container: HTMLElement;
  private readonly client: MarketSocketClient;
  private readonly unsubscribe: () => void;

  constructor(container: string | HTMLElement, deps: Partial<LiveMarketFeedDeps> = {}) {
    this.container = typeof container === 'string'
      ? (document.getElementById(container) as HTMLElement)
      : container;

    if (!this.container) {
      throw new Error('LiveMarketFeedPanel container is required');
    }

    this.client = deps.client ?? new MarketSocketClient({ url: DEFAULT_WS_URL });
    this.render();
    this.unsubscribe = this.client.subscribe((update) => this.renderRow(update));
    this.client.connect();
  }

  private render(): void {
    this.container.innerHTML = `
      <section class="feed-panel" aria-label="Live market feed">
        <div class="feed-header">
          <h2>Live Market Feed</h2>
          <span class="sim-badge">simulated</span>
        </div>
        <p class="analytics-subtitle">Streaming prices over WebSocket. The backend generates these ticks, so every value here is simulated.</p>
        <div class="analytics-table-scroll">
          <table class="analytics-table">
            <thead>
              <tr><th scope="col">Pair</th><th scope="col">Price</th><th scope="col">24h</th></tr>
            </thead>
            <tbody id="lmf-body">
              <tr id="lmf-empty"><td colspan="3">Waiting for live prices…</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  private renderRow(update: PriceUpdate): void {
    const body = this.container.querySelector('#lmf-body') as HTMLElement;
    this.container.querySelector('#lmf-empty')?.remove();

    const change = update.change24h ?? 0;
    const tone = change > 0 ? 'green' : change < 0 ? 'red' : 'yellow';
    const changeText = `${change > 0 ? '+' : change < 0 ? '−' : ''}${Math.abs(change).toFixed(2)}%`;
    const price = Number.isFinite(update.price) ? update.price.toLocaleString(undefined, { maximumFractionDigits: 6 }) : '—';

    let row = this.container.querySelector(`#${rowId(update.pair)}`) as HTMLElement | null;
    if (!row) {
      row = document.createElement('tr');
      row.id = rowId(update.pair);
      body.appendChild(row);
    }
    row.innerHTML = `
      <td>${update.pair}</td>
      <td class="analytics-num">${price}</td>
      <td class="analytics-num analytics-tone--${tone}">${changeText}</td>`;
  }

  destroy(): void {
    this.unsubscribe();
    this.client.disconnect();
  }
}
