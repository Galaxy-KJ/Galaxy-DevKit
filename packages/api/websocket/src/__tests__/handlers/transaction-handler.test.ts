import { Server } from 'socket.io';
import { EventBroadcaster } from '../../services/event-broadcaster';
import { TransactionHandler } from '../../handlers/transaction-handler';

describe('TransactionHandler stats', () => {
  it('reports pending transactions counted from the transaction store', async () => {
    const query: Record<string, unknown> = {};
    query.select = jest.fn(() => query);
    query.eq = jest.fn(() => query);
    query.then = (
      onFulfilled: (value: { count: number; error: null }) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => Promise.resolve({ count: 2, error: null }).then(onFulfilled, onRejected);

    const supabase = {
      from: jest.fn(() => query),
    };
    const server = { on: jest.fn() } as unknown as Server;
    const handler = new TransactionHandler(
      server,
      {} as never,
      {} as EventBroadcaster,
      { supabase: supabase as never, setupRealtime: false }
    );

    await expect(handler.getTransactionStats()).resolves.toEqual({
      totalSubscriptions: 0,
      activeTransactions: 2,
    });
    expect(supabase.from).toHaveBeenCalledWith('transactions');
    expect(query.eq).toHaveBeenCalledWith('status', 'pending');
  });
});

describe('TransactionHandler event IDs', () => {
  const UUID_V4 =
    '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

  type ChangeHandler = {
    handleTransactionChange(payload: unknown): Promise<void>;
  };

  const createHandler = () => {
    const broadcaster = {
      broadcastToUser: jest.fn().mockResolvedValue(undefined),
      broadcastToRoom: jest.fn().mockResolvedValue(undefined),
    };
    const server = { on: jest.fn() } as unknown as Server;
    const handler = new TransactionHandler(
      server,
      {} as never,
      broadcaster as unknown as EventBroadcaster,
      { supabase: {} as never, setupRealtime: false }
    );

    return {
      broadcaster,
      change: (payload: unknown) =>
        (handler as unknown as ChangeHandler).handleTransactionChange(payload),
    };
  };

  const record = (status: string) => ({
    status,
    user_id: 'user-1',
    wallet_id: 'wallet-1',
    hash: 'hash-1',
  });

  it.each([
    ['pending', 'INSERT', 'transaction-pending'],
    ['confirmed', 'UPDATE', 'transaction-confirmed'],
    ['failed', 'UPDATE', 'transaction-failed'],
  ])('uses a UUID in the %s event ID', async (status, eventType, prefix) => {
    const { broadcaster, change } = createHandler();

    await change({ eventType, new: record(status) });

    const [, event] = broadcaster.broadcastToUser.mock.calls[0] as [
      string,
      { id: string },
    ];
    expect(event.id).toMatch(new RegExp(`^${prefix}-${UUID_V4}$`));
  });

  it('generates a distinct event ID for each change', async () => {
    const { broadcaster, change } = createHandler();

    for (let i = 0; i < 100; i++) {
      await change({ eventType: 'INSERT', new: record('pending') });
    }

    const ids = broadcaster.broadcastToUser.mock.calls.map(
      ([, event]: [string, { id: string }]) => event.id
    );
    expect(new Set(ids).size).toBe(100);
  });
});
