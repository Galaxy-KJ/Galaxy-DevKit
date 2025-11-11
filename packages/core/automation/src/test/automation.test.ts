/**
 * Jest tests for AutomationService
 */

import { AutomationService } from '../services/automation.service';
import {
  AutomationRule,
  AutomationStatus,
  TriggerType,
  ExecutionType,
  ConditionLogic,
  ConditionOperator,
  StellarNetwork,
} from '../types/automation-types';
import { CronManager } from '../utils/cron-manager';
import { ConditionEvaluator } from '../utils/condition-evaluator';
import { ExecutionEngine } from '../utils/execution-engine';


jest.mock('../utils/cron-manager');
jest.mock('../utils/condition-evaluator');
jest.mock('../utils/execution-engine');

describe('AutomationService', () => {
  let automationService: AutomationService;
  let mockCronManager: jest.Mocked<CronManager>;
  let mockConditionEvaluator: jest.Mocked<ConditionEvaluator>;
  let mockExecutionEngine: jest.Mocked<ExecutionEngine>;

  const testNetwork: StellarNetwork = {
    type: 'TESTNET',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  };

  const createTestRule = (
    overrides?: Partial<AutomationRule>
  ): AutomationRule => ({
    id: 'test-rule-1',
    name: 'Test Rule',
    description: 'A test automation rule',
    userId: 'user123',
    status: AutomationStatus.ACTIVE,
    triggerType: TriggerType.CRON,
    cronExpression: '*/5 * * * *',
    conditionGroup: {
      logic: ConditionLogic.AND,
      conditions: [
        {
          id: 'condition-1',
          field: 'marketData.XLM.priceUSD',
          operator: ConditionOperator.LESS_THAN,
          value: 0.1,
        },
      ],
    },
    executionType: ExecutionType.STELLAR_PAYMENT,
    executionConfig: {
      paymentConfig: {
        destination:
          'GDXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        asset: {},
        amount: '100',
      },
    },
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    executionCount: 0,
    failureCount: 0,
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockCronManager = new CronManager() as jest.Mocked<CronManager>;
    mockConditionEvaluator =
      new ConditionEvaluator() as jest.Mocked<ConditionEvaluator>;
    mockExecutionEngine = new ExecutionEngine(
      testNetwork
    ) as jest.Mocked<ExecutionEngine>;

    // Mock implementations
    mockCronManager.scheduleJob = jest.fn().mockReturnValue({
      id: 'cron-job-1',
      ruleId: 'test-rule-1',
      expression: '*/5 * * * *',
      nextRun: new Date(),
      isRunning: false,
    });
    mockCronManager.startJob = jest.fn().mockReturnValue(true);
    mockCronManager.stopJob = jest.fn().mockReturnValue(true);
    mockCronManager.removeJob = jest.fn().mockReturnValue(true);
    mockCronManager.validateExpression = jest.fn().mockReturnValue(true);
    mockCronManager.destroy = jest.fn();

    mockConditionEvaluator.evaluateConditionGroup = jest
      .fn()
      .mockReturnValue(true);
    mockConditionEvaluator.validateConditionGroup = jest
      .fn()
      .mockReturnValue({ valid: true });

    mockExecutionEngine.execute = jest.fn().mockResolvedValue({
      ruleId: 'test-rule-1',
      executionId: 'exec-123',
      success: true,
      timestamp: new Date(),
      duration: 100,
      result: { hash: 'test-hash' },
    });

    // Mock constructors
    (CronManager as jest.MockedClass<typeof CronManager>).mockImplementation(
      () => mockCronManager
    );
    (
      ConditionEvaluator as jest.MockedClass<typeof ConditionEvaluator>
    ).mockImplementation(() => mockConditionEvaluator);
    (
      ExecutionEngine as jest.MockedClass<typeof ExecutionEngine>
    ).mockImplementation(() => mockExecutionEngine);

    automationService = new AutomationService({
      network: testNetwork,
      sourceSecret: 'SBXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    // Clean up any pending timers
    jest.clearAllTimers();
  });

  describe('Constructor', () => {
    it('should initialize with default config', () => {
      const service = new AutomationService();
      expect(service).toBeInstanceOf(AutomationService);
    });

    it('should initialize with custom config', () => {
      const service = new AutomationService({
        network: testNetwork,
        sourceSecret: 'test-secret',
        maxConcurrentExecutions: 5,
        executionTimeout: 60000,
        enableMetrics: false,
      });
      expect(service).toBeInstanceOf(AutomationService);
    });

    it('should create CronManager, ConditionEvaluator, and ExecutionEngine', () => {
      expect(CronManager).toHaveBeenCalled();
      expect(ConditionEvaluator).toHaveBeenCalled();
      expect(ExecutionEngine).toHaveBeenCalledWith(
        testNetwork,
        expect.any(String)
      );
    });
  });

  describe('registerRule', () => {
    it('should register a valid rule', async () => {
      const rule = createTestRule();
      await automationService.registerRule(rule);

      expect(automationService.getRule(rule.id)).toEqual(rule);
    });

    it('should schedule cron job for CRON trigger type', async () => {
      const rule = createTestRule();
      await automationService.registerRule(rule);

      expect(mockCronManager.scheduleJob).toHaveBeenCalledWith(
        rule.id,
        rule.cronExpression,
        expect.any(Function)
      );
      expect(mockCronManager.startJob).toHaveBeenCalledWith(rule.id);
    });

    it('should not schedule cron job for non-CRON trigger', async () => {
      const rule = createTestRule({
        triggerType: TriggerType.EVENT,
        cronExpression: undefined,
      });
      await automationService.registerRule(rule);

      expect(mockCronManager.scheduleJob).not.toHaveBeenCalled();
    });

    it('should not schedule cron job for inactive rule', async () => {
      const rule = createTestRule({
        status: AutomationStatus.PAUSED,
      });
      await automationService.registerRule(rule);

      expect(mockCronManager.scheduleJob).not.toHaveBeenCalled();
    });

    it('should throw error for invalid rule', async () => {
      const rule = createTestRule({ id: '', name: '' });
      await expect(automationService.registerRule(rule)).rejects.toThrow(
        'Invalid rule'
      );
    });

    it('should throw error for CRON trigger without expression', async () => {
      const rule = createTestRule({ cronExpression: undefined });
      await expect(automationService.registerRule(rule)).rejects.toThrow(
        'Cron expression required'
      );
    });

    it('should throw error for invalid cron expression', async () => {
      mockCronManager.validateExpression.mockReturnValue(false);
      const rule = createTestRule();
      await expect(automationService.registerRule(rule)).rejects.toThrow(
        'Invalid cron expression'
      );
    });

    it('should emit rule:registered event', async () => {
      const rule = createTestRule();
      const listener = jest.fn();
      automationService.on('rule:registered', listener);

      await automationService.registerRule(rule);

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          rule,
        })
      );
    });

    it('should initialize metrics when enabled', async () => {
      const rule = createTestRule();
      await automationService.registerRule(rule);

      const metrics = automationService.getMetrics(rule.id);
      expect(metrics).toBeDefined();
      expect(metrics?.totalExecutions).toBe(0);
      expect(metrics?.successRate).toBe(0);
    });
  });

  describe('executeRule', () => {
    beforeEach(async () => {
      const rule = createTestRule();
      await automationService.registerRule(rule);
    });

    it('should execute rule successfully', async () => {
      const result = await automationService.executeRule('test-rule-1');

      expect(result.success).toBe(true);
      expect(mockConditionEvaluator.evaluateConditionGroup).toHaveBeenCalled();
      expect(mockExecutionEngine.execute).toHaveBeenCalled();
    });

    it('should throw error if rule not found', async () => {
      await expect(
        automationService.executeRule('non-existent')
      ).rejects.toThrow('Rule not found');
    });

    it('should throw error if rule is not active', async () => {
      automationService.pauseRule('test-rule-1');
      await expect(
        automationService.executeRule('test-rule-1')
      ).rejects.toThrow('Rule is not active');
    });

    it('should return error if conditions not met', async () => {
      mockConditionEvaluator.evaluateConditionGroup.mockReturnValue(false);

      const result = await automationService.executeRule('test-rule-1');

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Conditions not met');
      expect(mockExecutionEngine.execute).not.toHaveBeenCalled();
    });

    it('should update rule execution count on success', async () => {
      await automationService.executeRule('test-rule-1');

      const rule = automationService.getRule('test-rule-1');
      expect(rule?.executionCount).toBe(1);
      expect(rule?.lastExecuted).toBeInstanceOf(Date);
    });

    it('should update failure count on error', async () => {
      mockExecutionEngine.execute.mockResolvedValue({
        ruleId: 'test-rule-1',
        executionId: 'exec-123',
        success: false,
        timestamp: new Date(),
        duration: 100,
        error: new Error('Execution failed'),
      });

      await automationService.executeRule('test-rule-1');

      const rule = automationService.getRule('test-rule-1');
      expect(rule?.failureCount).toBe(1);
    });

    it('should throw error when max executions reached', async () => {
      const rule = createTestRule({
        id: 'limited-rule',
        maxExecutions: 1,
        executionCount: 1,
      });
      await automationService.registerRule(rule);

      await expect(
        automationService.executeRule('limited-rule')
      ).rejects.toThrow('reached maximum executions');
    });

    it('should disable expired rule', async () => {
      const rule = createTestRule({
        id: 'expired-rule',
        expiresAt: new Date('2023-01-01'),
      });
      await automationService.registerRule(rule);

      await expect(
        automationService.executeRule('expired-rule')
      ).rejects.toThrow('Rule has expired');

      const updatedRule = automationService.getRule('expired-rule');
      expect(updatedRule?.status).toBe(AutomationStatus.DISABLED);
    });

    it('should respect concurrent execution limit', async () => {
      const limitedService = new AutomationService({
        maxConcurrentExecutions: 1,
      });

      const rule = createTestRule();
      await limitedService.registerRule(rule);

      // Mock long-running execution
      mockExecutionEngine.execute.mockImplementation(
        () =>
          new Promise(resolve =>
            setTimeout(
              () =>
                resolve({
                  ruleId: 'test-rule-1',
                  executionId: 'exec-123',
                  success: true,
                  timestamp: new Date(),
                  duration: 100,
                }),
              100
            )
          )
      );

      const promise1 = limitedService.executeRule('test-rule-1');
      await expect(limitedService.executeRule('test-rule-1')).rejects.toThrow(
        'Maximum concurrent executions reached'
      );

      await promise1;
    });

    it('should handle execution timeout', async () => {
      const timeoutService = new AutomationService({
        executionTimeout: 50,
      });

      const rule = createTestRule();
      await timeoutService.registerRule(rule);

      mockExecutionEngine.execute.mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 200))
      );

      const result = await timeoutService.executeRule('test-rule-1');

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Execution timeout');
    });

    it('should emit rule:executing event', async () => {
      const listener = jest.fn();
      automationService.on('rule:executing', listener);

      await automationService.executeRule('test-rule-1');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          ruleId: 'test-rule-1',
        })
      );
    });

    it('should emit rule:executed event on success', async () => {
      const listener = jest.fn();
      automationService.on('rule:executed', listener);

      await automationService.executeRule('test-rule-1');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          ruleId: 'test-rule-1',
          result: expect.objectContaining({
            success: true,
          }),
        })
      );
    });

    it('should emit rule:error event on failure', async () => {
      const listener = jest.fn();
      automationService.on('rule:error', listener);

      mockExecutionEngine.execute.mockRejectedValue(new Error('Test error'));

      await automationService.executeRule('test-rule-1');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          ruleId: 'test-rule-1',
          error: expect.any(Error),
        })
      );
    });

    it('should emit rule:conditions_not_met event', async () => {
      const listener = jest.fn();
      automationService.on('rule:conditions_not_met', listener);

      mockConditionEvaluator.evaluateConditionGroup.mockReturnValue(false);

      await automationService.executeRule('test-rule-1');

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          ruleId: 'test-rule-1',
        })
      );
    });

    it('should pass custom context data', async () => {
      const customContext = {
        marketData: { XLM: { priceUSD: 0.09 } },
      };

      await automationService.executeRule('test-rule-1', customContext);

      expect(
        mockConditionEvaluator.evaluateConditionGroup
      ).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          marketData: customContext.marketData,
        })
      );
    });

    it('should update metrics on execution', async () => {
      await automationService.executeRule('test-rule-1');

      const metrics = automationService.getMetrics('test-rule-1');
      expect(metrics?.totalExecutions).toBe(1);
      expect(metrics?.successfulExecutions).toBe(1);
      expect(metrics?.successRate).toBe(1);
    });
  });

  describe('updateRuleStatus', () => {
    beforeEach(async () => {
      const rule = createTestRule();
      await automationService.registerRule(rule);
    });

    it('should update rule status', () => {
      automationService.updateRuleStatus(
        'test-rule-1',
        AutomationStatus.PAUSED
      );

      const rule = automationService.getRule('test-rule-1');
      expect(rule?.status).toBe(AutomationStatus.PAUSED);
    });

    it('should throw error if rule not found', () => {
      expect(() =>
        automationService.updateRuleStatus(
          'non-existent',
          AutomationStatus.PAUSED
        )
      ).toThrow('Rule not found');
    });

    it('should start cron job when activating', () => {
      automationService.pauseRule('test-rule-1');
      mockCronManager.startJob.mockClear();

      automationService.updateRuleStatus(
        'test-rule-1',
        AutomationStatus.ACTIVE
      );

      expect(mockCronManager.startJob).toHaveBeenCalledWith('test-rule-1');
    });

    it('should stop cron job when pausing', () => {
      automationService.updateRuleStatus(
        'test-rule-1',
        AutomationStatus.PAUSED
      );

      expect(mockCronManager.stopJob).toHaveBeenCalledWith('test-rule-1');
    });

    it('should emit rule:status_changed event', () => {
      const listener = jest.fn();
      automationService.on('rule:status_changed', listener);

      automationService.updateRuleStatus(
        'test-rule-1',
        AutomationStatus.PAUSED
      );

      expect(listener).toHaveBeenCalledWith({
        ruleId: 'test-rule-1',
        oldStatus: AutomationStatus.ACTIVE,
        newStatus: AutomationStatus.PAUSED,
      });
    });
  });

  describe('pauseRule', () => {
    it('should pause a rule', async () => {
      const rule = createTestRule();
      await automationService.registerRule(rule);

      automationService.pauseRule('test-rule-1');

      const updatedRule = automationService.getRule('test-rule-1');
      expect(updatedRule?.status).toBe(AutomationStatus.PAUSED);
    });
  });

  describe('resumeRule', () => {
    it('should resume a paused rule', async () => {
      const rule = createTestRule({ status: AutomationStatus.PAUSED });
      await automationService.registerRule(rule);

      automationService.resumeRule('test-rule-1');

      const updatedRule = automationService.getRule('test-rule-1');
      expect(updatedRule?.status).toBe(AutomationStatus.ACTIVE);
    });
  });

  describe('deleteRule', () => {
    beforeEach(async () => {
      const rule = createTestRule();
      await automationService.registerRule(rule);
    });

    it('should delete a rule', () => {
      automationService.deleteRule('test-rule-1');

      expect(automationService.getRule('test-rule-1')).toBeUndefined();
    });

    it('should remove cron job', () => {
      automationService.deleteRule('test-rule-1');

      expect(mockCronManager.removeJob).toHaveBeenCalledWith('test-rule-1');
    });

    it('should remove metrics', () => {
      automationService.deleteRule('test-rule-1');

      expect(automationService.getMetrics('test-rule-1')).toBeUndefined();
    });

    it('should emit rule:deleted event', () => {
      const listener = jest.fn();
      automationService.on('rule:deleted', listener);

      automationService.deleteRule('test-rule-1');

      expect(listener).toHaveBeenCalledWith({ ruleId: 'test-rule-1' });
    });

    it('should throw error if rule not found', () => {
      expect(() => automationService.deleteRule('non-existent')).toThrow(
        'Rule not found'
      );
    });
  });

  describe('getRule', () => {
    it('should return rule by id', async () => {
      const rule = createTestRule();
      await automationService.registerRule(rule);

      const retrievedRule = automationService.getRule('test-rule-1');
      expect(retrievedRule).toEqual(rule);
    });

    it('should return undefined for non-existent rule', () => {
      const rule = automationService.getRule('non-existent');
      expect(rule).toBeUndefined();
    });
  });

  describe('getAllRules', () => {
    it('should return all rules', async () => {
      const rule1 = createTestRule({ id: 'rule-1' });
      const rule2 = createTestRule({ id: 'rule-2' });

      await automationService.registerRule(rule1);
      await automationService.registerRule(rule2);

      const rules = automationService.getAllRules();
      expect(rules).toHaveLength(2);
      expect(rules).toContainEqual(rule1);
      expect(rules).toContainEqual(rule2);
    });

    it('should return empty array when no rules', () => {
      const rules = automationService.getAllRules();
      expect(rules).toEqual([]);
    });
  });

  describe('getRulesByUser', () => {
    it('should return rules for specific user', async () => {
      const rule1 = createTestRule({ id: 'rule-1', userId: 'user1' });
      const rule2 = createTestRule({ id: 'rule-2', userId: 'user2' });
      const rule3 = createTestRule({ id: 'rule-3', userId: 'user1' });

      await automationService.registerRule(rule1);
      await automationService.registerRule(rule2);
      await automationService.registerRule(rule3);

      const user1Rules = automationService.getRulesByUser('user1');
      expect(user1Rules).toHaveLength(2);
      expect(user1Rules.map(r => r.id)).toEqual(['rule-1', 'rule-3']);
    });

    it('should return empty array for user with no rules', () => {
      const rules = automationService.getRulesByUser('non-existent-user');
      expect(rules).toEqual([]);
    });
  });

  describe('getMetrics', () => {
    it('should return metrics for a rule', async () => {
      const rule = createTestRule();
      await automationService.registerRule(rule);

      const metrics = automationService.getMetrics('test-rule-1');
      expect(metrics).toBeDefined();
      expect(metrics?.ruleId).toBe('test-rule-1');
    });

    it('should return undefined for non-existent rule', () => {
      const metrics = automationService.getMetrics('non-existent');
      expect(metrics).toBeUndefined();
    });
  });

  describe('getAllMetrics', () => {
    it('should return all metrics', async () => {
      const rule1 = createTestRule({ id: 'rule-1' });
      const rule2 = createTestRule({ id: 'rule-2' });

      await automationService.registerRule(rule1);
      await automationService.registerRule(rule2);

      const metrics = automationService.getAllMetrics();
      expect(metrics).toHaveLength(2);
    });
  });

  describe('testRuleConditions', () => {
    beforeEach(async () => {
      const rule = createTestRule();
      await automationService.registerRule(rule);
    });

    it('should test rule conditions', () => {
      const context = {
        ruleId: 'test-rule-1',
        userId: 'user123',
        timestamp: new Date(),
        marketData: { XLM: { priceUSD: 0.09 } },
      };

      mockConditionEvaluator.evaluateConditionGroup.mockReturnValue(true);

      const result = automationService.testRuleConditions(
        'test-rule-1',
        context
      );
      expect(result).toBe(true);
      expect(mockConditionEvaluator.evaluateConditionGroup).toHaveBeenCalled();
    });

    it('should throw error if rule not found', () => {
      const context = {
        ruleId: 'non-existent',
        userId: 'user123',
        timestamp: new Date(),
      };

      expect(() =>
        automationService.testRuleConditions('non-existent', context)
      ).toThrow('Rule not found');
    });
  });

  describe('getAccountInfo', () => {
    it('should call execution engine getAccountInfo', async () => {
      mockExecutionEngine.getAccountInfo = jest.fn().mockResolvedValue({
        id: 'GXXXXXX',
        sequence: '123456',
      });

      const accountInfo = await automationService.getAccountInfo();

      expect(mockExecutionEngine.getAccountInfo).toHaveBeenCalled();
      expect(accountInfo).toBeDefined();
    });

    it('should pass public key to execution engine', async () => {
      mockExecutionEngine.getAccountInfo = jest.fn().mockResolvedValue({});

      await automationService.getAccountInfo('GXXXXXX');

      expect(mockExecutionEngine.getAccountInfo).toHaveBeenCalledWith(
        'GXXXXXX'
      );
    });
  });

  describe('updateNetwork', () => {
    it('should update network configuration', () => {
      const newNetwork: StellarNetwork = {
        type: 'PUBLIC',
        horizonUrl: 'https://horizon.stellar.org',
        networkPassphrase: 'Public Global Stellar Network ; September 2015',
      };

      mockExecutionEngine.updateNetwork = jest.fn();

      automationService.updateNetwork(newNetwork, 'new-secret');

      expect(mockExecutionEngine.updateNetwork).toHaveBeenCalledWith(
        newNetwork,
        'new-secret'
      );
    });
  });

  describe('shutdown', () => {
    it('should destroy cron manager and remove listeners', async () => {
      await automationService.shutdown();

      expect(mockCronManager.destroy).toHaveBeenCalled();
    });

    it('should remove all event listeners', async () => {
      const listener = jest.fn();
      automationService.on('rule:executed', listener);

      await automationService.shutdown();

      automationService.emit('rule:executed', {});
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Metrics calculation', () => {
    beforeEach(async () => {
      const rule = createTestRule();
      await automationService.registerRule(rule);
    });

    it('should calculate average execution time', async () => {
      mockExecutionEngine.execute
        .mockResolvedValueOnce({
          ruleId: 'test-rule-1',
          executionId: 'exec-1',
          success: true,
          timestamp: new Date(),
          duration: 100,
        })
        .mockResolvedValueOnce({
          ruleId: 'test-rule-1',
          executionId: 'exec-2',
          success: true,
          timestamp: new Date(),
          duration: 200,
        });

      await automationService.executeRule('test-rule-1');
      await automationService.executeRule('test-rule-1');

      const metrics = automationService.getMetrics('test-rule-1');
      expect(metrics?.averageExecutionTime).toBe(150);
    });

    it('should calculate success rate', async () => {
      mockExecutionEngine.execute
        .mockResolvedValueOnce({
          ruleId: 'test-rule-1',
          executionId: 'exec-1',
          success: true,
          timestamp: new Date(),
          duration: 100,
        })
        .mockResolvedValueOnce({
          ruleId: 'test-rule-1',
          executionId: 'exec-2',
          success: false,
          timestamp: new Date(),
          duration: 100,
          error: new Error('Failed'),
        });

      await automationService.executeRule('test-rule-1');
      await automationService.executeRule('test-rule-1');

      const metrics = automationService.getMetrics('test-rule-1');
      expect(metrics?.successRate).toBe(0.5);
      expect(metrics?.successfulExecutions).toBe(1);
      expect(metrics?.failedExecutions).toBe(1);
    });

    it('should track last execution times', async () => {
      await automationService.executeRule('test-rule-1');

      const metrics = automationService.getMetrics('test-rule-1');
      expect(metrics?.lastExecutionTime).toBeInstanceOf(Date);
      expect(metrics?.lastSuccess).toBeInstanceOf(Date);
    });
  });
});
