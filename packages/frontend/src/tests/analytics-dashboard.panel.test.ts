/**
 * @jest-environment jest-environment-jsdom
 */

import { AnalyticsDashboardPanel, type DashboardDeps } from '../panels/analytics-dashboard';
import { PortfolioSnapshotStore } from '../services/portfolio-snapshots';
import { TxTrackerService } from '../services/tx-tracker';

const mountedPanels: AnalyticsDashboardPanel[] = [];

function mountPanel(overrides: Partial<DashboardDeps> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const deps: Partial<DashboardDeps> = {
    loadPosition: async () => ({
      collateralValue: '150',
      debtValue: '50',
      healthFactor: '1.8',
      supplyAPY: '4.20',
    }),
    loadSoroswapRows: async () => [],
    store: new PortfolioSnapshotStore(),
    tracker: new TxTrackerService(),
    now: () => 1_000_000,
    network: 'testnet',
    ...overrides,
  };
  const panel = new AnalyticsDashboardPanel(container, deps);
  mountedPanels.push(panel);
  return { container, panel };
}

const SERIES_KEY = 'portfolio:testnet:GABC';

describe('AnalyticsDashboardPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    // Stop the auto-refresh timers so no interval outlives the test.
    while (mountedPanels.length) mountedPanels.pop()!.destroy();
  });

  it('renders the controls and stays hidden until a portfolio loads', () => {
    const { container } = mountPanel();
    expect(container.querySelector('#ad-load')).not.toBeNull();
    expect(container.querySelector<HTMLElement>('#ad-body')!.hidden).toBe(true);
  });

  it('warns when refreshing without a wallet', async () => {
    const { container, panel } = mountPanel();
    await panel.refresh();
    expect(container.querySelector('#ad-status')!.textContent).toContain('Enter a wallet');
    expect(container.querySelector('#ad-status')!.className).toContain('status-error');
  });

  it('renders positions, charts and risk once loaded', async () => {
    const { container, panel } = mountPanel();
    container.querySelector<HTMLInputElement>('#ad-wallet')!.value = 'GABC';
    await panel.refresh();

    expect(container.querySelector<HTMLElement>('#ad-body')!.hidden).toBe(false);
    expect(container.querySelector('.analytics-table tbody tr')!.textContent).toContain('Blend');
    expect(container.querySelectorAll('svg[role="img"]').length).toBe(2);
    expect(container.querySelector('#ad-risk')!.textContent).toContain('Risk score');
  });

  it('labels every simulated metric and never labels a real one', async () => {
    const { container, panel } = mountPanel();
    container.querySelector<HTMLInputElement>('#ad-wallet')!.value = 'GABC';
    await panel.refresh();

    const simPnl = [...container.querySelectorAll('.analytics-kpi')].find((el) =>
      el.textContent?.includes('PnL (simulated)')
    );
    expect(simPnl!.querySelector('.sim-badge')).not.toBeNull();

    const totalValue = [...container.querySelectorAll('.analytics-kpi')].find((el) =>
      el.textContent?.includes('Total value')
    );
    expect(totalValue!.querySelector('.sim-badge')).toBeNull();
  });

  it('records a snapshot per refresh so the observed series grows', async () => {
    const store = new PortfolioSnapshotStore();
    const { container, panel } = mountPanel({ store });
    container.querySelector<HTMLInputElement>('#ad-wallet')!.value = 'GABC';

    await panel.refresh();
    await panel.refresh();

    expect(store.series(SERIES_KEY)).toHaveLength(2);
  });

  it('leaves 24h change blank until the observed series spans a day', async () => {
    const { container, panel } = mountPanel();
    container.querySelector<HTMLInputElement>('#ad-wallet')!.value = 'GABC';
    await panel.refresh();

    const tile = [...container.querySelectorAll('.analytics-kpi')].find((el) =>
      el.textContent?.includes('24h change')
    );
    expect(tile!.querySelector('strong')!.textContent).toBe('—');
  });

  it('shows a real 24h change once the series spans a day', async () => {
    const store = new PortfolioSnapshotStore();
    store.append(SERIES_KEY, 900, 1_000_000 - 25 * 60 * 60 * 1000);
    const { container, panel } = mountPanel({ store });
    container.querySelector<HTMLInputElement>('#ad-wallet')!.value = 'GABC';
    await panel.refresh();

    const tile = [...container.querySelectorAll('.analytics-kpi')].find((el) =>
      el.textContent?.includes('24h change')
    );
    expect(tile!.querySelector('strong')!.textContent).not.toBe('—');
  });

  it('surfaces load failures in the status line', async () => {
    const { container, panel } = mountPanel({
      loadPosition: async () => {
        throw new Error('network down');
      },
    });
    container.querySelector<HTMLInputElement>('#ad-wallet')!.value = 'GABC';
    await panel.refresh();

    expect(container.querySelector('#ad-status')!.textContent).toContain('network down');
  });
});
