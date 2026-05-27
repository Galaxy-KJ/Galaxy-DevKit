import {
  AutomationRule,
  AutomationStatus,
  ConditionGroup,
  ConditionLogic,
  ConditionOperator,
  ExecutionType,
  TriggerType,
} from '../types/automation-types.js';

function generateId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${ts}-${rand}`;
}

export interface StopLossConfig {
  asset: string;
  quoteAsset: string;
  triggerPrice: number;
  entryPrice: number;
  sellPercent: number;
  userId: string;
  userPublicKey: string;
  holdingAmount: string;
  assetIssuer?: string;
  quoteIssuer?: string;
}

export interface StopLossTemplateResult {
  rule: AutomationRule;
  metadata: {
    type: 'stop-loss';
    triggerPrice: number;
    sellAmount: string;
    maxLossPercent: number;
  };
}

export function stopLossTemplate(config: StopLossConfig): StopLossTemplateResult {
  if (config.sellPercent <= 0 || config.sellPercent > 100) {
    throw new Error('sellPercent must be between 1 and 100');
  }

  const sellAmount = (
    (parseFloat(config.holdingAmount) * config.sellPercent) /
    100
  ).toFixed(7);

  const maxLossPercent =
    config.entryPrice && isFinite(config.entryPrice) && config.entryPrice > 0
      ? ((config.entryPrice - config.triggerPrice) / config.entryPrice) * 100
      : 0;

  const conditionGroup: ConditionGroup = {
    logic: ConditionLogic.AND,
    conditions: [
      {
        type: 'price',
        id: 'stop-loss-trigger',
        asset: config.asset,
        operator: ConditionOperator.LESS_THAN_OR_EQUAL,
        threshold: config.triggerPrice,
      },
    ],
  };

  const rule: AutomationRule = {
    id: generateId(),
    name: `Stop-Loss ${config.asset}`,
    description:
      `Sell ${config.sellPercent}% of ${config.asset} ` +
      `when price <= $${config.triggerPrice}`,
    userId: config.userId,
    status: AutomationStatus.ACTIVE,
    triggerType: TriggerType.PRICE,
    conditionGroup,
    executionType: ExecutionType.DEX_TRADE,
    executionConfig: {
      tradeConfig: {
        pair: `${config.asset}/${config.quoteAsset}`,
        side: 'SELL',
        type: 'MARKET',
        amount: sellAmount,
        selling: { code: config.asset, issuer: config.assetIssuer },
        buying: { code: config.quoteAsset, issuer: config.quoteIssuer },
      },
      retryAttempts: 3,
      retryDelay: 2000,
    },
    createdAt: new Date(),
    updatedAt: new Date(),
    executionCount: 0,
    failureCount: 0,
    maxExecutions: 1,
  };

  return {
    rule,
    metadata: {
      type: 'stop-loss',
      triggerPrice: config.triggerPrice,
      sellAmount,
      maxLossPercent,
    },
  };
}
