import {
  TxTrackerService,
  TrackedTransaction,
} from '../services/tx-tracker';

export interface TxHistoryPanelCallbacks {
  onResimulateFailedTx: (tx: TrackedTransaction) => Promise<void>;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

function statusClass(status: TrackedTransaction['status']): string {
  if (status === 'success') return 'tx-status-success';
  if (status === 'failed') return 'tx-status-failed';
  return 'tx-status-pending';
}

export class TxHistoryPanel {
  private container: HTMLElement;
  private tracker: TxTrackerService;
  private callbacks: TxHistoryPanelCallbacks;
  private unsubscribe: (() => void) | null = null;

  constructor(
    container: HTMLElement,
    tracker: TxTrackerService,
    callbacks: TxHistoryPanelCallbacks
  ) {
    this.container = container;
    this.tracker = tracker;
    this.callbacks = callbacks;
    this.renderShell();
    this.unsubscribe = this.tracker.subscribe((entries) => this.renderEntries(entries));
  }

  destroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private renderShell(): void {
    this.container.innerHTML = '';
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'Transaction history');

    const heading = document.createElement('h2');
    heading.textContent = 'Transaction History';
    this.container.appendChild(heading);

    const subtitle = document.createElement('p');
    subtitle.className = 'tx-history-subtitle';
    subtitle.textContent =
      'Local session history of submitted transactions with status and explorer links.';
    this.container.appendChild(subtitle);

    const controls = document.createElement('div');
    controls.className = 'tx-history-controls';
    const clearButton = document.createElement('button');
    clearButton.type = 'button';
    clearButton.className = 'btn-secondary';
    clearButton.textContent = 'Clear History';
    clearButton.addEventListener('click', () => this.tracker.clear());
    controls.appendChild(clearButton);
    this.container.appendChild(controls);

    const list = document.createElement('ul');
    list.id = 'tx-history-list';
    list.className = 'tx-history-list';
    list.setAttribute('aria-live', 'polite');
    this.container.appendChild(list);
  }

  private renderEntries(entries: TrackedTransaction[]): void {
    const list = this.container.querySelector('#tx-history-list');
    if (!list) return;
    list.innerHTML = '';

    if (entries.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'tx-history-empty';
      empty.textContent = 'No submitted transactions yet.';
      list.appendChild(empty);
      return;
    }

    entries.forEach((entry) => {
      const item = document.createElement('li');
      item.className = 'tx-history-item';

      const header = document.createElement('div');
      header.className = 'tx-history-item-header';

      const status = document.createElement('span');
      status.className = `tx-status-pill ${statusClass(entry.status)}`;
      status.textContent = entry.status.toUpperCase();

      const created = document.createElement('span');
      created.className = 'tx-history-time';
      created.textContent = formatDate(entry.createdAt);

      header.appendChild(status);
      header.appendChild(created);
      item.appendChild(header);

      const summary = document.createElement('p');
      summary.className = 'tx-history-summary';
      summary.textContent = `${entry.amount} XLM -> ${entry.destination}`;
      item.appendChild(summary);

      if (entry.txHash) {
        const link = document.createElement('a');
        const networkSegment =
          entry.network === 'mainnet' ? 'public' : 'testnet';
        link.href = `https://stellar.expert/explorer/${networkSegment}/tx/${entry.txHash}`;
        link.target = '_blank';
        link.rel = 'noreferrer noopener';
        link.textContent = `View on Stellar Expert (${entry.txHash.slice(0, 10)}...)`;
        item.appendChild(link);
      }

      if (entry.error) {
        const error = document.createElement('p');
        error.className = 'tx-history-error';
        error.textContent = `Failure: ${entry.error}`;
        item.appendChild(error);
      }

      if (entry.status === 'failed') {
        const retryButton = document.createElement('button');
        retryButton.type = 'button';
        retryButton.className = 'btn-secondary';
        retryButton.textContent = 'Re-simulate';
        retryButton.addEventListener('click', async () => {
          retryButton.disabled = true;
          const originalLabel = retryButton.textContent;
          retryButton.textContent = 'Re-simulating...';
          try {
            await this.callbacks.onResimulateFailedTx(entry);
            this.tracker.markResimulated(entry.id);
          } finally {
            retryButton.disabled = false;
            retryButton.textContent = originalLabel ?? 'Re-simulate';
          }
        });
        item.appendChild(retryButton);
      }

      list.appendChild(item);
    });
  }
}
