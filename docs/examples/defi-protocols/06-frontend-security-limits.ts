/**
 * Frontend Security Limits panel example
 *
 * Shows how to mount the panel with an isolated storage key so tests
 * and demos do not mix records with other sessions.
 */

import { SecurityLimitsClient, SecurityLimitsPanel } from '@galaxy-kj/frontend';

const root = document.getElementById('security-limits-root');

if (!root) {
  throw new Error('Expected #security-limits-root container');
}

new SecurityLimitsPanel(
  root,
  new SecurityLimitsClient('security-limits-demo-state')
);

// The panel UI supports:
// 1) Creating daily/weekly/monthly/custom allowances
// 2) Setting risk profiles (allowed/blacklisted assets)
// 3) Checking + recording simulated transactions
