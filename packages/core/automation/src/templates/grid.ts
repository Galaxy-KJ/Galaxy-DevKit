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

export interface GridConfig {
  asset: string;
  quoteAsset: string;
  upperPrice: number;
  lowerPrice: number;
  gridLevels: number;
  amountPerLevel: string;
  userId: string;
  sellingIssuer?: string;
  buyingIssuer?: string;
  userPublicKey: string;
}

export interface GridLevel {
  level: number;
  buyPrice: number;
  sellPrice: number;
  buyRule: AutomationRule;
  sellRule: AutomationRule;
}

export interface GridTemplateResult {
  name: string;
  levels: GridLevel[];
  metadata: {
    type: 'grid';
    gridCount: number;
    priceRange: { lower: number; upper: number };
    totalInvestment: string;
  };
}

export function gridTemplate(config: GridConfig): GridTemplateResult {
  const { lowerPrice, upperPrice, gridLevels, amountPerLevel } = config;
  const step = (upperPrice - lowerPrice) / gridLevels;

  const levels: GridLevel[] = [];
  let totalInvestment = 0;

  for (let i = 0; i < gridLevels; i++) {
    const buyPrice = lowerPrice + i * step;
    const sellPrice = buyPrice + step;
    const levelId = generateId();

    const buyCondition: ConditionGroup = {
      logic: ConditionLogic.AND,
      conditions: [
        {
          type: 'price',
          id: `grid-buy-${i}`,
          asset: config.asset,
          operator: ConditionOperator.LESS_THAN_OR_EQUAL,
          threshold: buyPrice,
        },
      ],
    };

    const buyRule: AutomationRule = {
      id: `grid-buy-${levelId}`,
      name: `Grid Buy L${i + 1} @ $${buyPrice.toFixed(4)}`,
      description: `Buy ${config.asset} when price <= $${buyPrice.toFixed(4)}`,
      userId: config.userId,
      status: AutomationStatus.ACTIVE,
      triggerType: TriggerType.PRICE,
      conditionGroup: buyCondition,
      executionType: ExecutionType.DEX_TRADE,
      executionConfig: {
        tradeConfig: {
          pair: `${config.asset}/${config.quoteAsset}`,
          side: 'BUY',
          type: 'MARKET',
          amount: amountPerLevel,
          selling: { code: config.quoteAsset, issuer: config.buyingIssuer },
          buying: { code: config.asset, issuer: config.sellingIssuer },
        },
        retryAttempts: 2,
        retryDelay: 3000,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      executionCount: 0,
      failureCount: 0,
      maxExecutions: 1,
    };

    const sellCondition: ConditionGroup = {
      logic: ConditionLogic.AND,
      conditions: [
        {
          type: 'price',
          id: `grid-sell-${i}`,
          asset: config.asset,
          operator: ConditionOperator.GREATER_THAN_OR_EQUAL,
          threshold: sellPrice,
        },
      ],
    };

    const sellRule: AutomationRule = {
      id: `grid-sell-${levelId}`,
      name: `Grid Sell L${i + 1} @ $${sellPrice.toFixed(4)}`,
      description: `Sell ${config.asset} when price >= $${sellPrice.toFixed(4)}`,
      userId: config.userId,
      status: AutomationStatus.ACTIVE,
      triggerType: TriggerType.PRICE,
      conditionGroup: sellCondition,
      executionType: ExecutionType.DEX_TRADE,
      executionConfig: {
        tradeConfig: {
          pair: `${config.asset}/${config.quoteAsset}`,
          side: 'SELL',
          type: 'MARKET',
          amount: amountPerLevel,
          selling: { code: config.asset, issuer: config.sellingIssuer },
          buying: { code: config.quoteAsset, issuer: config.buyingIssuer },
        },
        retryAttempts: 2,
        retryDelay: 3000,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
      executionCount: 0,
      failureCount: 0,
      maxExecutions: 1,
    };

    levels.push({ level: i + 1, buyPrice, sellPrice, buyRule, sellRule });
    totalInvestment += parseFloat(amountPerLevel) * 2;
  }

  return {
    name: `Grid ${config.asset}/${config.quoteAsset}`,
    levels,
    metadata: {
      type: 'grid',
      gridCount: gridLevels,
      priceRange: { lower: lowerPrice, upper: upperPrice },
      totalInvestment: totalInvestment.toFixed(2),
    },
  };
}
