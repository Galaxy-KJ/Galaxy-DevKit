import {
  Condition,
  ConditionGroup,
  ConditionOperator,
  ConditionLogic,
  ExecutionContext,
} from '../types/automation-types.js';

export class ConditionEvaluator {

  evaluateConditionGroup(
    group: ConditionGroup,
    context: ExecutionContext
  ): boolean {
    const conditionResults = group.conditions.map(condition =>
      this.evaluateCondition(condition, context)
    );

    const nestedResults = (group.groups || []).map(nestedGroup =>
      this.evaluateConditionGroup(nestedGroup, context)
    );

    const allResults = [...conditionResults, ...nestedResults];

    if (group.logic === ConditionLogic.AND) {
      return allResults.every(result => result === true);
    } else {
      return allResults.some(result => result === true);
    }
  }

  /**
   * Evaluate a single condition
   */
  evaluateCondition(condition: Condition, context: ExecutionContext): boolean {
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
  validateCondition(condition: Condition): { valid: boolean; error?: string } {
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
  testConditions(
    group: ConditionGroup,
    sampleContext: ExecutionContext
  ): {
    result: boolean;
    details: Array<{
      condition: Condition;
      result: boolean;
      actualValue: any;
    }>;
  } {
    const details: Array<{
      condition: Condition;
      result: boolean;
      actualValue: any;
    }> = [];

    const evaluateWithDetails = (cond: Condition): boolean => {
      const actualValue = this.resolveValue(cond.field, sampleContext);
      const result = this.evaluateCondition(cond, sampleContext);

      details.push({
        condition: cond,
        result,
        actualValue,
      });

      return result;
    };

    group.conditions.forEach(evaluateWithDetails);

    const result = this.evaluateConditionGroup(group, sampleContext);

    return { result, details };
  }
}

export default ConditionEvaluator;
