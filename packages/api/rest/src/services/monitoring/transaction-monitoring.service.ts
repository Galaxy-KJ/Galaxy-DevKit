import { TransactionMonitoringRepository } from '../../repositories/transaction-monitoring.repository';
import { TeamsService } from '../teams.service';
import {
  MonitoredAccount, MonitoringTransaction, TransactionMonitoringEvent,
  TransactionMonitoringNetwork, TransactionMonitoringRule, TransactionMonitoringRuleType,
  TransactionMonitoringSeverity,
} from '../../types/transaction-monitoring-types';
import { TransactionRuleEngine } from './transaction-rule-engine';

export class TransactionMonitoringService {
  constructor(
    private readonly repo: TransactionMonitoringRepository = new TransactionMonitoringRepository(),
    private readonly teams: TeamsService = new TeamsService(),
    private readonly engine: TransactionRuleEngine = new TransactionRuleEngine(),
  ) {}

  async addAccount(userId: string, organizationId: string, address: string, network: TransactionMonitoringNetwork): Promise<MonitoredAccount> {
    await this.teams.assertMembership(organizationId, userId, 'admin');
    return this.repo.createAccount(organizationId, address, network);
  }
  async listAccounts(userId: string, organizationId: string): Promise<MonitoredAccount[]> {
    await this.teams.assertMembership(organizationId, userId); return this.repo.listAccounts(organizationId);
  }
  async removeAccount(userId: string, organizationId: string, id: string): Promise<void> {
    await this.teams.assertMembership(organizationId, userId, 'admin');
    if (!await this.repo.deleteAccount(id, organizationId)) throw new Error('Monitored account not found');
  }
  async createRule(userId: string, organizationId: string, input: { name: string; ruleType: TransactionMonitoringRuleType; config: Record<string, unknown>; severity: TransactionMonitoringSeverity; active?: boolean }): Promise<TransactionMonitoringRule> {
    await this.teams.assertMembership(organizationId, userId, 'admin');
    return this.repo.createRule({ organizationId, ...input, active: input.active ?? true });
  }
  async listRules(userId: string, organizationId: string): Promise<TransactionMonitoringRule[]> {
    await this.teams.assertMembership(organizationId, userId); return this.repo.listRules(organizationId);
  }
  async updateRule(userId: string, organizationId: string, id: string, patch: Partial<Pick<TransactionMonitoringRule, 'name' | 'config' | 'severity' | 'active'>>): Promise<TransactionMonitoringRule> {
    await this.teams.assertMembership(organizationId, userId, 'admin');
    const rule = await this.repo.updateRule(id, organizationId, patch); if (!rule) throw new Error('Transaction monitoring rule not found'); return rule;
  }
  async removeRule(userId: string, organizationId: string, id: string): Promise<void> {
    await this.teams.assertMembership(organizationId, userId, 'admin'); if (!await this.repo.deleteRule(id, organizationId)) throw new Error('Transaction monitoring rule not found');
  }
  async listEvents(userId: string, organizationId: string, opts?: { limit?: number; offset?: number }): Promise<TransactionMonitoringEvent[]> {
    await this.teams.assertMembership(organizationId, userId); return this.repo.listEvents(organizationId, opts);
  }

  /** Called by the Horizon worker. Persists first, so WebSocket Realtime broadcasts only durable alerts. */
  async processTransaction(account: MonitoredAccount, transaction: MonitoringTransaction): Promise<TransactionMonitoringEvent[]> {
    const rules = await this.repo.listRules(account.organizationId, true);
    const matches = rules.map((rule) => ({ rule, match: this.engine.evaluate(rule, transaction) })).filter((entry) => entry.match !== null);
    const persisted = await Promise.all(matches.map(({ rule, match }) => this.repo.createEvent({
      organizationId: account.organizationId, monitoredAccountId: account.id, ruleId: rule.id,
      transactionHash: transaction.hash, pattern: match!.pattern, severity: rule.severity,
      details: { ...match!.details, accountAddress: account.accountAddress, sourceAccount: transaction.sourceAccount ?? null, counterparty: transaction.counterparty ?? null },
      occurredAt: transaction.confirmedAt,
    })));
    return persisted.filter((event): event is TransactionMonitoringEvent => event !== null);
  }
}
