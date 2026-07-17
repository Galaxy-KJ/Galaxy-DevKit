import { Horizon } from '@stellar/stellar-sdk';
import { TransactionMonitoringRepository } from '../repositories/transaction-monitoring.repository';
import { TransactionMonitoringService } from '../services/monitoring/transaction-monitoring.service';
import { MonitoredAccount, MonitoringTransaction, TransactionMonitoringNetwork } from '../types/transaction-monitoring-types';

const HORIZON_URLS: Record<TransactionMonitoringNetwork, string> = {
  testnet: 'https://horizon-testnet.stellar.org', mainnet: 'https://horizon.stellar.org',
};

export interface TransactionMonitorWorkerOptions {
  network: TransactionMonitoringNetwork;
  accountRefreshIntervalMs?: number;
  maxConcurrency?: number;
  maxQueueSize?: number;
}

/** Streams confirmed Horizon transactions for configured accounts. */
export class TransactionMonitorWorker {
  private readonly streams = new Map<string, () => void>();
  private readonly queue: Array<{ account: MonitoredAccount; record: Record<string, unknown> }> = [];
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private processing = 0;
  private readonly server: Horizon.Server;
  private readonly concurrency: number;
  private readonly maxQueueSize: number;

  constructor(
    private readonly options: TransactionMonitorWorkerOptions,
    private readonly repo: TransactionMonitoringRepository = new TransactionMonitoringRepository(),
    private readonly service: TransactionMonitoringService = new TransactionMonitoringService(),
  ) {
    this.server = new Horizon.Server(HORIZON_URLS[options.network]);
    this.concurrency = options.maxConcurrency ?? 16;
    this.maxQueueSize = options.maxQueueSize ?? 5_000;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    await this.refreshAccounts();
    this.refreshTimer = setInterval(() => { void this.refreshAccounts(); }, this.options.accountRefreshIntervalMs ?? 30_000);
  }

  stop(): void {
    this.running = false;
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = null;
    for (const close of this.streams.values()) close();
    this.streams.clear(); this.queue.length = 0;
  }

  private async refreshAccounts(): Promise<void> {
    if (!this.running) return;
    try {
      const accounts = await this.repo.listActiveAccounts(this.options.network);
      const desired = new Set(accounts.map((account) => account.id));
      for (const [id, close] of this.streams) if (!desired.has(id)) { close(); this.streams.delete(id); }
      for (const account of accounts) if (!this.streams.has(account.id)) this.openStream(account);
    } catch (error) {
      console.error('[transaction-monitor] failed to refresh monitored accounts:', error);
    }
  }

  private openStream(account: MonitoredAccount): void {
    const close = this.server.transactions().forAccount(account.accountAddress).cursor('now').stream({
      onmessage: (record) => this.enqueue(account, record as unknown as Record<string, unknown>),
      onerror: (error) => console.error(`[transaction-monitor] Horizon stream error for ${account.accountAddress}:`, error),
    });
    this.streams.set(account.id, close);
  }

  private enqueue(account: MonitoredAccount, record: Record<string, unknown>): void {
    if (!this.running) return;
    if (this.queue.length >= this.maxQueueSize) {
      console.warn('[transaction-monitor] queue full; dropping newest transaction until Horizon reconnect/replay');
      return;
    }
    this.queue.push({ account, record }); this.drain();
  }

  private drain(): void {
    while (this.processing < this.concurrency && this.queue.length > 0) {
      const next = this.queue.shift()!; this.processing++;
      void this.process(next.account, next.record).catch((error) => console.error('[transaction-monitor] event processing failed:', error)).finally(() => { this.processing--; this.drain(); });
    }
  }

  private async process(account: MonitoredAccount, record: Record<string, unknown>): Promise<void> {
    const hash = stringField(record, 'hash'); if (!hash) return;
    const operationsPage = await this.server.operations().forTransaction(hash).call();
    const operations = ((operationsPage as unknown as { records?: Record<string, unknown>[] }).records ?? []);
    const payment = operations.find((operation) => typeof operation.amount === 'string' || typeof operation.amount === 'number');
    const tx: MonitoringTransaction = {
      hash, accountAddress: account.accountAddress, sourceAccount: stringField(record, 'source_account'),
      counterparty: payment ? stringField(payment, 'to') ?? stringField(payment, 'from') : undefined,
      amount: payment ? numericField(payment, 'amount') : undefined,
      asset: payment ? stringField(payment, 'asset_code') ?? (stringField(payment, 'asset_type') === 'native' ? 'XLM' : undefined) : undefined,
      successful: record.successful !== false,
      // Horizon reports liquidity-pool withdrawals as reserves_received. A
      // negative aggregate models the monitored account's position reduction;
      // protocol adapters can provide a richer normalized value later.
      defiPositionChange: deriveDefiPositionChange(operations),
      confirmedAt: new Date(stringField(record, 'created_at') ?? Date.now()), raw: record,
    };
    await this.service.processTransaction(account, tx);
  }
}

function stringField(value: Record<string, unknown>, key: string): string | undefined { const field = value[key]; return typeof field === 'string' ? field : undefined; }
function numericField(value: Record<string, unknown>, key: string): number | undefined { const field = value[key]; const number = typeof field === 'number' ? field : typeof field === 'string' ? Number(field) : NaN; return Number.isFinite(number) ? number : undefined; }
function deriveDefiPositionChange(operations: Record<string, unknown>[]): number | undefined {
  const withdrawal = operations.find((operation) => stringField(operation, 'type') === 'liquidity_pool_withdraw');
  if (!withdrawal || !Array.isArray(withdrawal.reserves_received)) return undefined;
  const amount = withdrawal.reserves_received.reduce<number>((total, reserve) => {
    if (!reserve || typeof reserve !== 'object') return total;
    return total + (numericField(reserve as Record<string, unknown>, 'amount') ?? 0);
  }, 0);
  return amount > 0 ? -amount : undefined;
}
