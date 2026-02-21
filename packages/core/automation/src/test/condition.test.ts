import { ConditionEvaluator } from '../utils/condition-evaluator.js';
import {
  Condition,
  ConditionGroup,
  ConditionOperator,
  ConditionLogic,
  ExecutionContext,
} from '../types/automation-types.js';

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
    it('should evaluate EQUAL operator correctly', () => {
      const condition: Condition = {
        id: 'cond-1',
        field: 'marketData.XLM.priceUSD',
        operator: ConditionOperator.EQUAL,
        value: 0.1,
      };

      const result = evaluator.evaluateCondition(condition, createContext());
      expect(result).toBe(true);
    });

    it('should evaluate NOT_EQUAL operator correctly', () => {
      const condition: Condition = {
          
        id: 'cond-1',
        field: 'marketData.XLM.priceUSD',
        operator: ConditionOperator.NOT_EQUAL,
        value: 0.15,
      };

      const result = evaluator.evaluateCondition(condition, createContext());
      expect(result).toBe(true);
    });

    it('should evaluate GREATER_THAN operator correctly', () => {
      const condition: Condition = {
        id: 'cond-1',
        field: 'marketData.XLM.priceUSD',
        operator: ConditionOperator.GREATER_THAN,
        value: 0.05,
      };

      const result = evaluator.evaluateCondition(condition, createContext());
      expect(result).toBe(true);
    });

    it('should evaluate LESS_THAN operator correctly', () => {
      const condition: Condition = {
        id: 'cond-1',
        field: 'marketData.XLM.priceUSD',
        operator: ConditionOperator.LESS_THAN,
        value: 0.15,
      };

      const result = evaluator.evaluateCondition(condition, createContext());
      expect(result).toBe(true);
    });

    it('should evaluate GREATER_THAN_OR_EQUAL operator correctly', () => {
      const condition: Condition = {
        id: 'cond-1',
        field: 'marketData.XLM.priceUSD',
        operator: ConditionOperator.GREATER_THAN_OR_EQUAL,
        value: 0.1,
      };

      const result = evaluator.evaluateCondition(condition, createContext());
      expect(result).toBe(true);
    });

    it('should evaluate LESS_THAN_OR_EQUAL operator correctly', () => {
      const condition: Condition = {
        id: 'cond-1',
        field: 'marketData.XLM.priceUSD',
        operator: ConditionOperator.LESS_THAN_OR_EQUAL,
        value: 0.1,
      };

      const result = evaluator.evaluateCondition(condition, createContext());
      expect(result).toBe(true);
    });

    it('should evaluate BETWEEN operator correctly', () => {
      const condition: Condition = {
        id: 'cond-1',
        field: 'marketData.XLM.priceUSD',
        operator: ConditionOperator.BETWEEN,
        value: 0.05,
        value2: 0.15,
      };

      const result = evaluator.evaluateCondition(condition, createContext());
      expect(result).toBe(true);
    });

    it('should evaluate NOT_BETWEEN operator correctly', () => {
      const condition: Condition = {
        id: 'cond-1',
        field: 'marketData.XLM.priceUSD',
        operator: ConditionOperator.NOT_BETWEEN,
        value: 0.15,
        value2: 0.2,
      };

      const result = evaluator.evaluateCondition(condition, createContext());
      expect(result).toBe(true);
    });

    it('should handle nested object paths', () => {
      const condition: Condition = {
        id: 'cond-1',
        field: 'marketData.XLM.volume24h',
        operator: ConditionOperator.GREATER_THAN,
        value: 1000000,
      };

      const result = evaluator.evaluateCondition(condition, createContext());
      expect(result).toBe(true);
    });

    it('should handle string comparisons', () => {
      const context = createContext({
        customData: { status: 'active' },
      });

      const condition: Condition = {
        id: 'cond-1',
        field: 'customData.status',
        operator: ConditionOperator.EQUAL,
        value: 'active',
      };

      const result = evaluator.evaluateCondition(condition, context);
      expect(result).toBe(true);
    });

    it('should handle numeric strings', () => {
      const context = createContext({
        accountData: { xlmBalance: '1000' },
      });

      const condition: Condition = {
        id: 'cond-1',
        field: 'accountData.xlmBalance',
        operator: ConditionOperator.GREATER_THAN,
        value: 500,
      };

      const result = evaluator.evaluateCondition(condition, context);
      expect(result).toBe(true);
    });

    it('should return false for undefined fields', () => {
      const condition: Condition = {
        id: 'cond-1',
        field: 'nonExistent.field',
        operator: ConditionOperator.EQUAL,
        value: 100,
      };

      const result = evaluator.evaluateCondition(condition, createContext());
      expect(result).toBe(false);
    });

    it('should throw error for GT with non-numeric values', () => {
      const context = createContext({
        customData: { name: 'test' },
      });

      const condition: Condition = {
        id: 'cond-1',
        field: 'customData.name',
        operator: ConditionOperator.GREATER_THAN,
        value: 'other',
      };

      expect(() => evaluator.evaluateCondition(condition, context)).toThrow();
    });
  });

  describe('evaluateConditionGroup', () => {
    it('should evaluate AND logic correctly - all true', () => {
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

      const result = evaluator.evaluateConditionGroup(group, createContext());
      expect(result).toBe(true);
    });

    it('should evaluate AND logic correctly - one false', () => {
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

      const result = evaluator.evaluateConditionGroup(group, createContext());
      expect(result).toBe(false);
    });

    it('should evaluate OR logic correctly - one true', () => {
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

      const result = evaluator.evaluateConditionGroup(group, createContext());
      expect(result).toBe(true);
    });

    it('should evaluate OR logic correctly - all false', () => {
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

      const result = evaluator.evaluateConditionGroup(group, createContext());
      expect(result).toBe(false);
    });

    it('should evaluate nested groups with AND logic', () => {
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

      const result = evaluator.evaluateConditionGroup(group, createContext());
      expect(result).toBe(true);
    });

    it('should evaluate nested groups with OR logic', () => {
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

      const result = evaluator.evaluateConditionGroup(group, createContext());
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
    it('should test conditions and return details', () => {
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

      const result = evaluator.testConditions(group, createContext());

      expect(result.result).toBe(true);
      expect(result.details).toHaveLength(2);
      expect(result.details[0].result).toBe(true);
      expect(result.details[0].actualValue).toBe(0.1);
      expect(result.details[1].result).toBe(true);
      expect(result.details[1].actualValue).toBe(5000000);
    });

    it('should show failed condition details', () => {
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

      const result = evaluator.testConditions(group, createContext());

      expect(result.result).toBe(false);
      expect(result.details[0].result).toBe(false);
    });
  });
});
