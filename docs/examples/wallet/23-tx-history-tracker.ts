import { TxTrackerService } from '../../../packages/frontend/src/services/tx-tracker';

const tracker = new TxTrackerService();

const pending = tracker.createPending({
  walletAddress: 'CCONTRACT...',
  destination: 'GDESTINATION...',
  amount: '25',
  memo: 'Demo transfer',
  unsignedXdr: 'AAAA....',
  network: 'testnet',
});

// later: update with submit result
tracker.markSuccess(pending.id, 'f5de4e...hash');

// or on failure
// tracker.markFailed(pending.id, 'Simulation failed with auth mismatch');

console.log('Current local tx history:', tracker.list());
