export type TxStatus = 'pending' | 'success' | 'failed';

export interface TrackedTransaction {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: TxStatus;
  network: 'testnet' | 'mainnet' | 'unknown';
  walletAddress: string;
  destination: string;
  amount: string;
  memo?: string;
  unsignedXdr: string;
  signedXdr?: string;
  txHash?: string;
  error?: string;
  simulationAuthEntryCount?: number;
  simulationResourceFee?: string;
  lastResimulationAt?: number;
}

export interface PendingTxInput {
  walletAddress: string;
  destination: string;
  amount: string;
  memo?: string;
  unsignedXdr: string;
  network: 'testnet' | 'mainnet' | 'unknown';
  simulationAuthEntryCount?: number;
  simulationResourceFee?: string;
}

type Listener = (entries: TrackedTransaction[]) => void;

const STORAGE_KEY = 'galaxy_tx_history_v1';

function hasStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readEntries(): TrackedTransaction[] {
  if (!hasStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TrackedTransaction[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: TrackedTransaction[]): void {
  if (!hasStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

function createId(): string {
  return `tx_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export class TxTrackerService {
  private entries: TrackedTransaction[];
  private listeners: Set<Listener>;

  constructor() {
    this.entries = readEntries();
    this.listeners = new Set();
  }

  list(): TrackedTransaction[] {
    return [...this.entries].sort((a, b) => b.createdAt - a.createdAt);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.list());
    return () => this.listeners.delete(listener);
  }

  createPending(input: PendingTxInput): TrackedTransaction {
    const now = Date.now();
    const entry: TrackedTransaction = {
      id: createId(),
      createdAt: now,
      updatedAt: now,
      status: 'pending',
      ...input,
    };

    this.entries = [entry, ...this.entries];
    this.persistAndNotify();
    return entry;
  }

  markSuccess(id: string, txHash: string, signedXdr?: string): void {
    this.updateById(id, (entry) => ({
      ...entry,
      status: 'success',
      txHash,
      signedXdr: signedXdr ?? entry.signedXdr,
      error: undefined,
      updatedAt: Date.now(),
    }));
  }

  markFailed(id: string, error: string, signedXdr?: string): void {
    this.updateById(id, (entry) => ({
      ...entry,
      status: 'failed',
      error,
      signedXdr: signedXdr ?? entry.signedXdr,
      updatedAt: Date.now(),
    }));
  }

  markResimulated(id: string): void {
    this.updateById(id, (entry) => ({
      ...entry,
      lastResimulationAt: Date.now(),
      updatedAt: Date.now(),
    }));
  }

  clear(): void {
    this.entries = [];
    this.persistAndNotify();
  }

  private updateById(
    id: string,
    updater: (entry: TrackedTransaction) => TrackedTransaction
  ): void {
    this.entries = this.entries.map((entry) => {
      if (entry.id !== id) return entry;
      return updater(entry);
    });
    this.persistAndNotify();
  }

  private persistAndNotify(): void {
    writeEntries(this.entries);
    const snapshot = this.list();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
