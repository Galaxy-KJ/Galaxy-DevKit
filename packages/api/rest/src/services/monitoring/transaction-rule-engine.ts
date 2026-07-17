import {
  MonitoringTransaction,
  RuleMatch,
  TransactionMonitoringRule,
} from '../../types/transaction-monitoring-types';

interface TimedTransaction {
  timestamp: number;
  successful: boolean;
}

/**
 * Stateless configuration plus bounded, in-process sliding windows. The worker
 * owns one engine so evaluation never blocks Horizon's event callback on I/O.
 */
export class TransactionRuleEngine {
  private readonly history = new Map<string, TimedTransaction[]>();

  evaluate(rule: TransactionMonitoringRule, transaction: MonitoringTransaction): RuleMatch | null {
    if (!rule.active) return null;
    switch (rule.ruleType) {
      case 'large_transfer': return this.largeTransfer(rule, transaction);
      case 'rapid_transactions': return this.rapidTransactions(rule, transaction);
      case 'unusual_counterparty': return this.unusualCounterparty(rule, transaction);
      case 'defi_position_change': return this.defiPositionChange(rule, transaction);
      case 'failed_transactions': return this.failedTransactions(rule, transaction);
    }
  }

  private largeTransfer(rule: TransactionMonitoringRule, tx: MonitoringTransaction): RuleMatch | null {
    const threshold = numberConfig(rule.config, 'amountThreshold');
    if (threshold === null || (tx.amount ?? 0) < threshold) return null;
    return { pattern: rule.ruleType, details: { amount: tx.amount, threshold, asset: tx.asset ?? 'XLM' } };
  }

  private rapidTransactions(rule: TransactionMonitoringRule, tx: MonitoringTransaction): RuleMatch | null {
    const countThreshold = numberConfig(rule.config, 'countThreshold');
    const windowSeconds = numberConfig(rule.config, 'windowSeconds');
    if (countThreshold === null || windowSeconds === null) return null;
    const key = `${rule.id}:${tx.accountAddress}:all`;
    const count = this.recordAndCount(key, tx, windowSeconds, false);
    return count >= countThreshold
      ? { pattern: rule.ruleType, details: { count, countThreshold, windowSeconds } }
      : null;
  }

  private unusualCounterparty(rule: TransactionMonitoringRule, tx: MonitoringTransaction): RuleMatch | null {
    const counterparty = tx.counterparty;
    if (!counterparty) return null;
    const flagged = stringArrayConfig(rule.config, 'flaggedAccounts');
    const trusted = stringArrayConfig(rule.config, 'trustedAccounts');
    const isFlagged = flagged.includes(counterparty);
    const isUnknown = trusted.length > 0 && !trusted.includes(counterparty);
    if (!isFlagged && !isUnknown) return null;
    return { pattern: rule.ruleType, details: { counterparty, reason: isFlagged ? 'flagged_account' : 'unknown_account' } };
  }

  private defiPositionChange(rule: TransactionMonitoringRule, tx: MonitoringTransaction): RuleMatch | null {
    const threshold = numberConfig(rule.config, 'changeThreshold');
    const change = tx.defiPositionChange;
    if (threshold === null || change === undefined || Math.abs(change) < threshold) return null;
    return { pattern: rule.ruleType, details: { positionChange: change, changeThreshold: threshold } };
  }

  private failedTransactions(rule: TransactionMonitoringRule, tx: MonitoringTransaction): RuleMatch | null {
    const countThreshold = numberConfig(rule.config, 'countThreshold');
    const windowSeconds = numberConfig(rule.config, 'windowSeconds');
    if (countThreshold === null || windowSeconds === null) return null;
    const key = `${rule.id}:${tx.accountAddress}:failed`;
    const count = this.recordAndCount(key, tx, windowSeconds, true);
    return count >= countThreshold
      ? { pattern: rule.ruleType, details: { count, countThreshold, windowSeconds } }
      : null;
  }

  private recordAndCount(key: string, tx: MonitoringTransaction, windowSeconds: number, failuresOnly: boolean): number {
    const now = tx.confirmedAt.getTime();
    const cutoff = now - windowSeconds * 1000;
    const entries = (this.history.get(key) ?? []).filter((entry) => entry.timestamp >= cutoff);
    entries.push({ timestamp: now, successful: tx.successful });
    this.history.set(key, entries);
    return failuresOnly ? entries.filter((entry) => !entry.successful).length : entries.length;
  }
}

function numberConfig(config: Record<string, unknown>, key: string): number | null {
  const value = config[key];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function stringArrayConfig(config: Record<string, unknown>, key: string): string[] {
  const value = config[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}
