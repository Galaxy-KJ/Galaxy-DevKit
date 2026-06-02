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
  const parsedBudget = parseFloat(config.totalBudget);
  const parsedBuyAmount = parseFloat(config.buyAmount);

  if (!isFinite(parsedBudget) || !isFinite(parsedBuyAmount) || parsedBuyAmount <= 0) {
    throw new Error(
      `Invalid DCA config: totalBudget must be a finite number and buyAmount must be a positive finite number`
    );
  }

  const totalInvestments = Math.floor(parsedBudget / parsedBuyAmount);
  const estimatedDurationMs = isFinite(totalInvestments) ? totalInvestments * config.intervalMs : 0;

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
  const safeMs = Math.max(1000, intervalMs);

  const rawSeconds = Math.ceil(safeMs / 1000);
  if (rawSeconds < 60) {
    return `*/${rawSeconds} * * * * *`;
  }

  const rawMinutes = Math.ceil(safeMs / 60000);
  if (rawMinutes < 60) {
    return `*/${rawMinutes} * * * *`;
  }

  const rawHours = Math.ceil(safeMs / 3600000);
  if (rawHours < 24) {
    return `0 */${rawHours} * * *`;
  }

  const rawDays = Math.ceil(safeMs / 86400000);
  return `0 0 */${rawDays} * *`;
}
