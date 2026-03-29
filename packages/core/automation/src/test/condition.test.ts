import { ConditionEvaluator } from '../utils/condition-evaluator.js';
import {
  AnyCondition,
  Condition,
  ConditionGroup,
  ConditionLogic,
  ConditionOperator,
  ExecutionContext,
  PriceTriggerCondition,
} from '../types/automation-types.js';
import { OracleAggregator } from '@galaxy-kj/core-oracles';

describe('ConditionEvaluator', () => {
  let evaluator: ConditionEvaluator;

  beforeEach(() => {
    evaluator = new ConditionEvaluator();
  });

  const createContext = (data: any = {}): ExecutionContext => ({
    ruleId: 'test-rule',
    userId: 'user123',
    timestamp: new Date(),
    marketData: {
      XLM: {
        priceUSD: 0.1,
        volume24h: 5000000,
        priceChange24h: 5.5,
      },
    },
    accountData: {
      xlmBalance: '1000',
      sequence: '123456',
    },
    ...data,
  });

  describe('evaluateCondition', () => {
    it('should evaluate EQUAL operator correctly', async () => {
      const condition: Condition = {
        id: 'cond-1',
        field: 'marketData.XLM.priceUSD',
        operator: ConditionOperator.EQUAL,
        value: 0.1,
      };

      const result = await evaluator.evaluateCondition(condition, createContext());
      expect(result).toBe(true);
    });

    it('should evaluate NOT_EQUAL operator correctly', async () => {
      const condition: Condition = {

        id: 'cond-1',
        field: 'marketData.XLM.priceUSD',
        operator: ConditionOperator.NOT_EQUAL,
        value: 0.15,
      };

      const result = await evaluator.evaluateCondition(condition, createContext());
      expect(result).toBe(true);
    });

    it('should evaluate GREATER_THAN operator correctly', async () => {
      const condition: Condition = {
        id: 'cond-1',
        field: 'marketData.XLM.priceUSD',
        operator: ConditionOperator.GREATER_THAN,
        value: 0.05,
      };

      const result = await evaluator.evaluateCondition(condition, createContext());
      expect(result).toBe(true);
    });

    it('should evaluate LESS_THAN operator correctly', async () => {
      const condition: Condition = {
        id: 'cond-1',
        field: 'marketData.XLM.priceUSD',
        operator: ConditionOperator.LESS_THAN,
        value: 0.15,
      };

      const result = await evaluator.evaluateCondition(condition, createContext());
      expect(result).toBe(true);
    });

    it('should evaluate GREATER_THAN_OR_EQUAL operator correctly', async () => {
      const condition: Condition = {
        id: 'cond-1',
        field: 'marketData.XLM.priceUSD',
        operator: ConditionOperator.GREATER_THAN_OR_EQUAL,
        value: 0.1,
      };

      const result = await evaluator.evaluateCondition(condition, createContext());
      expect(result).toBe(true);
    });

    it('should evaluate LESS_THAN_OR_EQUAL operator correctly', async () => {
      const condition: Condition = {
        id: 'cond-1',
        field: 'marketData.XLM.priceUSD',
        operator: ConditionOperator.LESS_THAN_OR_EQUAL,
        value: 0.1,
      };

      const result = await evaluator.evaluateCondition(condition, createContext());
      expect(result).toBe(true);
    });

    it('should evaluate BETWEEN operator correctly', async () => {
      const condition: Condition = {
        id: 'cond-1',
        field: 'marketData.XLM.priceUSD',
        operator: ConditionOperator.BETWEEN,
        value: 0.05,
        value2: 0.15,
      };

      const result = await evaluator.evaluateCondition(condition, createContext());
      expect(result).toBe(true);
    });

    it('should evaluate NOT_BETWEEN operator correctly', async () => {
      const condition: Condition = {
        id: 'cond-1',
        field: 'marketData.XLM.priceUSD',
        operator: ConditionOperator.NOT_BETWEEN,
        value: 0.15,
        value2: 0.2,
      };

      const result = await evaluator.evaluateCondition(condition, createContext());
      expect(result).toBe(true);
    });

    it('should handle nested object paths', async () => {
      const condition: Condition = {
        id: 'cond-1',
        field: 'marketData.XLM.volume24h',
        operator: ConditionOperator.GREATER_THAN,
        value: 1000000,
      };

      const result = await evaluator.evaluateCondition(condition, createContext());
      expect(result).toBe(true);
    });

    it('should handle string comparisons', async () => {
      const context = createContext({
        customData: { status: 'active' },
      });

      const condition: Condition = {
        id: 'cond-1',
        field: 'customData.status',
        operator: ConditionOperator.EQUAL,
        value: 'active',
      };

      const result = await evaluator.evaluateCondition(condition, context);
      expect(result).toBe(true);
    });

    it('should handle numeric strings', async () => {
      const context = createContext({
        accountData: { xlmBalance: '1000' },
      });

      const condition: Condition = {
        id: 'cond-1',
        field: 'accountData.xlmBalance',
        operator: ConditionOperator.GREATER_THAN,
        value: 500,
      };

      const result = await evaluator.evaluateCondition(condition, context);
      expect(result).toBe(true);
    });

    it('should return false for undefined fields', async () => {
      const condition: Condition = {
        id: 'cond-1',
        field: 'nonExistent.field',
        operator: ConditionOperator.EQUAL,
        value: 100,
      };

      const result = await evaluator.evaluateCondition(condition, createContext());
      expect(result).toBe(false);
    });

    it('should throw error for GT with non-numeric values', async () => {
      const context = createContext({
        customData: { name: 'test' },
      });

      const condition: Condition = {
        id: 'cond-1',
        field: 'customData.name',
        operator: ConditionOperator.GREATER_THAN,
        value: 'other',
      };

      await expect(evaluator.evaluateCondition(condition, context)).rejects.toThrow();
    });
  });

  describe('evaluateConditionGroup', () => {
    it('should evaluate AND logic correctly - all true', async () => {
      const group: ConditionGroup = {
        logic: ConditionLogic.AND,
        conditions: [
          {
            id: 'cond-1',
            field: 'marketData.XLM.priceUSD',
            operator: ConditionOperator.GREATER_THAN,
            value: 0.05,
          },
          {
            id: 'cond-2',
            field: 'marketData.XLM.volume24h',
            operator: ConditionOperator.GREATER_THAN,
            value: 1000000,
          },
        ],
      };

      const result = await evaluator.evaluateConditionGroup(group, createContext());
      expect(result).toBe(true);
    });

    it('should evaluate AND logic correctly - one false', async () => {
      const group: ConditionGroup = {
        logic: ConditionLogic.AND,
        conditions: [
          {
            id: 'cond-1',
            field: 'marketData.XLM.priceUSD',
            operator: ConditionOperator.GREATER_THAN,
            value: 0.05,
          },
          {
            id: 'cond-2',
            field: 'marketData.XLM.priceUSD',
            operator: ConditionOperator.LESS_THAN,
            value: 0.05,
          },
        ],
      };

      const result = await evaluator.evaluateConditionGroup(group, createContext());
      expect(result).toBe(false);
    });

    it('should evaluate OR logic correctly - one true', async () => {
      const group: ConditionGroup = {
        logic: ConditionLogic.OR,
        conditions: [
          {
            id: 'cond-1',
            field: 'marketData.XLM.priceUSD',
            operator: ConditionOperator.LESS_THAN,
            value: 0.05,
          },
          {
            id: 'cond-2',
            field: 'marketData.XLM.volume24h',
            operator: ConditionOperator.GREATER_THAN,
            value: 1000000,
          },
        ],
      };

      const result = await evaluator.evaluateConditionGroup(group, createContext());
      expect(result).toBe(true);
    });

    it('should evaluate OR logic correctly - all false', async () => {
      const group: ConditionGroup = {
        logic: ConditionLogic.OR,
        conditions: [
          {
            id: 'cond-1',
            field: 'marketData.XLM.priceUSD',
            operator: ConditionOperator.LESS_THAN,
            value: 0.05,
          },
          {
            id: 'cond-2',
            field: 'marketData.XLM.priceUSD',
            operator: ConditionOperator.GREATER_THAN,
            value: 0.2,
          },
        ],
      };

      const result = await evaluator.evaluateConditionGroup(group, createContext());
      expect(result).toBe(false);
    });

    it('should evaluate nested groups with AND logic', async () => {
      const group: ConditionGroup = {
        logic: ConditionLogic.AND,
        conditions: [
          {
            id: 'cond-1',
            field: 'marketData.XLM.priceUSD',
            operator: ConditionOperator.GREATER_THAN,
            value: 0.05,
          },
        ],
        groups: [
          {
            logic: ConditionLogic.OR,
            conditions: [
              {
                id: 'cond-2',
                field: 'marketData.XLM.volume24h',
                operator: ConditionOperator.GREATER_THAN,
                value: 10000000,
              },
              {
                id: 'cond-3',
                field: 'marketData.XLM.priceChange24h',
                operator: ConditionOperator.GREATER_THAN,
                value: 5,
              },
            ],
          },
        ],
      };

      const result = await evaluator.evaluateConditionGroup(group, createContext());
      expect(result).toBe(true);
    });

    it('should evaluate nested groups with OR logic', async () => {
      const group: ConditionGroup = {
        logic: ConditionLogic.OR,
        conditions: [
          {
            id: 'cond-1',
            field: 'marketData.XLM.priceUSD',
            operator: ConditionOperator.LESS_THAN,
            value: 0.05,
          },
        ],
        groups: [
          {
            logic: ConditionLogic.AND,
            conditions: [
              {
                id: 'cond-2',
                field: 'marketData.XLM.volume24h',
                operator: ConditionOperator.GREATER_THAN,
                value: 1000000,
              },
              {
                id: 'cond-3',
                field: 'marketData.XLM.priceChange24h',
                operator: ConditionOperator.GREATER_THAN,
                value: 5,
              },
            ],
          },
        ],
      };

      const result = await evaluator.evaluateConditionGroup(group, createContext());
      expect(result).toBe(true);
    });
  });

  describe('validateCondition', () => {
    it('should validate a correct condition', () => {
      const condition: Condition = {
        id: 'cond-1',
        field: 'marketData.XLM.priceUSD',
        operator: ConditionOperator.GREATER_THAN,
        value: 0.1,
      };

      const result = evaluator.validateCondition(condition);
      expect(result.valid).toBe(true);
    });

    it('should reject condition without field', () => {
      const condition: any = {
        id: 'cond-1',
        operator: ConditionOperator.GREATER_THAN,
        value: 0.1,
      };

      const result = evaluator.validateCondition(condition);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('field');
    });

    it('should reject condition without operator', () => {
      const condition: any = {
        id: 'cond-1',
        field: 'marketData.XLM.priceUSD',
        value: 0.1,
      };

      const result = evaluator.validateCondition(condition);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('operator');
    });

    it('should reject condition without value', () => {
      const condition: any = {
        id: 'cond-1',
        field: 'marketData.XLM.priceUSD',
        operator: ConditionOperator.GREATER_THAN,
      };

      const result = evaluator.validateCondition(condition);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('value');
    });

    it('should reject BETWEEN without value2', () => {
      const condition: Condition = {
        id: 'cond-1',
        field: 'marketData.XLM.priceUSD',
        operator: ConditionOperator.BETWEEN,
        value: 0.05,
      };

      const result = evaluator.validateCondition(condition);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('value2');
    });
  });

  describe('validateConditionGroup', () => {
    it('should validate a correct condition group', () => {
      const group: ConditionGroup = {
        logic: ConditionLogic.AND,
        conditions: [
          {
            id: 'cond-1',
            field: 'marketData.XLM.priceUSD',
            operator: ConditionOperator.GREATER_THAN,
            value: 0.1,
          },
        ],
      };

      const result = evaluator.validateConditionGroup(group);
      expect(result.valid).toBe(true);
    });

    it('should reject group without logic', () => {
      const group: any = {
        conditions: [
          {
            id: 'cond-1',
            field: 'marketData.XLM.priceUSD',
            operator: ConditionOperator.GREATER_THAN,
            value: 0.1,
          },
        ],
      };

      const result = evaluator.validateConditionGroup(group);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('logic');
    });

    it('should reject group without conditions or nested groups', () => {
      const group: ConditionGroup = {
        logic: ConditionLogic.AND,
        conditions: [],
      };

      const result = evaluator.validateConditionGroup(group);
      expect(result.valid).toBe(false);
    });

    it('should validate nested groups', () => {
      const group: ConditionGroup = {
        logic: ConditionLogic.AND,
        conditions: [],
        groups: [
          {
            logic: ConditionLogic.OR,
            conditions: [
              {
                id: 'cond-1',
                field: 'marketData.XLM.priceUSD',
                operator: ConditionOperator.GREATER_THAN,
                value: 0.1,
              },
            ],
          },
        ],
      };

      const result = evaluator.validateConditionGroup(group);
      expect(result.valid).toBe(true);
    });

    it('should reject group with invalid nested condition', () => {
      const group: ConditionGroup = {
        logic: ConditionLogic.AND,
        conditions: [],
        groups: [
          {
            logic: ConditionLogic.OR,
            conditions: [
              {
                id: 'cond-1',
                field: '',
                operator: ConditionOperator.GREATER_THAN,
                value: 0.1,
              },
            ],
          },
        ],
      };

      const result = evaluator.validateConditionGroup(group);
      expect(result.valid).toBe(false);
    });
  });

  describe('testConditions', () => {
    it('should test conditions and return details', async () => {
      const group: ConditionGroup = {
        logic: ConditionLogic.AND,
        conditions: [
          {
            id: 'cond-1',
            field: 'marketData.XLM.priceUSD',
            operator: ConditionOperator.GREATER_THAN,
            value: 0.05,
          },
          {
            id: 'cond-2',
            field: 'marketData.XLM.volume24h',
            operator: ConditionOperator.GREATER_THAN,
            value: 1000000,
          },
        ],
      };

      const result = await evaluator.testConditions(group, createContext());

      expect(result.result).toBe(true);
      expect(result.details).toHaveLength(2);
      expect(result.details[0].result).toBe(true);
      expect(result.details[0].actualValue).toBe(0.1);
      expect(result.details[1].result).toBe(true);
      expect(result.details[1].actualValue).toBe(5000000);
    });

    it('should show failed condition details', async () => {
      const group: ConditionGroup = {
        logic: ConditionLogic.AND,
        conditions: [
          {
            id: 'cond-1',
            field: 'marketData.XLM.priceUSD',
            operator: ConditionOperator.LESS_THAN,
            value: 0.05,
          },
        ],
      };

      const result = await evaluator.testConditions(group, createContext());

      expect(result.result).toBe(false);
      expect(result.details[0].result).toBe(false);
    });
  });

  describe('price trigger conditions', () => {
    let mockOracle: jest.Mocked<Pick<OracleAggregator, 'getAggregatedPrice'>>;
    let priceEvaluator: ConditionEvaluator;

    beforeEach(() => {
      mockOracle = {
        getAggregatedPrice: jest.fn(),
      };
      priceEvaluator = new ConditionEvaluator(
        mockOracle as unknown as OracleAggregator
      );
    });

    const makePriceCond = (
      operator: ConditionOperator,
      threshold: number
    ): PriceTriggerCondition => ({
      type: 'price',
      id: 'price-cond-1',
      asset: 'XLM',
      operator,
      threshold,
    });

    const mockPrice = (price: number) => {
      mockOracle.getAggregatedPrice.mockResolvedValue({
        symbol: 'XLM',
        price,
        timestamp: new Date(),
        confidence: 0.95,
        sourcesUsed: ['coingecko'],
        outliersFiltered: [],
        sourceCount: 1,
      });
    };

    it('GT: price above threshold returns true', async () => {
      mockPrice(0.20);
      const cond = makePriceCond(ConditionOperator.GREATER_THAN, 0.15);
      const result = await priceEvaluator.evaluateCondition(cond, createContext());
      expect(result).toBe(true);
    });

    it('GT: price below threshold returns false', async () => {
      mockPrice(0.10);
      const cond = makePriceCond(ConditionOperator.GREATER_THAN, 0.15);
      const result = await priceEvaluator.evaluateCondition(cond, createContext());
      expect(result).toBe(false);
    });

    it('LT: price below threshold returns true', async () => {
      mockPrice(0.10);
      const cond = makePriceCond(ConditionOperator.LESS_THAN, 0.15);
      const result = await priceEvaluator.evaluateCondition(cond, createContext());
      expect(result).toBe(true);
    });

    it('LT: price above threshold returns false', async () => {
      mockPrice(0.20);
      const cond = makePriceCond(ConditionOperator.LESS_THAN, 0.15);
      const result = await priceEvaluator.evaluateCondition(cond, createContext());
      expect(result).toBe(false);
    });

    it('GTE: price equal to threshold returns true (boundary)', async () => {
      mockPrice(0.15);
      const cond = makePriceCond(ConditionOperator.GREATER_THAN_OR_EQUAL, 0.15);
      const result = await priceEvaluator.evaluateCondition(cond, createContext());
      expect(result).toBe(true);
    });

    it('LTE: price equal to threshold returns true (boundary)', async () => {
      mockPrice(0.15);
      const cond = makePriceCond(ConditionOperator.LESS_THAN_OR_EQUAL, 0.15);
      const result = await priceEvaluator.evaluateCondition(cond, createContext());
      expect(result).toBe(true);
    });

    it('throws when no oracle is configured', async () => {
      const noOracleEvaluator = new ConditionEvaluator();
      const cond = makePriceCond(ConditionOperator.GREATER_THAN, 0.15);
      await expect(
        noOracleEvaluator.evaluateCondition(cond, createContext())
      ).rejects.toThrow('Oracle not configured');
    });

    it('propagates oracle fetch errors', async () => {
      mockOracle.getAggregatedPrice.mockRejectedValue(
        new Error('Oracle unavailable')
      );
      const cond = makePriceCond(ConditionOperator.GREATER_THAN, 0.15);
      await expect(
        priceEvaluator.evaluateCondition(cond, createContext())
      ).rejects.toThrow('Oracle unavailable');
    });

    it('price condition in AND group with regular condition — both must pass', async () => {
      mockPrice(0.20);
      const group: ConditionGroup = {
        logic: ConditionLogic.AND,
        conditions: [
          makePriceCond(ConditionOperator.GREATER_THAN, 0.15),
          {
            id: 'cond-regular',
            field: 'marketData.XLM.volume24h',
            operator: ConditionOperator.GREATER_THAN,
            value: 1000000,
          },
        ],
      };

      const result = await priceEvaluator.evaluateConditionGroup(
        group,
        createContext()
      );
      expect(result).toBe(true);
    });

    it('AND group fails when price condition is false even if regular condition passes', async () => {
      mockPrice(0.10);
      const group: ConditionGroup = {
        logic: ConditionLogic.AND,
        conditions: [
          makePriceCond(ConditionOperator.GREATER_THAN, 0.15),
          {
            id: 'cond-regular',
            field: 'marketData.XLM.volume24h',
            operator: ConditionOperator.GREATER_THAN,
            value: 1000000,
          },
        ],
      };

      const result = await priceEvaluator.evaluateConditionGroup(
        group,
        createContext()
      );
      expect(result).toBe(false);
    });

    it('validates a well-formed PriceTriggerCondition', () => {
      const cond = makePriceCond(ConditionOperator.GREATER_THAN, 0.15);
      const result = priceEvaluator.validateCondition(cond);
      expect(result.valid).toBe(true);
    });

    it('rejects PriceTriggerCondition missing asset', () => {
      const cond: any = {
        type: 'price',
        id: 'pc',
        asset: '',
        operator: ConditionOperator.GREATER_THAN,
        threshold: 0.15,
      };
      const result = priceEvaluator.validateCondition(cond);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('asset');
    });
  });
});
