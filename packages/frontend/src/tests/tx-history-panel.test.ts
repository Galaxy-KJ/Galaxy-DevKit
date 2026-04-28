/**
 * @jest-environment jest-environment-jsdom
 */

import { TxHistoryPanel } from '../panels/tx-history';
import { TxTrackerService } from '../services/tx-tracker';

describe('TxHistoryPanel', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  it('renders empty state', () => {
    const tracker = new TxTrackerService();
    new TxHistoryPanel(container, tracker, {
      onResimulateFailedTx: jest.fn().mockResolvedValue(undefined),
    });

    expect(container.textContent).toContain('No submitted transactions yet.');
  });

  it('renders explorer link for successful transactions', () => {
    const tracker = new TxTrackerService();
    const tx = tracker.createPending({
      walletAddress: 'CWALLET',
      destination: 'GDEST',
      amount: '10',
      unsignedXdr: 'AAAA',
      network: 'testnet',
    });
    tracker.markSuccess(tx.id, 'ABC123HASH');

    new TxHistoryPanel(container, tracker, {
      onResimulateFailedTx: jest.fn().mockResolvedValue(undefined),
    });

    const link = container.querySelector('a');
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toContain('/explorer/testnet/tx/ABC123HASH');
  });

  it('shows re-simulate action for failed entries', async () => {
    const tracker = new TxTrackerService();
    const tx = tracker.createPending({
      walletAddress: 'CWALLET',
      destination: 'GDEST',
      amount: '10',
      unsignedXdr: 'AAAA',
      network: 'testnet',
    });
    tracker.markFailed(tx.id, 'failed submit');

    const onResimulateFailedTx = jest.fn().mockResolvedValue(undefined);
    new TxHistoryPanel(container, tracker, { onResimulateFailedTx });

    const button = Array.from(container.querySelectorAll('button')).find(
      (btn) => btn.textContent === 'Re-simulate'
    ) as HTMLButtonElement;
    button.click();
    await Promise.resolve();

    expect(onResimulateFailedTx).toHaveBeenCalled();
  });
});
