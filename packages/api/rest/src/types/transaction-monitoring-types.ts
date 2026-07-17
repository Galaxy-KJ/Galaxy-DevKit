export type TransactionMonitoringNetwork = 'testnet' | 'mainnet';
export type TransactionMonitoringRuleType =
  | 'large_transfer'
  | 'rapid_transactions'
  | 'unusual_counterparty'
  | 'defi_position_change'
  | 'failed_transactions';
export type TransactionMonitoringSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface MonitoredAccount {
  id: string;
  organizationId: string;
  accountAddress: string;
  network: TransactionMonitoringNetwork;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface TransactionMonitoringRule {
  id: string;
  organizationId: string;
  name: string;
  ruleType: TransactionMonitoringRuleType;
  config: Record<string, unknown>;
  severity: TransactionMonitoringSeverity;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface MonitoringTransaction {
  hash: string;
  accountAddress: string;
  sourceAccount?: string;
  counterparty?: string;
  amount?: number;
  asset?: string;
  successful: boolean;
  defiPositionChange?: number;
  confirmedAt: Date;
  raw: Record<string, unknown>;
}

export interface TransactionMonitoringEvent {
  id: string;
  organizationId: string;
  monitoredAccountId: string | null;
  ruleId: string | null;
  transactionHash: string;
  pattern: TransactionMonitoringRuleType;
  severity: TransactionMonitoringSeverity;
  details: Record<string, unknown>;
  occurredAt: Date;
  createdAt: Date;
}

export interface RuleMatch {
  pattern: TransactionMonitoringRuleType;
  details: Record<string, unknown>;
}
