/**
 * Main Automation Service - Stellar SDK
 */

import { EventEmitter } from 'events';
import {
  AutomationRule,
  AutomationStatus,
  ExecutionContext,
  ExecutionResult,
  AutomationMetrics,
  TriggerType,
  StellarNetwork,
} from '../types/automation-types.js';
import { CronManager } from '../utils/cron-manager.js';
import { ConditionEvaluator } from '../utils/condition-evaluator.js';
import { ExecutionEngine } from '../utils/execution-engine.js';
import { OracleAggregator } from '@galaxy-kj/core-oracles';

export interface AutomationServiceConfig {
  network?: StellarNetwork;
  sourceSecret?: string;
  maxConcurrentExecutions?: number;
  executionTimeout?: number;
  enableMetrics?: boolean;
  oracle?: OracleAggregator;
}

export class AutomationService extends EventEmitter {
  private cronManager: CronManager;
  private conditionEvaluator: ConditionEvaluator;
  private executionEngine: ExecutionEngine;
  private rules: Map<string, AutomationRule> = new Map();
  private metrics: Map<string, AutomationMetrics> = new Map();
  private activeExecutions: Set<string> = new Set();
  private config: Required<AutomationServiceConfig>;
  private network: StellarNetwork;
  private activeTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor(config: AutomationServiceConfig = {}) {
    super();

    this.network = config.network || {
      type: 'TESTNET',
      horizonUrl: 'https://horizon-testnet.stellar.org',
      networkPassphrase: 'Test SDF Network ; September 2015',
    };

    this.config = {
      network: this.network,
      sourceSecret: config.sourceSecret || '',
      maxConcurrentExecutions: config.maxConcurrentExecutions || 10,
      executionTimeout: config.executionTimeout || 300000, // 5 minutes
      enableMetrics: config.enableMetrics !== false,
    };

    this.cronManager = new CronManager();
    this.conditionEvaluator = new ConditionEvaluator(config.oracle);
    this.executionEngine = new ExecutionEngine(
      this.network,
      this.config.sourceSecret
    );

    this.setupEventHandlers();
  }

  /**
   * Register a new automation rule
   */
  async registerRule(rule: AutomationRule): Promise<void> {
    // Validate rule
    const validation = this.validateRule(rule);
    if (!validation.valid) {
      throw new Error(`Invalid rule: ${validation.error}`);
    }

    // Store rule
    this.rules.set(rule.id, rule);

    // Initialize metrics
    if (this.config.enableMetrics) {
      this.initializeMetrics(rule.id);
    }

    // Schedule if it's a cron trigger and active
    if (
      rule.triggerType === TriggerType.CRON &&
      rule.status === AutomationStatus.ACTIVE
    ) {
      if (!rule.cronExpression) {
        throw new Error('Cron expression required for CRON trigger type');
      }

      const cronJob = this.cronManager.scheduleJob(
        rule.id,
        rule.cronExpression,
        async () => {
          await this.executeRule(rule.id);
        }
      );

      this.cronManager.startJob(rule.id);

      this.emit('rule:registered', { rule, cronJob });
    } else {
      this.emit('rule:registered', { rule });
    }
  }

  /**
   * Execute a specific rule
   */
  async executeRule(
    ruleId: string,
    contextData?: Partial<ExecutionContext>
  ): Promise<ExecutionResult> {
    const rule = this.rules.get(ruleId);

    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    if (rule.status !== AutomationStatus.ACTIVE) {
      throw new Error(`Rule is not active: ${ruleId}`);
    }

    // Check if max executions reached
    if (rule.maxExecutions && rule.executionCount >= rule.maxExecutions) {
      throw new Error(`Rule has reached maximum executions: ${ruleId}`);
    }

    // Check if rule has expired
    if (rule.expiresAt && new Date() > rule.expiresAt) {
      this.updateRuleStatus(ruleId, AutomationStatus.DISABLED);
      throw new Error(`Rule has expired: ${ruleId}`);
    }

    // Check concurrent execution limit
    if (this.activeExecutions.size >= this.config.maxConcurrentExecutions) {
      throw new Error('Maximum concurrent executions reached');
    }

    this.activeExecutions.add(ruleId);

    try {
      // Build execution context
      const context: ExecutionContext = {
        ruleId,
        userId: rule.userId,
        timestamp: new Date(),
        stellarData: {
          networkPassphrase: this.network.networkPassphrase,
        },
        ...contextData,
      };

      // Evaluate conditions
      const conditionsMet = await this.conditionEvaluator.evaluateConditionGroup(
        rule.conditionGroup,
        context
      );

      if (!conditionsMet) {
        this.emit('rule:conditions_not_met', { ruleId, context });

        return {
          ruleId,
          executionId: `exec_${ruleId}_${Date.now()}`,
          success: false,
          timestamp: new Date(),
          duration: 0,
          error: new Error('Conditions not met'),
        };
      }

      this.emit('rule:executing', { ruleId, context });

      // Execute with timeout
      const executionPromise = this.executionEngine.execute(
        rule.executionType,
        rule.executionConfig,
        context
      );

      const timeoutPromise = new Promise<ExecutionResult>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Execution timeout'));
        }, this.config.executionTimeout);
      });

      const result = await Promise.race([executionPromise, timeoutPromise]);

      // Update rule metadata
      rule.lastExecuted = new Date();
      rule.executionCount++;

      if (!result.success) {
        rule.failureCount++;
      }

      this.rules.set(ruleId, rule);

      // Update metrics
      if (this.config.enableMetrics) {
        this.updateMetrics(ruleId, result);
      }

      this.emit('rule:executed', { ruleId, result });

      return result;
    } catch (error) {
      const errorResult: ExecutionResult = {
        ruleId,
        executionId: `exec_${ruleId}_${Date.now()}`,
        success: false,
        timestamp: new Date(),
        duration: 0,
        error: error as Error,
      };

      rule.failureCount++;
      this.rules.set(ruleId, rule);

      this.emit('rule:error', { ruleId, error });

      return errorResult;
    } finally {
      this.activeExecutions.delete(ruleId);
    }
  }

  /**
   * Update rule status
   */
  updateRuleStatus(ruleId: string, status: AutomationStatus): void {
    const rule = this.rules.get(ruleId);

    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    const oldStatus = rule.status;
    rule.status = status;
    rule.updatedAt = new Date();

    this.rules.set(ruleId, rule);

    // Update cron job if needed
    if (rule.triggerType === TriggerType.CRON) {
      if (status === AutomationStatus.ACTIVE) {
        this.cronManager.startJob(ruleId);
      } else {
        this.cronManager.stopJob(ruleId);
      }
    }

    this.emit('rule:status_changed', { ruleId, oldStatus, newStatus: status });
  }

  /**
   * Pause a rule
   */
  pauseRule(ruleId: string): void {
    this.updateRuleStatus(ruleId, AutomationStatus.PAUSED);
  }

  /**
   * Resume a rule
   */
  resumeRule(ruleId: string): void {
    this.updateRuleStatus(ruleId, AutomationStatus.ACTIVE);
  }

  /**
   * Delete a rule
   */
  deleteRule(ruleId: string): void {
    const rule = this.rules.get(ruleId);

    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    // Remove cron job if exists
    if (rule.triggerType === TriggerType.CRON) {
      this.cronManager.removeJob(ruleId);
    }

    this.rules.delete(ruleId);
    this.metrics.delete(ruleId);

    this.emit('rule:deleted', { ruleId });
  }

  /**
   * Get rule by ID
   */
  getRule(ruleId: string): AutomationRule | undefined {
    return this.rules.get(ruleId);
  }

  /**
   * Get all rules
   */
  getAllRules(): AutomationRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Get rules by user
   */
  getRulesByUser(userId: string): AutomationRule[] {
    return Array.from(this.rules.values()).filter(
      rule => rule.userId === userId
    );
  }

  /**
   * Get rule metrics
   */
  getMetrics(ruleId: string): AutomationMetrics | undefined {
    return this.metrics.get(ruleId);
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): AutomationMetrics[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Test rule conditions
   */
  async testRuleConditions(ruleId: string, context: ExecutionContext): Promise<boolean> {
    const rule = this.rules.get(ruleId);

    if (!rule) {
      throw new Error(`Rule not found: ${ruleId}`);
    }

    return this.conditionEvaluator.evaluateConditionGroup(
      rule.conditionGroup,
      context
    );
  }

  /**
   * Get Stellar account info
   */
  async getAccountInfo(publicKey?: string): Promise<any> {
    return await this.executionEngine.getAccountInfo(publicKey);
  }

  /**
   * Update network configuration
   */
  updateNetwork(network: StellarNetwork, sourceSecret?: string): void {
    this.network = network;
    this.config.network = network;

    if (sourceSecret) {
      this.config.sourceSecret = sourceSecret;
    }

    this.executionEngine.updateNetwork(network, sourceSecret);
  }

  /**
   * Validate rule
   */
  private validateRule(rule: AutomationRule): {
    valid: boolean;
    error?: string;
  } {
    if (!rule.id || !rule.name || !rule.userId) {
      return { valid: false, error: 'Missing required fields' };
    }

    const conditionValidation = this.conditionEvaluator.validateConditionGroup(
      rule.conditionGroup
    );

    if (!conditionValidation.valid) {
      return conditionValidation;
    }

    if (rule.triggerType === TriggerType.CRON) {
      if (!rule.cronExpression) {
        return { valid: false, error: 'Cron expression required' };
      }

      if (!this.cronManager.validateExpression(rule.cronExpression)) {
        return { valid: false, error: 'Invalid cron expression' };
      }
    }

    return { valid: true };
  }

  /**
   * Initialize metrics for a rule
   */
  private initializeMetrics(ruleId: string): void {
    this.metrics.set(ruleId, {
      ruleId,
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      successRate: 0,
      totalFeesSpent: '0',
    });
  }

  /**
   * Update metrics after execution
   */
  private updateMetrics(ruleId: string, result: ExecutionResult): void {
    const metrics = this.metrics.get(ruleId);

    if (!metrics) return;

    metrics.totalExecutions++;

    if (result.success) {
      metrics.successfulExecutions++;
      metrics.lastSuccess = result.timestamp;
    } else {
      metrics.failedExecutions++;
      metrics.lastFailure = result.timestamp;
    }

    metrics.lastExecutionTime = result.timestamp;

    // Update average execution time
    const oldAvg = metrics.averageExecutionTime;
    const count = metrics.totalExecutions;
    metrics.averageExecutionTime =
      (oldAvg * (count - 1) + result.duration) / count;

    // Update success rate
    metrics.successRate =
      metrics.successfulExecutions / metrics.totalExecutions;

    this.metrics.set(ruleId, metrics);
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Log events in development
    if (process.env.NODE_ENV === 'development') {
      this.on('rule:registered', data => {
        console.log('Rule registered:', data.rule.id);
      });

      this.on('rule:executed', data => {
        console.log('Rule executed:', data.ruleId, data.result.success);
      });

      this.on('rule:error', data => {
        console.error('Rule error:', data.ruleId, data.error);
      });
    }
  }

  /**
   * Shutdown service
   */
  async shutdown(): Promise<void> {
    this.cronManager.destroy();
    this.removeAllListeners();
  }
}

export default AutomationService;
