import {
  AutomationRule,
  AutomationStatus,
  ConditionGroup,
  ConditionLogic,
  ExecutionType,
  TriggerType,
} from '../types/automation-types.js';

export interface DCAConfig {
  asset: string;
  buyAmount: string;
  intervalMs: number;
  totalBudget: string;
  destination: string;
  userId: string;
  issuer?: string;
}

export interface DcaTemplateResult {
  rule: AutomationRule;
  metadata: {
    type: 'dca';
    totalInvestments: number;
    estimatedDurationMs: number;
  };
}

export function dcaTemplate(config: DCAConfig): DcaTemplateResult {
  const totalInvestments = Math.floor(
    parseFloat(config.totalBudget) / parseFloat(config.buyAmount)
  );

  const estimatedDurationMs = totalInvestments * config.intervalMs;

  const conditionGroup: ConditionGroup = {
    logic: ConditionLogic.AND,
    conditions: [],
  };

  const rule: AutomationRule = {
    id: generateId(),
    name: `DCA ${config.asset}`,
    description: `DCA buy ${config.buyAmount} ${config.asset} every ${config.intervalMs}ms up to ${config.totalBudget}`,
    userId: config.userId,
    status: AutomationStatus.ACTIVE,
    triggerType: TriggerType.CRON,
    cronExpression: msToCron(config.intervalMs),
    conditionGroup,
    executionType: ExecutionType.STELLAR_PAYMENT,
    executionConfig: {
      paymentConfig: {
        destination: config.destination,
        asset: {
          code: config.asset,
          issuer: config.issuer,
        },
        amount: config.buyAmount,
      },
      retryAttempts: 3,
      retryDelay: 5000,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    executionCount: 0,
    failureCount: 0,
    maxExecutions: totalInvestments,
  };

  return {
    rule,
    metadata: {
      type: 'dca',
      totalInvestments,
      estimatedDurationMs,
    },
  };
}

function generateId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${ts}-${rand}`;
}

function msToCron(intervalMs: number): string {
  if (intervalMs < 60000) {
    const seconds = Math.floor(intervalMs / 1000);
    return `*/${seconds} * * * * *`;
  }
  if (intervalMs < 3600000) {
    const minutes = Math.floor(intervalMs / 60000);
    return `*/${minutes} * * * *`;
  }
  if (intervalMs < 86400000) {
    const hours = Math.floor(intervalMs / 3600000);
    return `0 */${hours} * * *`;
  }
  const days = Math.floor(intervalMs / 86400000);
  return `0 0 */${days} * *`;
}
