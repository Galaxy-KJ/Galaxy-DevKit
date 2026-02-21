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

export class ConditionEvaluator {
  private oracle?: OracleAggregator;

  constructor(oracle?: OracleAggregator) {
    this.oracle = oracle;
  }

  async evaluateConditionGroup(
    group: ConditionGroup,
    context: ExecutionContext
  ): Promise<boolean> {
    const conditionResults = await Promise.all(
      group.conditions.map(condition =>
        this.evaluateCondition(condition, context)
      )
    );

    const nestedResults = await Promise.all(
      (group.groups || []).map(nestedGroup =>
        this.evaluateConditionGroup(nestedGroup, context)
      )
    );

    const allResults = [...conditionResults, ...nestedResults];

    if (group.logic === ConditionLogic.AND) {
      return allResults.every(result => result === true);
    } else {
      return allResults.some(result => result === true);
    }
  }

  /**
   * Evaluate a single condition (Condition or PriceTriggerCondition)
   */
  async evaluateCondition(
    condition: AnyCondition,
    context: ExecutionContext
  ): Promise<boolean> {
    if (this.isPriceCondition(condition)) {
      return this.evaluatePriceCondition(condition);
    }

    const actualValue = this.resolveValue(condition.field, context);

    if (actualValue === undefined || actualValue === null) {
      console.warn(`Field ${condition.field} not found in context`);
      return false;
    }

    return this.compareValues(
      actualValue,
      condition.operator,
      condition.value,
      condition.value2
    );
  }

  /**
   * Type guard for PriceTriggerCondition
   */
  private isPriceCondition(c: AnyCondition): c is PriceTriggerCondition {
    return (c as PriceTriggerCondition).type === 'price';
  }

  /**
   * Evaluate a price trigger condition via the oracle
   */
  private async evaluatePriceCondition(
    condition: PriceTriggerCondition
  ): Promise<boolean> {
    if (!this.oracle) {
      throw new Error('Oracle not configured for price trigger conditions');
    }

    const aggregated = await this.oracle.getAggregatedPrice(condition.asset);
    const price = aggregated.price;

    switch (condition.operator) {
      case ConditionOperator.GREATER_THAN:
        return price > condition.threshold;
      case ConditionOperator.LESS_THAN:
        return price < condition.threshold;
      case ConditionOperator.GREATER_THAN_OR_EQUAL:
        return price >= condition.threshold;
      case ConditionOperator.LESS_THAN_OR_EQUAL:
        return price <= condition.threshold;
      default:
        throw new Error(
          `Operator ${condition.operator} is not supported for price trigger conditions`
        );
    }
  }

  /**
   * Resolve value from context based on field path
   */
  private resolveValue(field: string, context: ExecutionContext): any {
    const parts = field.split('.');
    let value: any = context;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return undefined;
      }
    }

    return value;
  }

  /**
   * Compare values based on operator
   */
  private compareValues(
    actualValue: any,
    operator: ConditionOperator,
    expectedValue: any,
    expectedValue2?: any
  ): boolean {

    const numActual = this.toNumber(actualValue);
    const numExpected = this.toNumber(expectedValue);
    const numExpected2 = expectedValue2
      ? this.toNumber(expectedValue2)
      : undefined;

    const useNumeric = numActual !== null && numExpected !== null;

    switch (operator) {
      case ConditionOperator.EQUAL:
        return useNumeric
          ? numActual === numExpected
          : actualValue === expectedValue;

      case ConditionOperator.NOT_EQUAL:
        return useNumeric
          ? numActual !== numExpected
          : actualValue !== expectedValue;

      case ConditionOperator.GREATER_THAN:
        if (!useNumeric) {
          throw new Error('Cannot use GT operator with non-numeric values');
        }
        return numActual! > numExpected!;

      case ConditionOperator.LESS_THAN:
        if (!useNumeric) {
          throw new Error('Cannot use LT operator with non-numeric values');
        }
        return numActual! < numExpected!;

      case ConditionOperator.GREATER_THAN_OR_EQUAL:
        if (!useNumeric) {
          throw new Error('Cannot use GTE operator with non-numeric values');
        }
        return numActual! >= numExpected!;

      case ConditionOperator.LESS_THAN_OR_EQUAL:
        if (!useNumeric) {
          throw new Error('Cannot use LTE operator with non-numeric values');
        }
        return numActual! <= numExpected!;

      case ConditionOperator.BETWEEN:
        if (!useNumeric || numExpected2 === null) {
          throw new Error('BETWEEN operator requires numeric values');
        }
        return numActual! >= numExpected! && numActual! <= numExpected2!;

      case ConditionOperator.NOT_BETWEEN:
        if (!useNumeric || numExpected2 === null) {
          throw new Error('NOT_BETWEEN operator requires numeric values');
        }
        return numActual! < numExpected! || numActual! > numExpected2!;

      default:
        throw new Error(`Unknown operator: ${operator}`);
    }
  }

  /**
   * Convert value to number if possible
   */
  private toNumber(value: any): number | null {
    if (typeof value === 'number') {
      return value;
    }

    if (typeof value === 'string') {
      const num = parseFloat(value);
      return isNaN(num) ? null : num;
    }

    return null;
  }

  /**
   * Validate condition structure
   */
  validateCondition(condition: AnyCondition): { valid: boolean; error?: string } {
    if (this.isPriceCondition(condition)) {
      if (!condition.asset || typeof condition.asset !== 'string') {
        return { valid: false, error: 'Price condition must have a valid asset' };
      }
      if (!condition.operator) {
        return { valid: false, error: 'Condition must have an operator' };
      }
      if (condition.threshold === undefined || condition.threshold === null) {
        return { valid: false, error: 'Price condition must have a threshold value' };
      }
      return { valid: true };
    }

    if (!condition.field || typeof condition.field !== 'string') {
      return { valid: false, error: 'Condition must have a valid field' };
    }

    if (!condition.operator) {
      return { valid: false, error: 'Condition must have an operator' };
    }

    if (condition.value === undefined || condition.value === null) {
      return { valid: false, error: 'Condition must have a value' };
    }

    // Validate BETWEEN operations
    if (
      (condition.operator === ConditionOperator.BETWEEN ||
        condition.operator === ConditionOperator.NOT_BETWEEN) &&
      (condition.value2 === undefined || condition.value2 === null)
    ) {
      return {
        valid: false,
        error: 'BETWEEN operations require value2',
      };
    }

    return { valid: true };
  }

  /**
   * Validate condition group
   */
  validateConditionGroup(group: ConditionGroup): {
    valid: boolean;
    error?: string;
  } {
    if (!group.logic) {
      return { valid: false, error: 'Condition group must have logic' };
    }

    if (!group.conditions || group.conditions.length === 0) {
      if (!group.groups || group.groups.length === 0) {
        return {
          valid: false,
          error:
            'Condition group must have at least one condition or nested group',
        };
      }
    }

    // Validate all conditions
    for (const condition of group.conditions) {
      const validation = this.validateCondition(condition);
      if (!validation.valid) {
        return validation;
      }
    }

    // Validate nested groups
    if (group.groups) {
      for (const nestedGroup of group.groups) {
        const validation = this.validateConditionGroup(nestedGroup);
        if (!validation.valid) {
          return validation;
        }
      }
    }

    return { valid: true };
  }

  /**
   * Test conditions with sample data
   */
  async testConditions(
    group: ConditionGroup,
    sampleContext: ExecutionContext
  ): Promise<{
    result: boolean;
    details: Array<{
      condition: AnyCondition;
      result: boolean;
      actualValue: any;
    }>;
  }> {
    const details: Array<{
      condition: AnyCondition;
      result: boolean;
      actualValue: any;
    }> = [];

    const evaluateWithDetails = async (cond: AnyCondition): Promise<boolean> => {
      const actualValue = this.isPriceCondition(cond)
        ? undefined
        : this.resolveValue((cond as Condition).field, sampleContext);
      const result = await this.evaluateCondition(cond, sampleContext);

      details.push({
        condition: cond,
        result,
        actualValue,
      });

      return result;
    };

    await Promise.all(group.conditions.map(evaluateWithDetails));

    const result = await this.evaluateConditionGroup(group, sampleContext);

    return { result, details };
  }
}

export default ConditionEvaluator;
