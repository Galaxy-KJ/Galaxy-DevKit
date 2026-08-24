/**
 * Execution-attempt registry.
 *
 * Idempotency / locking (why this exists):
 * - In-memory `inFlightByAutomation` blocks overlapping poll cycles in this process
 *   from triggering the same automation twice.
 * - Persisted rows in `automation_execution_attempts` survive crashes. A unique
 *   partial index allows only one open (pending|executing|submitted) attempt per
 *   automation. If an attempt already has a `transaction_hash`, retries MUST NOT
 *   submit another transaction — they reuse the stored hash.
 */

import { randomUUID } from 'crypto';
import {
  ExecutionAttempt,
  ExecutionAttemptStatus,
} from '../types/automation-types.js';

const OPEN_STATUSES: ExecutionAttemptStatus[] = [
  'pending',
  'executing',
  'submitted',
];

export interface AttemptStoreClient {
  from: (table: string) => {
    insert?: (rows: unknown) => PromiseLike<{ error?: { message: string } | null }>;
    update?: (values: unknown) => {
      eq: (
        column: string,
        value: string
      ) => PromiseLike<{ error?: { message: string } | null }>;
    };
    select?: (columns: string) => {
      eq: (column: string, value: string) => {
        in: (column: string, values: string[]) => {
          order: (
            column: string,
            options: { ascending: boolean }
          ) => {
            limit: (count: number) => PromiseLike<{
              data: Array<Record<string, unknown>> | null;
              error?: { message: string } | null;
            }>;
          };
        };
      };
    };
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function rowToAttempt(row: Record<string, unknown>): ExecutionAttempt {
  return {
    id: String(row.id),
    automationId: String(row.automation_id),
    status: row.status as ExecutionAttemptStatus,
    transactionHash:
      typeof row.transaction_hash === 'string' ? row.transaction_hash : undefined,
    error: typeof row.error === 'string' ? row.error : undefined,
    createdAt: String(row.created_at ?? nowIso()),
    updatedAt: String(row.updated_at ?? nowIso()),
  };
}

export class ExecutionAttemptRegistry {
  private readonly memory = new Map<string, ExecutionAttempt>();
  private readonly inFlightByAutomation = new Map<string, string>();

  constructor(private readonly supabase?: AttemptStoreClient) {}

  isInFlight(automationId: string): boolean {
    return this.inFlightByAutomation.has(automationId);
  }

  get(attemptId: string): ExecutionAttempt | undefined {
    return this.memory.get(attemptId);
  }

  getInFlightAttempt(automationId: string): ExecutionAttempt | undefined {
    const attemptId = this.inFlightByAutomation.get(automationId);
    return attemptId ? this.memory.get(attemptId) : undefined;
  }

  /**
   * Atomically claim the right to execute this automation.
   * Returns null when another cycle (or an open persisted attempt without a
   * completed resolution) already owns it.
   */
  async tryClaim(automationId: string): Promise<ExecutionAttempt | null> {
    if (this.inFlightByAutomation.has(automationId)) {
      console.warn(
        `[automation ${automationId}] skip claim: already in-flight (pending/executing)`
      );
      return null;
    }

    // Reserve the slot synchronously so overlapping poll ticks cannot both
    // pass the in-flight check before the first await.
    this.inFlightByAutomation.set(automationId, 'claiming');

    try {
      const open = await this.findOpenAttempt(automationId);
      if (open) {
        this.memory.set(open.id, open);
        this.inFlightByAutomation.set(automationId, open.id);
        console.info(
          `[automation ${automationId}] reattached open attempt ${open.id} status=${open.status}`
        );
        return open;
      }

      const attempt: ExecutionAttempt = {
        id: randomUUID(),
        automationId,
        status: 'pending',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };

      this.memory.set(attempt.id, attempt);
      this.inFlightByAutomation.set(automationId, attempt.id);
      const persisted = await this.persistInsert(attempt);
      if (!persisted) {
        this.memory.delete(attempt.id);
        this.inFlightByAutomation.delete(automationId);
        console.warn(
          `[automation ${automationId}] skip claim: persisted open attempt already exists`
        );
        return null;
      }

      console.info(
        `[automation ${automationId}] state pending (attempt ${attempt.id})`
      );
      return attempt;
    } catch (error) {
      this.inFlightByAutomation.delete(automationId);
      throw error;
    }
  }

  async markExecuting(attemptId: string): Promise<ExecutionAttempt> {
    return this.transition(attemptId, 'executing');
  }

  async markSubmitted(
    attemptId: string,
    transactionHash: string
  ): Promise<ExecutionAttempt> {
    return this.transition(attemptId, 'submitted', { transactionHash });
  }

  async markResolved(
    attemptId: string,
    transactionHash?: string
  ): Promise<ExecutionAttempt> {
    return this.transition(attemptId, 'resolved', { transactionHash });
  }

  async markFailed(attemptId: string, error: string): Promise<ExecutionAttempt> {
    return this.transition(attemptId, 'failed', { error });
  }

  release(automationId: string): void {
    this.inFlightByAutomation.delete(automationId);
  }

  private async transition(
    attemptId: string,
    status: ExecutionAttemptStatus,
    extra: { transactionHash?: string; error?: string } = {}
  ): Promise<ExecutionAttempt> {
    const current = this.memory.get(attemptId);
    if (!current) {
      throw new Error(`Execution attempt not found: ${attemptId}`);
    }

    const next: ExecutionAttempt = {
      ...current,
      status,
      transactionHash: extra.transactionHash ?? current.transactionHash,
      error: extra.error,
      updatedAt: nowIso(),
    };
    this.memory.set(attemptId, next);
    await this.persistUpdate(next);

    const automationId = next.automationId;
    console.info(
      `[automation ${automationId}] state ${status} (attempt ${attemptId})` +
        (next.transactionHash ? ` hash=${next.transactionHash}` : '') +
        (next.error ? ` error=${next.error}` : '')
    );

    return next;
  }

  private async findOpenAttempt(
    automationId: string
  ): Promise<ExecutionAttempt | undefined> {
    for (const attempt of this.memory.values()) {
      if (
        attempt.automationId === automationId &&
        OPEN_STATUSES.includes(attempt.status)
      ) {
        return attempt;
      }
    }

    try {
      const table = this.supabase?.from('automation_execution_attempts');
      if (!table?.select) {
        return undefined;
      }

      const { data, error } = await table
        .select('*')
        .eq('automation_id', automationId)
        .in('status', OPEN_STATUSES)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error || !data || data.length === 0) {
        return undefined;
      }

      return rowToAttempt(data[0]);
    } catch (error) {
      console.warn(
        `[automation ${automationId}] failed to load open attempts:`,
        error
      );
      return undefined;
    }
  }

  private async persistInsert(attempt: ExecutionAttempt): Promise<boolean> {
    try {
      const table = this.supabase?.from('automation_execution_attempts');
      if (!table?.insert) {
        return true;
      }

      const { error } = await table.insert([
        {
          id: attempt.id,
          automation_id: attempt.automationId,
          status: attempt.status,
          transaction_hash: attempt.transactionHash ?? null,
          error: attempt.error ?? null,
          created_at: attempt.createdAt,
          updated_at: attempt.updatedAt,
        },
      ]);

      if (error) {
        console.warn(
          `[automation ${attempt.automationId}] persist insert failed:`,
          error.message
        );
        return false;
      }

      return true;
    } catch (error) {
      console.warn(
        `[automation ${attempt.automationId}] persist insert failed:`,
        error
      );
      return true;
    }
  }

  private async persistUpdate(attempt: ExecutionAttempt): Promise<void> {
    try {
      const table = this.supabase?.from('automation_execution_attempts');
      if (!table?.update) {
        return;
      }

      const builder = table.update({
        status: attempt.status,
        transaction_hash: attempt.transactionHash ?? null,
        error: attempt.error ?? null,
        updated_at: attempt.updatedAt,
      });

      await builder.eq('id', attempt.id);
    } catch (error) {
      console.warn(
        `[automation ${attempt.automationId}] persist update failed:`,
        error
      );
    }
  }
}
