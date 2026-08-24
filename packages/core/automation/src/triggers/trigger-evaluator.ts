/**
 * Deterministic dispatcher over persisted `trigger_conditions`.
 *
 * Reuses PriceTrigger, VolumeTrigger, and ConditionEvaluator — it does not
 * reimplement comparison or market-data logic. Event triggers are push-based
 * (EventTrigger.startListening); the poll path therefore returns false.
 */

import {
  ConditionGroup,
  ConditionLogic,
  ConditionOperator,
  ExecutionContext,
  ExecutionType,
  ExecutionConfig,
  StoredAutomation,
  TriggerEvaluationResult,
  TriggerType,
} from '../types/automation-types.js';
import { PriceTriggerConfig } from './price-trigger.js';
import {
  VolumeTrigger,
  VolumeCheckResult,
  VolumeTrackConfig,
} from './volume-trigger.js';
import { ConditionEvaluator } from '../utils/condition-evaluator.js';

export interface PriceTriggerLike {
  evaluate(config: PriceTriggerConfig): Promise<boolean>;
}

export interface VolumeTriggerLike {
  check(config: VolumeTrackConfig): Promise<VolumeCheckResult>;
}

export interface TriggerEvaluatorDeps {
  priceTrigger?: PriceTriggerLike;
  volumeTrigger?: VolumeTriggerLike;
  conditionEvaluator?: ConditionEvaluator;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined;
}

export class TriggerEvaluator {
  private readonly priceTrigger?: PriceTriggerLike;
  private readonly volumeTrigger?: VolumeTriggerLike;
  private readonly conditionEvaluator: ConditionEvaluator;

  constructor(deps: TriggerEvaluatorDeps = {}) {
    this.priceTrigger = deps.priceTrigger;
    this.volumeTrigger = deps.volumeTrigger;
    this.conditionEvaluator = deps.conditionEvaluator ?? new ConditionEvaluator();
  }

  async evaluate(
    triggerConditions: unknown,
    context?: ExecutionContext
  ): Promise<TriggerEvaluationResult> {
    if (triggerConditions === undefined || triggerConditions === null) {
      return {
        met: false,
        triggerType: 'unknown',
        triggerData: { reason: 'missing_trigger_conditions' },
      };
    }

    if (typeof triggerConditions === 'string') {
      try {
        return this.evaluate(JSON.parse(triggerConditions), context);
      } catch {
        return {
          met: false,
          triggerType: 'unknown',
          triggerData: { reason: 'invalid_json_trigger_conditions' },
        };
      }
    }

    const parsed = this.normalize(triggerConditions);

    try {
      switch (parsed.kind) {
        case 'price':
          return this.evaluatePrice(parsed.config);
        case 'volume':
          return this.evaluateVolume(parsed.config);
        case 'event':
          return {
            met: false,
            triggerType: TriggerType.EVENT,
            triggerData: {
              reason: 'event_triggers_are_push_based',
              contractId: parsed.contractId,
              topics: parsed.topics,
            },
          };
        case 'conditionGroup':
          return this.evaluateConditionGroup(parsed.group, context);
        default:
          return {
            met: false,
            triggerType: 'unknown',
            triggerData: { reason: 'unrecognized_trigger_conditions' },
          };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'trigger_evaluation_failed';
      console.error('[TriggerEvaluator] evaluation failed:', message);
      return {
        met: false,
        triggerType: parsed.kind,
        triggerData: { reason: message },
      };
    }
  }

  async evaluateStored(
    automation: StoredAutomation,
    context?: ExecutionContext
  ): Promise<TriggerEvaluationResult> {
    return this.evaluate(automation.trigger_conditions, context);
  }

  private async evaluatePrice(
    config: PriceTriggerConfig
  ): Promise<TriggerEvaluationResult> {
    if (!this.priceTrigger) {
      console.warn(
        '[TriggerEvaluator] price trigger skipped: PriceTrigger is not configured'
      );
      return {
        met: false,
        triggerType: TriggerType.PRICE,
        triggerData: { reason: 'price_trigger_not_configured', ...config },
      };
    }

    const met = await this.priceTrigger.evaluate(config);
    return {
      met,
      triggerType: TriggerType.PRICE,
      triggerData: { ...config },
    };
  }

  private async evaluateVolume(
    config: VolumeTrackConfig
  ): Promise<TriggerEvaluationResult> {
    if (!this.volumeTrigger) {
      console.warn(
        '[TriggerEvaluator] volume trigger skipped: VolumeTrigger is not configured'
      );
      return {
        met: false,
        triggerType: TriggerType.VOLUME,
        triggerData: { reason: 'volume_trigger_not_configured', ...config },
      };
    }

    const result = await this.volumeTrigger.check(config);
    return {
      met: result.triggered,
      triggerType: TriggerType.VOLUME,
      triggerData: {
        poolId: config.poolId,
        threshold24h: config.threshold24h,
        volume24h: result.volume24h,
        tradeCount: result.tradeCount,
        checkedAt: result.checkedAt,
      },
    };
  }

  private async evaluateConditionGroup(
    group: ConditionGroup,
    context?: ExecutionContext
  ): Promise<TriggerEvaluationResult> {
    if (!context) {
      return {
        met: false,
        triggerType: TriggerType.CUSTOM,
        triggerData: { reason: 'missing_execution_context' },
      };
    }

    const met = await this.conditionEvaluator.evaluateConditionGroup(group, context);
    return {
      met,
      triggerType: TriggerType.CUSTOM,
      triggerData: { logic: group.logic },
    };
  }

  private normalize(
    value: unknown
  ):
    | { kind: 'price'; config: PriceTriggerConfig }
    | { kind: 'volume'; config: VolumeTrackConfig }
    | { kind: 'event'; contractId: string; topics: string[] }
    | { kind: 'conditionGroup'; group: ConditionGroup }
    | { kind: 'unknown' } {
    if (Array.isArray(value)) {
      return {
        kind: 'conditionGroup',
        group: {
          logic: ConditionLogic.AND,
          conditions: value as ConditionGroup['conditions'],
        },
      };
    }

    if (!isRecord(value)) {
      return { kind: 'unknown' };
    }

    const typeHint = asString(value.type) ?? asString(value.triggerType);

    if (this.isPriceConfig(value, typeHint)) {
      return {
        kind: 'price',
        config: {
          assetIn: String(value.assetIn ?? value.asset),
          assetOut: String(value.assetOut ?? value.quoteAsset ?? 'USD'),
          condition: this.toPriceCondition(value),
          threshold: String(value.threshold ?? value.value),
        },
      };
    }

    if (this.isVolumeConfig(value, typeHint)) {
      return {
        kind: 'volume',
        config: {
          poolId: String(value.poolId),
          threshold24h: String(value.threshold24h ?? value.threshold),
        },
      };
    }

    if (this.isEventConfig(value, typeHint)) {
      return {
        kind: 'event',
        contractId: String(value.contractId),
        topics: Array.isArray(value.topics)
          ? value.topics.map(topic => String(topic))
          : [],
      };
    }

    if (this.isConditionGroup(value)) {
      return { kind: 'conditionGroup', group: value as unknown as ConditionGroup };
    }

    if (isRecord(value.trigger_conditions)) {
      return this.normalize(value.trigger_conditions);
    }

    if (isRecord(value.conditionGroup)) {
      return this.normalize(value.conditionGroup);
    }

    return { kind: 'unknown' };
  }

  private isPriceConfig(
    value: Record<string, unknown>,
    typeHint?: string
  ): boolean {
    const typed =
      typeHint?.toLowerCase() === 'price' || typeHint === TriggerType.PRICE;
    const hasPair =
      (typeof value.assetIn === 'string' || typeof value.asset === 'string') &&
      (value.threshold !== undefined || value.value !== undefined);
    return typed || (hasPair && (typeof value.condition === 'string' || typeof value.operator === 'string'));
  }

  private isVolumeConfig(
    value: Record<string, unknown>,
    typeHint?: string
  ): boolean {
    const typed =
      typeHint?.toLowerCase() === 'volume' || typeHint === TriggerType.VOLUME;
    return typed || (typeof value.poolId === 'string' && value.threshold24h !== undefined);
  }

  private isEventConfig(
    value: Record<string, unknown>,
    typeHint?: string
  ): boolean {
    const typed =
      typeHint?.toLowerCase() === 'event' || typeHint === TriggerType.EVENT;
    return typed || (typeof value.contractId === 'string' && Array.isArray(value.topics));
  }

  private isConditionGroup(value: Record<string, unknown>): boolean {
    return (
      typeof value.logic === 'string' &&
      (Array.isArray(value.conditions) || Array.isArray(value.groups))
    );
  }

  private toPriceCondition(value: Record<string, unknown>): PriceTriggerConfig['condition'] {
    const raw = asString(value.condition)?.toLowerCase();
    if (raw === 'above' || raw === 'below') {
      return raw;
    }

    const operator = asString(value.operator);
    if (
      operator === ConditionOperator.LESS_THAN ||
      operator === ConditionOperator.LESS_THAN_OR_EQUAL ||
      operator === 'LT' ||
      operator === 'LTE'
    ) {
      return 'below';
    }

    return 'above';
  }
}

export function parseActionConfig(actionConfig: unknown): {
  executionType: ExecutionType;
  executionConfig: ExecutionConfig;
} {
  if (!isRecord(actionConfig)) {
    throw new Error('action_config must be an object');
  }

  const nested = isRecord(actionConfig.executionConfig)
    ? actionConfig.executionConfig
    : actionConfig;

  const executionConfig: ExecutionConfig = {
    paymentConfig: nested.paymentConfig as ExecutionConfig['paymentConfig'],
    swapConfig: nested.swapConfig as ExecutionConfig['swapConfig'],
    contractConfig: nested.contractConfig as ExecutionConfig['contractConfig'],
    tradeConfig: nested.tradeConfig as ExecutionConfig['tradeConfig'],
    webhookUrl: asString(nested.webhookUrl),
    webhookHeaders: isRecord(nested.webhookHeaders)
      ? (nested.webhookHeaders as Record<string, string>)
      : undefined,
    notificationConfig: nested.notificationConfig as ExecutionConfig['notificationConfig'],
    retryAttempts:
      typeof nested.retryAttempts === 'number' ? nested.retryAttempts : undefined,
    retryDelay: typeof nested.retryDelay === 'number' ? nested.retryDelay : undefined,
    baseFee: asString(nested.baseFee),
    timeout: typeof nested.timeout === 'number' ? nested.timeout : undefined,
    memo: asString(nested.memo),
    memoType: nested.memoType as ExecutionConfig['memoType'],
  };

  const typeHint = asString(actionConfig.executionType) ?? asString(actionConfig.type);
  const executionType = parseExecutionType(typeHint, executionConfig);

  return { executionType, executionConfig };
}

function parseExecutionType(
  typeHint: string | undefined,
  config: ExecutionConfig
): ExecutionType {
  const normalized = typeHint?.toUpperCase();
  const values = Object.values(ExecutionType) as string[];
  if (normalized && values.includes(normalized)) {
    return normalized as ExecutionType;
  }

  if (config.paymentConfig) return ExecutionType.STELLAR_PAYMENT;
  if (config.swapConfig) return ExecutionType.STELLAR_SWAP;
  if (config.contractConfig) return ExecutionType.STELLAR_CONTRACT;
  if (config.tradeConfig) return ExecutionType.DEX_TRADE;
  if (config.webhookUrl) return ExecutionType.WEBHOOK;
  if (config.notificationConfig) return ExecutionType.NOTIFICATION;

  throw new Error('Unable to determine execution type from action_config');
}

export function createDefaultTriggerEvaluator(
  deps: TriggerEvaluatorDeps & { horizonUrl?: string } = {}
): TriggerEvaluator {
  return new TriggerEvaluator({
    priceTrigger: deps.priceTrigger,
    volumeTrigger:
      deps.volumeTrigger ?? new VolumeTrigger({ horizonUrl: deps.horizonUrl }),
    conditionEvaluator: deps.conditionEvaluator,
  });
}
