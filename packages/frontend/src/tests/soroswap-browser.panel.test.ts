/**
 * @jest-environment jest-environment-jsdom
 */

import { SoroswapBrowserPanel } from '../panels/soroswap-browser';

function mount(loadLpPositions: (publicKey: string) => Promise<{ poolId: string; shares: string }[]>) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const panel = new SoroswapBrowserPanel(container, { loadLpPositions });
  return { container, panel };
}

describe('SoroswapBrowserPanel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders the controls on mount', () => {
    const { container } = mount(async () => []);
    expect(container.querySelector('#sb-load')).not.toBeNull();
    expect(container.querySelector('#sb-status')!.textContent).toContain('Enter a wallet');
  });

  it('warns when no wallet is provided', async () => {
    const { container, panel } = mount(async () => []);
    await panel.load();
    expect(container.querySelector('#sb-status')!.className).toContain('status-error');
  });

  it('renders a row per liquidity position', async () => {
    const { container, panel } = mount(async () => [
      { poolId: 'abcdef0123456789', shares: '12.5' },
    ]);
    container.querySelector<HTMLInputElement>('#sb-wallet')!.value = 'GABC';
    await panel.load();

    expect(container.querySelectorAll('.analytics-table tbody tr')).toHaveLength(1);
    expect(container.querySelector('.analytics-table tbody tr')!.textContent).toContain('12.5');
  });

  it('shows an empty state when there are no positions', async () => {
    const { container, panel } = mount(async () => []);
    container.querySelector<HTMLInputElement>('#sb-wallet')!.value = 'GABC';
    await panel.load();

    expect(container.querySelector('#sb-positions')!.textContent).toContain('No active liquidity');
    expect(container.querySelector('#sb-status')!.textContent).toContain('No liquidity positions');
  });

  it('surfaces horizon errors in the status line', async () => {
    const { container, panel } = mount(async () => {
      throw new Error('horizon unreachable');
    });
    container.querySelector<HTMLInputElement>('#sb-wallet')!.value = 'GABC';
    await panel.load();

    expect(container.querySelector('#sb-status')!.textContent).toContain('horizon unreachable');
  });
});
