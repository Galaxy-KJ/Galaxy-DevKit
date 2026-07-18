import { buildLineChart, buildLineChartTable } from '../charts/line-chart';
import { buildPieChart, buildPieChartTable } from '../charts/pie-chart';
import { PortfolioSnapshotStore } from '../services/portfolio-snapshots';
import {
  buildBlendRow,
  buildSoroswapRow,
  totalValue,
  allocation,
  simulatedCostBasisPnl,
  type PositionRow,
} from '../services/analytics.client';
import {
  calculateRiskProfile,
  buildRiskAlerts,
  type RiskTone,
} from './risk-dashboard';
import type { BlendPositionResponse } from '../services/blend.client';
import { BlendClient } from '../services/blend.client';
import { TxTrackerService, type TrackedTransaction } from '../services/tx-tracker';

type BlendPosition = BlendPositionResponse & { supplyAPY?: string; borrowAPY?: string };

export interface DashboardDeps {
  loadPosition: (publicKey: string) => Promise<BlendPosition>;
  loadSoroswapRows: (publicKey: string) => Promise<PositionRow[]>;
  store: PortfolioSnapshotStore;
  tracker: TxTrackerService;
  now: () => number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function defaultDeps(): DashboardDeps {
  const client = new BlendClient();
  return {
    loadPosition: (publicKey) => client.getPosition(publicKey) as Promise<BlendPosition>,
    loadSoroswapRows: async () => [],
    store: new PortfolioSnapshotStore(),
    tracker: new TxTrackerService(),
    now: () => Date.now(),
  };
}

function formatUsd(value: number): string {
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function signed(value: number): string {
  const prefix = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${prefix}${formatUsd(Math.abs(value))}`;
}

function toneOf(value: number): RiskTone {
  if (value > 0) return 'green';
  if (value < 0) return 'red';
  return 'yellow';
}

export class AnalyticsDashboardPanel {
  private readonly container: HTMLElement;
  private readonly deps: DashboardDeps;

  constructor(container: string | HTMLElement, deps: Partial<DashboardDeps> = {}) {
    this.container = typeof container === 'string'
      ? (document.getElementById(container) as HTMLElement)
      : container;

    if (!this.container) {
      throw new Error('AnalyticsDashboardPanel container is required');
    }

    this.deps = { ...defaultDeps(), ...deps };
    this.render();
  }

  private render(): void {
    this.container.innerHTML = `
      <section class="analytics-panel" aria-label="Portfolio analytics dashboard">
        <h2>Analytics</h2>
        <p class="analytics-subtitle">Portfolio value, DeFi positions and risk across protocols. Metrics marked <span class="sim-badge">simulated</span> use mock data where no on-chain source exists.</p>

        <div class="form-field">
          <label for="ad-wallet">Wallet Public Key (G...)</label>
          <input id="ad-wallet" type="text" placeholder="G..." autocomplete="off" />
        </div>

        <div class="actions">
          <button id="ad-load" type="button">Load Portfolio</button>
          <button id="ad-refresh" type="button">Refresh</button>
        </div>

        <p id="ad-status" class="status status-info" role="status" aria-live="polite">Enter a wallet and load its portfolio.</p>

        <div id="ad-body" hidden>
          <div id="ad-kpis" class="analytics-kpis"></div>
          <div class="analytics-charts">
            <figure id="ad-allocation" class="analytics-figure"></figure>
            <figure id="ad-history" class="analytics-figure"></figure>
          </div>
          <div id="ad-positions" class="analytics-section"></div>
          <div id="ad-risk" class="analytics-section"></div>
          <div id="ad-activity" class="analytics-section"></div>
        </div>
      </section>
    `;

    this.byId<HTMLButtonElement>('ad-load').addEventListener('click', () => void this.refresh());
    this.byId<HTMLButtonElement>('ad-refresh').addEventListener('click', () => void this.refresh());
  }

  async refresh(): Promise<void> {
    const publicKey = this.byId<HTMLInputElement>('ad-wallet').value.trim();
    if (!publicKey) {
      this.setStatus('Enter a wallet public key first.', 'error');
      return;
    }

    this.setStatus('Loading portfolio…', 'info');
    try {
      const [position, soroswapRows] = await Promise.all([
        this.deps.loadPosition(publicKey),
        this.deps.loadSoroswapRows(publicKey).catch(() => [] as PositionRow[]),
      ]);

      const rows = [buildBlendRow(position), ...soroswapRows];
      const total = totalValue(rows);
      this.deps.store.append('portfolio', total, this.deps.now());

      this.renderKpis(total, position);
      this.renderCharts(rows);
      this.renderPositions(rows);
      this.renderRisk(position);
      this.renderActivity();

      this.byId('ad-body').hidden = false;
      this.setStatus('Portfolio loaded.', 'success');
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : 'Failed to load portfolio.', 'error');
    }
  }

  private renderKpis(total: number, position: BlendPosition): void {
    const observed = this.deps.store.delta('portfolio');
    // Only a genuine 24h window counts; until the observed series spans a full
    // day the tile stays blank rather than claiming a 24h move it cannot back.
    const series = this.deps.store.series('portfolio');
    const spans24h = series.length >= 2 && series[series.length - 1].ts - series[0].ts >= DAY_MS;
    const change24h = spans24h ? this.deps.store.deltaSince('portfolio', DAY_MS, this.deps.now()) : null;
    const simulated = simulatedCostBasisPnl(total);
    const apy = position.supplyAPY ?? null;

    const host = this.byId('ad-kpis');
    host.innerHTML = '';
    host.append(
      kpi('Total value', formatUsd(total)),
      kpi('24h change', change24h ? signed(change24h.absolute) : '—', change24h ? toneOf(change24h.absolute) : undefined),
      kpi('PnL (since first load)', observed ? signed(observed.absolute) : '—', observed ? toneOf(observed.absolute) : undefined, 'observed'),
      kpi('PnL (simulated)', signed(simulated.pnl), toneOf(simulated.pnl), 'simulated'),
      kpi('Current APY', apy ? `${apy}%` : 'Unavailable'),
    );
  }

  private renderCharts(rows: PositionRow[]): void {
    const allocationFigure = this.byId('ad-allocation');
    const slices = allocation(rows).map((entry) => ({ label: entry.label, value: entry.value }));
    allocationFigure.innerHTML = '<figcaption>Allocation</figcaption>';
    allocationFigure.append(
      buildPieChart(slices, { ariaLabel: 'Asset allocation by protocol', emptyLabel: 'No positions yet' }),
      hiddenTable(buildPieChartTable(slices)),
    );

    const historyFigure = this.byId('ad-history');
    // A single observation cannot draw a trend line, so hold the empty state
    // until at least two snapshots exist.
    const series = this.deps.store.series('portfolio');
    const points = series.length >= 2 ? series.map((s) => ({ ts: s.ts, value: s.value })) : [];
    historyFigure.innerHTML = '<figcaption>Portfolio value <span class="sim-badge sim-badge--observed">observed since first load</span></figcaption>';
    historyFigure.append(
      buildLineChart(points, { ariaLabel: 'Portfolio value over time', emptyLabel: 'observed since first load' }),
      hiddenTable(buildLineChartTable(points, { valueLabel: 'Value (USD)' })),
    );
  }

  private renderPositions(rows: PositionRow[]): void {
    const host = this.byId('ad-positions');
    const body = rows
      .map(
        (row) => `
          <tr>
            <td>${row.protocol}</td>
            <td>${row.type}</td>
            <td class="analytics-num">${formatUsd(row.value)}</td>
            <td>${row.healthFactor !== null ? row.healthFactor.toFixed(2) : '—'}</td>
            <td>${row.apy ?? '<span class="analytics-muted">unavailable</span>'}</td>
          </tr>`
      )
      .join('');

    host.innerHTML = `
      <h3>Positions</h3>
      <div class="analytics-table-scroll">
        <table class="analytics-table">
          <thead>
            <tr><th scope="col">Protocol</th><th scope="col">Type</th><th scope="col">Value</th><th scope="col">Health (reported)</th><th scope="col">APY</th></tr>
          </thead>
          <tbody>${body || '<tr><td colspan="5">No positions found.</td></tr>'}</tbody>
        </table>
      </div>`;
  }

  private renderRisk(position: BlendPosition): void {
    const profile = calculateRiskProfile(position);
    const alerts = buildRiskAlerts(profile);
    const host = this.byId('ad-risk');

    host.innerHTML = `
      <h3>Risk indicators</h3>
      <div class="analytics-risk-grid">
        <div class="analytics-risk analytics-risk--${profile.tone}">
          <strong>Risk score</strong>
          <span class="analytics-num">${profile.riskScore}/100</span>
        </div>
        <div class="analytics-risk analytics-risk--${profile.tone}">
          <strong>Health factor (leverage)</strong>
          <span class="analytics-num">${Number.isFinite(profile.healthFactor) ? profile.healthFactor.toFixed(2) : '∞'}</span>
        </div>
        <div class="analytics-risk">
          <strong>IL exposure</strong>
          <span class="analytics-num">${(profile.leverageIndex * 12).toFixed(1)}% <span class="sim-badge">simulated</span></span>
        </div>
      </div>
      <ul class="analytics-alerts">
        ${alerts.map((alert) => `<li class="analytics-alert analytics-alert--${alert.tone}">${alert.message}</li>`).join('')}
      </ul>`;
  }

  private renderActivity(): void {
    const host = this.byId('ad-activity');
    const real = this.deps.tracker.list().slice(0, 5);
    const realItems = real.map((tx) => activityItem(describeTx(tx), tx.createdAt, false)).join('');
    const simItems = simulatedEvents(this.deps.now())
      .map((event) => activityItem(event.label, event.ts, true))
      .join('');

    host.innerHTML = `
      <h3>Activity feed</h3>
      <ul class="analytics-activity">
        ${realItems}${simItems || ''}
        ${!realItems && !simItems ? '<li class="analytics-activity-empty">No recent activity.</li>' : ''}
      </ul>`;
  }

  private setStatus(message: string, tone: 'info' | 'success' | 'error'): void {
    const status = this.byId('ad-status');
    status.textContent = message;
    status.className = `status status-${tone}`;
  }

  private byId<T extends HTMLElement>(id: string): T {
    return this.container.querySelector(`#${id}`) as T;
  }
}

function kpi(label: string, value: string, tone?: RiskTone, badge?: string): HTMLElement {
  const article = document.createElement('article');
  article.className = 'analytics-kpi';
  const badgeClass = badge === 'observed' ? 'sim-badge sim-badge--observed' : 'sim-badge';
  article.innerHTML = `
    <span class="analytics-kpi-label">${label}${badge ? ` <span class="${badgeClass}">${badge}</span>` : ''}</span>
    <strong class="analytics-num${tone ? ` analytics-tone--${tone}` : ''}">${value}</strong>`;
  return article;
}

function hiddenTable(table: HTMLTableElement): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'visually-hidden';
  wrap.appendChild(table);
  return wrap;
}

function activityItem(label: string, ts: number, simulated: boolean): string {
  return `
    <li class="analytics-activity-item">
      <span>${label}${simulated ? ' <span class="sim-badge">simulated</span>' : ''}</span>
      <time datetime="${new Date(ts).toISOString()}">${new Date(ts).toLocaleString()}</time>
    </li>`;
}

function describeTx(tx: TrackedTransaction): string {
  return `Sent ${tx.amount} to ${tx.destination.slice(0, 6)}… (${tx.status})`;
}

function simulatedEvents(now: number): { label: string; ts: number }[] {
  return [
    { label: 'Supplied 250 USDC to Blend', ts: now - 45 * 60 * 1000 },
    { label: 'Swapped 100 XLM → USDC on Soroswap', ts: now - 3 * 60 * 60 * 1000 },
  ];
}
