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
