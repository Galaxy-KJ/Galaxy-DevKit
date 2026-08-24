import { Server } from 'socket.io';
import { EventBroadcaster } from '../../services/event-broadcaster';
import {
  AutomationHandler,
  AutomationRuntime,
  ExecutionAttempt,
  StoredAutomation,
} from '../../handlers/automation-handler';

const USER_ID = 'user-1';
const AUTOMATION_ID = 'auto-1';
const REAL_HASH = 'f9a3c1d4e8b7a6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1';

function storedAutomation(
  overrides: Partial<StoredAutomation> = {}
): StoredAutomation {
  return {
    id: AUTOMATION_ID,
    user_id: USER_ID,
    wallet_id: 'wallet-1',
    name: 'XLM stop',
    status: 'active',
    trigger_conditions: {
      type: 'price',
      assetIn: 'XLM',
      assetOut: 'USDC',
      condition: 'below',
      threshold: '0.10',
    },
    action_config: {
      executionType: 'STELLAR_PAYMENT',
      paymentConfig: {
        destination: 'GDEST',
        asset: {},
        amount: '1',
      },
    },
    ...overrides,
  };
}

function createQuery(result: { data: unknown; error: unknown }) {
  const query: Record<string, unknown> = {};
  query.select = jest.fn(() => query);
  query.eq = jest.fn(() => query);
  query.update = jest.fn(() => query);
  query.order = jest.fn(() => query);
  query.single = jest.fn(async () => result);
  query.then = (
    onFulfilled: (value: typeof result) => unknown,
    onRejected?: (reason: unknown) => unknown
  ) => Promise.resolve(result).then(onFulfilled, onRejected);
  return query;
}

function createSupabase(automations: StoredAutomation[]) {
  const query = createQuery({ data: automations, error: null });
  return {
    from: jest.fn(() => query),
    channel: jest.fn(() => ({
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn(),
    })),
    removeAllChannels: jest.fn(),
  };
}

function createRuntime(
  overrides: Partial<AutomationRuntime> = {}
): AutomationRuntime & { claims: string[] } {
  const inFlight = new Set<string>();
  const claims: string[] = [];

  const runtime: AutomationRuntime & { claims: string[] } = {
    claims,
    isInFlight: jest.fn((id: string) => inFlight.has(id)),
    tryBeginExecution: jest.fn(async (id: string) => {
      if (inFlight.has(id)) {
        return null;
      }
      inFlight.add(id);
      claims.push(id);
      const attempt: ExecutionAttempt = {
        id: `attempt-${claims.length}`,
        automationId: id,
        status: 'pending',
      };
      return attempt;
    }),
    completeExecution: jest.fn((id: string) => {
      inFlight.delete(id);
    }),
    confirmExecution: jest.fn(async () => undefined),
    evaluatePersistedAutomation: jest.fn(async () => ({
      met: true,
      triggerType: 'PRICE',
      triggerData: { assetIn: 'XLM' },
    })),
    executePersistedAutomation: jest.fn(async () => ({
      ruleId: AUTOMATION_ID,
      executionId: 'exec-1',
      success: true,
      timestamp: new Date(),
      duration: 12,
      transactionHash: REAL_HASH,
    })),
    ...overrides,
  };

  return runtime;
}

interface TestContext {
  handler: AutomationHandler;
  runtime: ReturnType<typeof createRuntime>;
  emitted: Array<{ target: string; event: { type: string; data: Record<string, unknown> } }>;
}

function createContext(
  automations: StoredAutomation[],
  runtimeOverrides: Partial<AutomationRuntime> = {}
): TestContext {
  const emitted: TestContext['emitted'] = [];
  const runtime = createRuntime(runtimeOverrides);

  const server = {
    on: jest.fn(),
  } as unknown as Server;

  const roomManager = {
    joinRoom: jest.fn(),
    leaveRoom: jest.fn(),
  };

  const eventBroadcaster = {
    broadcastToUser: jest.fn(
      async (userId: string, event: { type: string; data: Record<string, unknown> }) => {
        emitted.push({ target: `user:${userId}`, event });
      }
    ),
    broadcastToRoom: jest.fn(
      async (room: string, event: { type: string; data: Record<string, unknown> }) => {
        emitted.push({ target: room, event });
      }
    ),
  } as unknown as EventBroadcaster;

  const handler = new AutomationHandler(
    server,
    roomManager as never,
    eventBroadcaster,
    {
      supabase: createSupabase(automations) as never,
      runtime,
      startMonitoring: false,
      setupRealtime: false,
    }
  );

  return { handler, runtime, emitted };
}

describe('AutomationHandler poll loop', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('emits triggered then executed with the real hash when the condition is met', async () => {
    const { handler, runtime, emitted } = createContext([storedAutomation()]);

    await handler.checkAutomationTriggers();

    expect(runtime.executePersistedAutomation).toHaveBeenCalledTimes(1);
    expect(runtime.confirmExecution).toHaveBeenCalledTimes(1);

    const types = emitted.map(item => item.event.type);
    expect(types).toEqual([
      'automation:triggered',
      'automation:triggered',
      'automation:executed',
      'automation:executed',
    ]);

    const executed = emitted.find(item => item.event.type === 'automation:executed');
    expect(executed?.event.data.result).toBe('success');
    expect(executed?.event.data.transactionHash).toBe(REAL_HASH);
    expect(executed?.event.data.error).toBeUndefined();
  });

  it('emits no events when the condition is not met', async () => {
    const { handler, runtime, emitted } = createContext([storedAutomation()], {
      evaluatePersistedAutomation: jest.fn(async () => ({
        met: false,
        triggerType: 'PRICE',
        triggerData: { reason: 'below_threshold_not_met' },
      })),
    });

    await handler.checkAutomationTriggers();

    expect(runtime.executePersistedAutomation).not.toHaveBeenCalled();
    expect(emitted).toEqual([]);
  });

  it('emits executed with the real error and no fake hash on failure', async () => {
    const { handler, emitted } = createContext([storedAutomation()], {
      executePersistedAutomation: jest.fn(async () => ({
        ruleId: AUTOMATION_ID,
        executionId: 'exec-fail',
        success: false,
        timestamp: new Date(),
        duration: 8,
        error: new Error('horizon: tx_bad_seq'),
      })),
    });

    await handler.checkAutomationTriggers();

    const executed = emitted.find(item => item.event.type === 'automation:executed');
    expect(executed?.event.data.result).toBe('failed');
    expect(executed?.event.data.transactionHash).toBeUndefined();
    expect(executed?.event.data.error).toBe('horizon: tx_bad_seq');
  });

  it('does not execute the same automation twice when poll cycles overlap', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });

    const { handler, runtime } = createContext([storedAutomation()], {
      executePersistedAutomation: jest.fn(async () => {
        await gate;
        return {
          ruleId: AUTOMATION_ID,
          executionId: 'exec-1',
          success: true,
          timestamp: new Date(),
          duration: 50,
          transactionHash: REAL_HASH,
        };
      }),
    });

    const first = handler.checkAutomationTriggers();
    const second = handler.checkAutomationTriggers();

    release();
    await Promise.all([first, second]);

    expect(runtime.executePersistedAutomation).toHaveBeenCalledTimes(1);
    expect(runtime.tryBeginExecution).toHaveBeenCalledTimes(1);
  });

  it('does not double-execute when two batches run without the poll lock', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    let started = 0;

    const { handler, runtime } = createContext([storedAutomation()], {
      executePersistedAutomation: jest.fn(async () => {
        started += 1;
        await gate;
        return {
          ruleId: AUTOMATION_ID,
          executionId: 'exec-1',
          success: true,
          timestamp: new Date(),
          duration: 50,
          transactionHash: REAL_HASH,
        };
      }),
    });

    const automation = storedAutomation();
    const first = handler.processActiveAutomations([automation]);
    const second = handler.processActiveAutomations([automation]);

    await Promise.resolve();
    release();
    await Promise.all([first, second]);

    expect(started).toBe(1);
    expect(runtime.executePersistedAutomation).toHaveBeenCalledTimes(1);
  });
});
