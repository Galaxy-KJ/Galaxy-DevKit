/**
 * @jest-environment jest-environment-jsdom
 */

import { TxTrackerService } from '../services/tx-tracker';

describe('TxTrackerService', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists pending -> success transitions', () => {
    const tracker = new TxTrackerService();
    const entry = tracker.createPending({
      walletAddress: 'CWALLET',
      destination: 'GDEST',
      amount: '10',
      unsignedXdr: 'AAAA',
      network: 'testnet',
    });

    tracker.markSuccess(entry.id, 'HASH123', 'SIGNEDXDR');
    const stored = new TxTrackerService().list();

    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe('success');
    expect(stored[0].txHash).toBe('HASH123');
    expect(stored[0].signedXdr).toBe('SIGNEDXDR');
  });

  it('stores failure state and allows clear', () => {
    const tracker = new TxTrackerService();
    const entry = tracker.createPending({
      walletAddress: 'CWALLET',
      destination: 'GDEST',
      amount: '10',
      unsignedXdr: 'AAAA',
      network: 'testnet',
    });

    tracker.markFailed(entry.id, 'submit failed');
    expect(tracker.list()[0].status).toBe('failed');
    expect(tracker.list()[0].error).toContain('submit failed');

    tracker.clear();
    expect(tracker.list()).toHaveLength(0);
  });

  it('notifies subscribers when entries change', () => {
    const tracker = new TxTrackerService();
    const listener = jest.fn();
    tracker.subscribe(listener);

    tracker.createPending({
      walletAddress: 'CWALLET',
      destination: 'GDEST',
      amount: '10',
      unsignedXdr: 'AAAA',
      network: 'testnet',
    });

    expect(listener).toHaveBeenCalled();
    expect(listener.mock.calls[listener.mock.calls.length - 1][0]).toHaveLength(1);
  });

  it('recovers gracefully from corrupted localStorage payload', () => {
    localStorage.setItem('galaxy_tx_history_v1', '{bad-json');
    const tracker = new TxTrackerService();
    expect(tracker.list()).toEqual([]);
  });

  it('ignores non-array payloads from localStorage', () => {
    localStorage.setItem('galaxy_tx_history_v1', JSON.stringify({ bad: true }));
    const tracker = new TxTrackerService();
    expect(tracker.list()).toEqual([]);
  });

  it('keeps entries unchanged when update id is missing', () => {
    const tracker = new TxTrackerService();
    const entry = tracker.createPending({
      walletAddress: 'CWALLET',
      destination: 'GDEST',
      amount: '10',
      unsignedXdr: 'AAAA',
      network: 'testnet',
    });

    tracker.markSuccess('missing-id', 'HASH123');
    expect(tracker.list()[0].id).toBe(entry.id);
    expect(tracker.list()[0].status).toBe('pending');
  });
});
