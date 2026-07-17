import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseClient } from '../utils/supabase';
import {
  MonitoredAccount,
  TransactionMonitoringEvent,
  TransactionMonitoringNetwork,
  TransactionMonitoringRule,
  TransactionMonitoringRuleType,
  TransactionMonitoringSeverity,
} from '../types/transaction-monitoring-types';

const ACCOUNTS = 'transaction_monitoring_accounts';
const RULES = 'transaction_monitoring_rules';
const EVENTS = 'transaction_monitoring_events';

const accountFromRow = (row: any): MonitoredAccount => ({
  id: row.id, organizationId: row.organization_id, accountAddress: row.account_address,
  network: row.network, active: row.active, createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at),
});
const ruleFromRow = (row: any): TransactionMonitoringRule => ({
  id: row.id, organizationId: row.organization_id, name: row.name, ruleType: row.rule_type,
  config: row.config ?? {}, severity: row.severity, active: row.active,
  createdAt: new Date(row.created_at), updatedAt: new Date(row.updated_at),
});
const eventFromRow = (row: any): TransactionMonitoringEvent => ({
  id: row.id, organizationId: row.organization_id, monitoredAccountId: row.monitored_account_id,
  ruleId: row.rule_id, transactionHash: row.transaction_hash, pattern: row.pattern,
  severity: row.severity, details: row.details ?? {}, occurredAt: new Date(row.occurred_at), createdAt: new Date(row.created_at),
});

export class TransactionMonitoringRepository {
  constructor(private readonly client: SupabaseClient = getSupabaseClient()) {}

  async createAccount(organizationId: string, accountAddress: string, network: TransactionMonitoringNetwork): Promise<MonitoredAccount> {
    const { data, error } = await this.client.from(ACCOUNTS).insert({ organization_id: organizationId, account_address: accountAddress, network }).select('*').single();
    if (error || !data) throw new Error(`Failed to create monitored account: ${error?.message ?? 'unknown error'}`);
    return accountFromRow(data);
  }

  async listAccounts(organizationId: string, activeOnly = false): Promise<MonitoredAccount[]> {
    let query = this.client.from(ACCOUNTS).select('*').eq('organization_id', organizationId).order('created_at', { ascending: false });
    if (activeOnly) query = query.eq('active', true);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(accountFromRow);
  }

  async listActiveAccounts(network: TransactionMonitoringNetwork): Promise<MonitoredAccount[]> {
    const { data, error } = await this.client.from(ACCOUNTS).select('*').eq('network', network).eq('active', true);
    if (error) throw error;
    return (data ?? []).map(accountFromRow);
  }

  async deleteAccount(id: string, organizationId: string): Promise<boolean> {
    const { count, error } = await this.client.from(ACCOUNTS).delete({ count: 'exact' }).eq('id', id).eq('organization_id', organizationId);
    if (error) throw error;
    return (count ?? 0) > 0;
  }

  async createRule(input: Omit<TransactionMonitoringRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<TransactionMonitoringRule> {
    const { data, error } = await this.client.from(RULES).insert({ organization_id: input.organizationId, name: input.name, rule_type: input.ruleType, config: input.config, severity: input.severity, active: input.active }).select('*').single();
    if (error || !data) throw new Error(`Failed to create transaction monitoring rule: ${error?.message ?? 'unknown error'}`);
    return ruleFromRow(data);
  }

  async listRules(organizationId: string, activeOnly = false): Promise<TransactionMonitoringRule[]> {
    let query = this.client.from(RULES).select('*').eq('organization_id', organizationId).order('created_at', { ascending: false });
    if (activeOnly) query = query.eq('active', true);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []).map(ruleFromRow);
  }

  async updateRule(id: string, organizationId: string, patch: Partial<Pick<TransactionMonitoringRule, 'name' | 'config' | 'severity' | 'active'>>): Promise<TransactionMonitoringRule | null> {
    const update: Record<string, unknown> = {};
    if (patch.name !== undefined) update.name = patch.name;
    if (patch.config !== undefined) update.config = patch.config;
    if (patch.severity !== undefined) update.severity = patch.severity;
    if (patch.active !== undefined) update.active = patch.active;
    const { data, error } = await this.client.from(RULES).update(update).eq('id', id).eq('organization_id', organizationId).select('*').maybeSingle();
    if (error) throw error;
    return data ? ruleFromRow(data) : null;
  }

  async deleteRule(id: string, organizationId: string): Promise<boolean> {
    const { count, error } = await this.client.from(RULES).delete({ count: 'exact' }).eq('id', id).eq('organization_id', organizationId);
    if (error) throw error;
    return (count ?? 0) > 0;
  }

  async createEvent(input: Omit<TransactionMonitoringEvent, 'id' | 'createdAt'>): Promise<TransactionMonitoringEvent | null> {
    const { data, error } = await this.client.from(EVENTS).insert({ organization_id: input.organizationId, monitored_account_id: input.monitoredAccountId, rule_id: input.ruleId, transaction_hash: input.transactionHash, pattern: input.pattern, severity: input.severity, details: input.details, occurred_at: input.occurredAt.toISOString() }).select('*').maybeSingle();
    // A duplicate is expected after a Horizon reconnect; the unique index makes processing idempotent.
    if (error && error.code !== '23505') throw error;
    return data ? eventFromRow(data) : null;
  }

  async listEvents(organizationId: string, opts: { limit?: number; offset?: number } = {}): Promise<TransactionMonitoringEvent[]> {
    const limit = opts.limit ?? 50; const offset = opts.offset ?? 0;
    const { data, error } = await this.client.from(EVENTS).select('*').eq('organization_id', organizationId).order('occurred_at', { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw error;
    return (data ?? []).map(eventFromRow);
  }
}
