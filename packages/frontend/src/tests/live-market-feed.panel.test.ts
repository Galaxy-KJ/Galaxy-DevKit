/**
 * @jest-environment jest-environment-jsdom
 */

import { LiveMarketFeedPanel } from '../panels/live-market-feed';
import { MarketSocketClient } from '../services/market-socket.client';

class FakeSocket {
  handlers = new Map<string, (payload: unknown) => void>();
  disconnected = false;
  on(event: string, handler: (payload: unknown) => void): void {
    this.handlers.set(event, handler);
  }
  emit(): void {}
  disconnect(): void {
    this.disconnected = true;
  }
  fire(event: string, payload?: unknown): void {
    this.handlers.get(event)?.(payload);
  }
}

function priceEvent(pair: string, price: number, change24h: number) {
  return { type: 'market:price_update', data: { pair, price, change24h } };
}

function mount() {
  const socket = new FakeSocket();
  const client = new MarketSocketClient({ factory: () => socket });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const panel = new LiveMarketFeedPanel(container, { client });
  return { container, panel, socket };
}

describe('LiveMarketFeedPanel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('carries a simulated badge in its header', () => {
    const { container } = mount();
    const header = container.querySelector('.feed-header');
    expect(header!.querySelector('.sim-badge')).not.toBeNull();
  });

  it('shows a waiting state until the first tick arrives', () => {
    const { container } = mount();
    expect(container.querySelector('#lmf-empty')).not.toBeNull();
  });

  it('renders a row when a price update arrives', () => {
    const { container, socket } = mount();
    socket.fire('market:price_update', priceEvent('BTC/USDC', 45000, 1.2));

    expect(container.querySelector('#lmf-empty')).toBeNull();
    const row = container.querySelector('#lmf-BTC-USDC');
    expect(row).not.toBeNull();
    expect(row!.textContent).toContain('45,000');
    expect(row!.textContent).toContain('+1.20%');
  });

  it('updates the existing row in place on the next tick', () => {
    const { container, socket } = mount();
    socket.fire('market:price_update', priceEvent('XLM/USDC', 0.1, 0));
    socket.fire('market:price_update', priceEvent('XLM/USDC', 0.12, -2));

    expect(container.querySelectorAll('#lmf-body tr')).toHaveLength(1);
    expect(container.querySelector('#lmf-XLM-USDC')!.textContent).toContain('−2.00%');
  });

  it('disconnects the socket on destroy', () => {
    const { panel, socket } = mount();
    panel.destroy();
    expect(socket.disconnected).toBe(true);
  });
});
