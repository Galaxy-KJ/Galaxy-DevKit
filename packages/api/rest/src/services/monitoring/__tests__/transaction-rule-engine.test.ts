import { TransactionRuleEngine } from '../transaction-rule-engine';
import { MonitoringTransaction, TransactionMonitoringRule } from '../../../types/transaction-monitoring-types';

const account = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const baseTx = (overrides: Partial<MonitoringTransaction> = {}): MonitoringTransaction => ({
  hash: 'tx-1', accountAddress: account, successful: true, confirmedAt: new Date('2026-07-17T00:00:00.000Z'), raw: {}, ...overrides,
});
const rule = (ruleType: TransactionMonitoringRule['ruleType'], config: Record<string, unknown>): TransactionMonitoringRule => ({
  id: `rule-${ruleType}`, organizationId: '00000000-0000-4000-8000-000000000001', name: ruleType,
  ruleType, config, severity: 'high', active: true, createdAt: new Date(), updatedAt: new Date(),
});

describe('TransactionRuleEngine', () => {
  it('flags transfers at or above the configured amount threshold', () => {
    expect(new TransactionRuleEngine().evaluate(rule('large_transfer', { amountThreshold: 1000 }), baseTx({ amount: 1000 }))).toMatchObject({ pattern: 'large_transfer' });
  });

  it('flags rapid successive transactions within the configured window', () => {
    const engine = new TransactionRuleEngine(); const current = rule('rapid_transactions', { countThreshold: 2, windowSeconds: 60 });
    engine.evaluate(current, baseTx());
    expect(engine.evaluate(current, baseTx({ hash: 'tx-2', confirmedAt: new Date('2026-07-17T00:00:20.000Z') }))).toMatchObject({ pattern: 'rapid_transactions' });
  });

  it('flags known flagged counterparties and unknown counterparties', () => {
    const engine = new TransactionRuleEngine();
    expect(engine.evaluate(rule('unusual_counterparty', { flaggedAccounts: ['GFLAGGED'] }), baseTx({ counterparty: 'GFLAGGED' }))).toMatchObject({ details: { reason: 'flagged_account' } });
    expect(engine.evaluate(rule('unusual_counterparty', { trustedAccounts: ['GKNOWN'] }), baseTx({ counterparty: 'GUNKNOWN' }))).toMatchObject({ details: { reason: 'unknown_account' } });
  });

  it('flags abnormal DeFi position changes in either direction', () => {
    expect(new TransactionRuleEngine().evaluate(rule('defi_position_change', { changeThreshold: 500 }), baseTx({ defiPositionChange: -501 }))).toMatchObject({ pattern: 'defi_position_change' });
  });

  it('flags repeated failed transactions within the configured window', () => {
    const engine = new TransactionRuleEngine(); const current = rule('failed_transactions', { countThreshold: 2, windowSeconds: 60 });
    engine.evaluate(current, baseTx({ successful: false }));
    expect(engine.evaluate(current, baseTx({ hash: 'tx-2', successful: false, confirmedAt: new Date('2026-07-17T00:00:30.000Z') }))).toMatchObject({ pattern: 'failed_transactions' });
  });
});
