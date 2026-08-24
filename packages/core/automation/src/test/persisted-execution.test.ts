/**
 * @fileoverview Persisted evaluate + execute tests for AutomationService
 */

jest.mock('@galaxy-kj/core-stellar-sdk', () => ({
  supabaseClient: {
    from: jest.fn().mockReturnValue({
      insert: jest.fn().mockResolvedValue({ error: null }),
    }),
  },
}));

jest.mock('@galaxy-kj/core-oracles', () => ({
  OracleAggregator: class OracleAggregator {},
}));

import { AutomationService } from '../services/automation.service.js';
import { ExecutionAttemptRegistry } from '../services/execution-attempt-registry.js';
import { TriggerEvaluator } from '../triggers/trigger-evaluator.js';
import { ExecutionEngine } from '../utils/execution-engine.js';
import { CronManager } from '../utils/cron-manager.js';
import { ConditionEvaluator } from '../utils/condition-evaluator.js';
import {
  StoredAutomation,
  StellarNetwork,
} from '../types/automation-types.js';

jest.mock('../utils/cron-manager');
jest.mock('../utils/condition-evaluator');
jest.mock('../utils/execution-engine');

const testNetwork: StellarNetwork = {
  type: 'TESTNET',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
};

function storedAutomation(
  overrides: Partial<StoredAutomation> = {}
): StoredAutomation {
  return {
    id: 'auto-1',
    user_id: 'user-1',
    wallet_id: 'wallet-1',
    name: 'Price swap',
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
        destination: 'GDESTINATION',
        asset: {},
        amount: '5',
      },
    },
    ...overrides,
  };
}

describe('AutomationService persisted evaluate/execute', () => {
  let mockExecutionEngine: jest.Mocked<ExecutionEngine>;
  let priceEvaluate: jest.Mock;
  let service: AutomationService;
  let registry: ExecutionAttemptRegistry;

  beforeEach(() => {
    jest.clearAllMocks();

    (CronManager as jest.MockedClass<typeof CronManager>).mockImplementation(
      () =>
        ({
          scheduleJob: jest.fn(),
          startJob: jest.fn(),
          stopJob: jest.fn(),
          removeJob: jest.fn(),
          validateExpression: jest.fn().mockReturnValue(true),
          destroy: jest.fn(),
        }) as unknown as CronManager
    );

    (
      ConditionEvaluator as jest.MockedClass<typeof ConditionEvaluator>
    ).mockImplementation(
      () =>
        ({
          evaluateConditionGroup: jest.fn().mockResolvedValue(true),
          validateConditionGroup: jest.fn().mockReturnValue({ valid: true }),
        }) as unknown as ConditionEvaluator
    );

    mockExecutionEngine = {
      execute: jest.fn().mockResolvedValue({
        ruleId: 'auto-1',
        executionId: 'exec-1',
        success: true,
        timestamp: new Date(),
        duration: 25,
        transactionHash: 'real-horizon-hash',
        result: { hash: 'real-horizon-hash' },
      }),
      updateNetwork: jest.fn(),
      getAccountInfo: jest.fn(),
      getStatus: jest.fn(),
    } as unknown as jest.Mocked<ExecutionEngine>;

    (ExecutionEngine as jest.MockedClass<typeof ExecutionEngine>).mockImplementation(
      () => mockExecutionEngine
    );

    priceEvaluate = jest.fn().mockResolvedValue(true);
    registry = new ExecutionAttemptRegistry();

    service = new AutomationService({
      network: testNetwork,
      sourceSecret: 'SSECRET',
      attemptRegistry: registry,
      triggerEvaluator: new TriggerEvaluator({
        priceTrigger: { evaluate: priceEvaluate },
      }),
    });
  });

  afterEach(async () => {
    await service.shutdown();
  });

  it('evaluatePersistedAutomation is deterministic and uses PriceTrigger', async () => {
    const met = await service.evaluatePersistedAutomation(storedAutomation());
    expect(met.met).toBe(true);
    expect(priceEvaluate).toHaveBeenCalledTimes(1);

    priceEvaluate.mockResolvedValue(false);
    const unmet = await service.evaluatePersistedAutomation(storedAutomation());
    expect(unmet.met).toBe(false);
  });

  it('executePersistedAutomation returns the real transaction hash', async () => {
    const attempt = await service.tryBeginExecution('auto-1');
    const result = await service.executePersistedAutomation(
      storedAutomation(),
      attempt!.id
    );

    expect(result.success).toBe(true);
    expect(result.transactionHash).toBe('real-horizon-hash');
    expect(mockExecutionEngine.execute).toHaveBeenCalledTimes(1);
    expect(registry.get(attempt!.id)?.status).toBe('submitted');
  });

  it('does not submit again when an attempt already has a hash', async () => {
    const attempt = await service.tryBeginExecution('auto-1');
    await registry.markSubmitted(attempt!.id, 'already-sent-hash');

    const result = await service.executePersistedAutomation(
      storedAutomation(),
      attempt!.id
    );

    expect(result.transactionHash).toBe('already-sent-hash');
    expect(mockExecutionEngine.execute).not.toHaveBeenCalled();
    expect(registry.get(attempt!.id)?.status).toBe('submitted');

    await service.confirmExecution(attempt!.id, result.transactionHash);
    expect(registry.get(attempt!.id)?.status).toBe('resolved');
  });

  it('returns the real engine error without a fake hash', async () => {
    mockExecutionEngine.execute.mockResolvedValue({
      ruleId: 'auto-1',
      executionId: 'exec-fail',
      success: false,
      timestamp: new Date(),
      duration: 10,
      error: new Error('horizon: op_underfunded'),
    });

    const attempt = await service.tryBeginExecution('auto-1');
    const result = await service.executePersistedAutomation(
      storedAutomation(),
      attempt!.id
    );

    expect(result.success).toBe(false);
    expect(result.transactionHash).toBeUndefined();
    expect(result.error?.message).toBe('horizon: op_underfunded');
  });

  it('rejects a second in-flight claim for the same automation', async () => {
    const first = await service.tryBeginExecution('auto-1');
    const second = await service.tryBeginExecution('auto-1');

    expect(first).not.toBeNull();
    expect(second).toBeNull();
  });
});
