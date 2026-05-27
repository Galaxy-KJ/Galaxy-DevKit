import {
  dcaTemplate,
  DCAConfig,
} from '../templates/dca.js';
import {
  gridTemplate,
  GridConfig,
} from '../templates/grid.js';
import {
  stopLossTemplate,
  StopLossConfig,
} from '../templates/stop-loss.js';

describe('DCA Template', () => {
  const baseConfig: DCAConfig = {
    asset: 'XLM',
    buyAmount: '100',
    intervalMs: 86400000,
    totalBudget: '10000',
    destination: 'GDABCDEF1234567890',
    userId: 'user-1',
  };

  it('should create a DCA automation rule', () => {
    const result = dcaTemplate(baseConfig);
    expect(result.rule).toBeDefined();
    expect(result.rule.name).toContain('DCA');
    expect(result.rule.triggerType).toBe('CRON');
    expect(result.rule.executionType).toBe('STELLAR_PAYMENT');
    expect(result.rule.maxExecutions).toBe(100);
  });

  it('should calculate total investments correctly', () => {
    const result = dcaTemplate(baseConfig);
    expect(result.metadata.totalInvestments).toBe(100);
    expect(result.metadata.estimatedDurationMs).toBe(100 * 86400000);
  });

  it('should generate cron expression for daily interval', () => {
    const result = dcaTemplate(baseConfig);
    expect(result.rule.cronExpression).toBe('0 0 */1 * *');
  });

  it('should generate cron for hourly interval', () => {
    const cfg = { ...baseConfig, intervalMs: 3600000 };
    const result = dcaTemplate(cfg);
    expect(result.rule.cronExpression).toBe('0 */1 * * *');
  });

  it('should generate cron for minute interval', () => {
    const cfg = { ...baseConfig, intervalMs: 300000 };
    const result = dcaTemplate(cfg);
    expect(result.rule.cronExpression).toMatch(/^\*\/5 \* \* \* \*$/);
  });

  it('should generate cron for seconds interval', () => {
    const cfg = { ...baseConfig, intervalMs: 10000 };
    const result = dcaTemplate(cfg);
    expect(result.rule.cronExpression).toMatch(/^\*\/10 \* \* \* \* \*$/);
  });

  it('should set retry configuration', () => {
    const result = dcaTemplate(baseConfig);
    expect(result.rule.executionConfig.retryAttempts).toBe(3);
    expect(result.rule.executionConfig.retryDelay).toBe(5000);
  });

  it('should include asset in payment config', () => {
    const result = dcaTemplate(baseConfig);
    expect(result.rule.executionConfig.paymentConfig?.asset.code).toBe('XLM');
    expect(result.rule.executionConfig.paymentConfig?.amount).toBe('100');
  });
});

describe('Grid Template', () => {
  const baseConfig: GridConfig = {
    asset: 'XLM',
    quoteAsset: 'USDC',
    upperPrice: 0.15,
    lowerPrice: 0.10,
    gridLevels: 5,
    amountPerLevel: '100',
    userId: 'user-1',
    userPublicKey: 'GD123',
  };

  it('should create correct number of grid levels', () => {
    const result = gridTemplate(baseConfig);
    expect(result.levels.length).toBe(5);
  });

  it('should have buy and sell rules per level', () => {
    const result = gridTemplate(baseConfig);
    for (const level of result.levels) {
      expect(level.buyRule).toBeDefined();
      expect(level.sellRule).toBeDefined();
      expect(level.buyRule.executionType).toBe('DEX_TRADE');
      expect(level.sellRule.executionType).toBe('DEX_TRADE');
    }
  });

  it('should set correct price range', () => {
    const result = gridTemplate(baseConfig);
    expect(result.metadata.priceRange.lower).toBe(0.10);
    expect(result.metadata.priceRange.upper).toBe(0.15);
  });

  it('should price buy/sell thresholds at correct intervals', () => {
    const result = gridTemplate(baseConfig);
    const step = 0.01;
    for (let i = 0; i < result.levels.length; i++) {
      expect(result.levels[i].buyPrice).toBeCloseTo(0.10 + i * step, 4);
      expect(result.levels[i].sellPrice).toBeCloseTo(0.10 + (i + 1) * step, 4);
    }
  });

  it('should set price conditions with correct operators', () => {
    const result = gridTemplate(baseConfig);
    for (const level of result.levels) {
      expect(level.buyRule.conditionGroup.conditions[0]).toMatchObject({
        operator: 'LTE',
      });
      expect(level.sellRule.conditionGroup.conditions[0]).toMatchObject({
        operator: 'GTE',
      });
    }
  });

  it('should set maxExecutions to 1 per level', () => {
    const result = gridTemplate(baseConfig);
    for (const level of result.levels) {
      expect(level.buyRule.maxExecutions).toBe(1);
      expect(level.sellRule.maxExecutions).toBe(1);
    }
  });

  it('should have status ACTIVE for all rules', () => {
    const result = gridTemplate(baseConfig);
    for (const level of result.levels) {
      expect(level.buyRule.status).toBe('ACTIVE');
      expect(level.sellRule.status).toBe('ACTIVE');
    }
  });
});

describe('Stop-Loss Template', () => {
  const baseConfig: StopLossConfig = {
    asset: 'XLM',
    quoteAsset: 'USDC',
    triggerPrice: 0.08,
    sellPercent: 100,
    userId: 'user-1',
    userPublicKey: 'GD123',
    holdingAmount: '1000',
  };

  it('should create a stop-loss rule', () => {
    const result = stopLossTemplate(baseConfig);
    expect(result.rule).toBeDefined();
    expect(result.rule.name).toContain('Stop-Loss');
  });

  it('should trigger on PRICE with LTE condition', () => {
    const result = stopLossTemplate(baseConfig);
    expect(result.rule.triggerType).toBe('PRICE');
    const condition = result.rule.conditionGroup.conditions[0] as any;
    expect(condition.operator).toBe('LTE');
    expect(condition.threshold).toBe(0.08);
  });

  it('should calculate sell amount as percentage of holding', () => {
    const result = stopLossTemplate(baseConfig);
    expect(result.metadata.sellAmount).toBe('1000.0000000');
  });

  it('should sell partial amount when sellPercent < 100', () => {
    const cfg = { ...baseConfig, sellPercent: 50 };
    const result = stopLossTemplate(cfg);
    const expected = (1000 * 50) / 100;
    expect(parseFloat(result.metadata.sellAmount)).toBeCloseTo(expected, 6);
  });

  it('should throw for invalid sellPercent', () => {
    expect(() => stopLossTemplate({ ...baseConfig, sellPercent: 0 })).toThrow();
    expect(() => stopLossTemplate({ ...baseConfig, sellPercent: 101 })).toThrow();
  });

  it('should configure DEX_TRADE execution', () => {
    const result = stopLossTemplate(baseConfig);
    expect(result.rule.executionType).toBe('DEX_TRADE');
    expect(result.rule.executionConfig.tradeConfig?.side).toBe('SELL');
  });

  it('should set retry configuration', () => {
    const result = stopLossTemplate(baseConfig);
    expect(result.rule.executionConfig.retryAttempts).toBe(3);
    expect(result.rule.executionConfig.retryDelay).toBe(2000);
  });
});
