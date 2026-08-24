/**
 * @fileoverview Unit tests for TriggerEvaluator
 */

import { TriggerEvaluator, parseActionConfig } from '../triggers/trigger-evaluator.js';
import {
  ConditionLogic,
  ConditionOperator,
  ExecutionContext,
  ExecutionType,
} from '../types/automation-types.js';
import type { PriceTriggerLike, VolumeTriggerLike } from '../triggers/trigger-evaluator.js';

function createContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    ruleId: 'auto-1',
    userId: 'user-1',
    timestamp: new Date('2026-08-24T00:00:00.000Z'),
    ...overrides,
  };
}

describe('TriggerEvaluator', () => {
  let priceTrigger: jest.Mocked<PriceTriggerLike>;
  let volumeTrigger: jest.Mocked<VolumeTriggerLike>;
  let evaluator: TriggerEvaluator;

  beforeEach(() => {
    priceTrigger = { evaluate: jest.fn() };
    volumeTrigger = {
      check: jest.fn().mockResolvedValue({
        triggered: false,
        volume24h: 0,
        threshold: 0,
        tradeCount: 0,
        checkedAt: '2026-08-24T00:00:00.000Z',
      }),
    };
    evaluator = new TriggerEvaluator({ priceTrigger, volumeTrigger });
  });

  it('returns false when trigger_conditions are missing', async () => {
    const result = await evaluator.evaluate(null);
    expect(result.met).toBe(false);
    expect(priceTrigger.evaluate).not.toHaveBeenCalled();
  });

  it('evaluates a price trigger via PriceTrigger and returns true when met', async () => {
    priceTrigger.evaluate.mockResolvedValue(true);

    const result = await evaluator.evaluate({
      type: 'price',
      assetIn: 'XLM',
      assetOut: 'USDC',
      condition: 'below',
      threshold: '0.10',
    });

    expect(result.met).toBe(true);
    expect(result.triggerType).toBe('PRICE');
    expect(priceTrigger.evaluate).toHaveBeenCalledWith({
      assetIn: 'XLM',
      assetOut: 'USDC',
      condition: 'below',
      threshold: '0.10',
    });
  });

  it('returns false when price conditions are not met', async () => {
    priceTrigger.evaluate.mockResolvedValue(false);

    const result = await evaluator.evaluate({
      type: 'price',
      assetIn: 'XLM',
      assetOut: 'USDC',
      condition: 'above',
      threshold: '1',
    });

    expect(result.met).toBe(false);
  });

  it('evaluates a volume trigger via VolumeTrigger', async () => {
    volumeTrigger.check.mockResolvedValue({
      triggered: true,
      volume24h: 750000,
      threshold: 500000,
      tradeCount: 12,
      checkedAt: '2026-08-24T00:00:00.000Z',
    });

    const result = await evaluator.evaluate({
      type: 'volume',
      poolId: 'pool-1',
      threshold24h: '500000',
    });

    expect(result.met).toBe(true);
    expect(result.triggerData.volume24h).toBe(750000);
    expect(volumeTrigger.check).toHaveBeenCalledWith({
      poolId: 'pool-1',
      threshold24h: '500000',
    });
  });

  it('never fires event triggers on the poll path', async () => {
    const result = await evaluator.evaluate({
      type: 'event',
      contractId: 'C' + 'A'.repeat(55),
      topics: ['swap'],
    });

    expect(result.met).toBe(false);
    expect(result.triggerData.reason).toBe('event_triggers_are_push_based');
  });

  it('evaluates condition groups deterministically', async () => {
    const result = await evaluator.evaluate(
      {
        logic: ConditionLogic.AND,
        conditions: [
          {
            id: 'c1',
            field: 'marketData.XLM.priceUSD',
            operator: ConditionOperator.LESS_THAN,
            value: 0.2,
          },
        ],
      },
      createContext({
        marketData: { XLM: { priceUSD: 0.1 } },
      })
    );

    expect(result.met).toBe(true);
  });

  it('returns false for a condition group that is not satisfied', async () => {
    const result = await evaluator.evaluate(
      {
        logic: ConditionLogic.AND,
        conditions: [
          {
            id: 'c1',
            field: 'marketData.XLM.priceUSD',
            operator: ConditionOperator.GREATER_THAN,
            value: 1,
          },
        ],
      },
      createContext({
        marketData: { XLM: { priceUSD: 0.1 } },
      })
    );

    expect(result.met).toBe(false);
  });
});

describe('parseActionConfig', () => {
  it('infers STELLAR_PAYMENT from paymentConfig', () => {
    const parsed = parseActionConfig({
      paymentConfig: {
        destination: 'GDEST',
        asset: {},
        amount: '10',
      },
    });

    expect(parsed.executionType).toBe(ExecutionType.STELLAR_PAYMENT);
    expect(parsed.executionConfig.paymentConfig?.amount).toBe('10');
  });

  it('throws when action_config cannot be mapped', () => {
    expect(() => parseActionConfig({})).toThrow('Unable to determine execution type');
  });
});
