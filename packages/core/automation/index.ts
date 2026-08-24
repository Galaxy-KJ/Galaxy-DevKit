export { AutomationService } from './src/services/automation.service.js';
export { ConditionEvaluator } from './src/utils/condition-evaluator.js';
export { ExecutionEngine } from './src/utils/execution-engine.js';
export { CronManager } from './src/utils/cron-manager.js';

export * from './src/types/automation-types.js';

export {
  dcaTemplate,
  gridTemplate,
  stopLossTemplate,
} from './src/templates/index.js';
export type { DCAConfig, GridConfig, StopLossConfig, DcaTemplateResult, GridTemplateResult, StopLossTemplateResult } from './src/templates/index.js';

export { PriceTrigger } from './src/triggers/price-trigger.js';
export type { PriceTriggerConfig } from './src/triggers/price-trigger.js';

export { EventTrigger } from './src/triggers/event-trigger.js';
export type { EventFilter, EventTriggerOptions } from './src/triggers/event-trigger.js';

export { VolumeTrigger, DefaultHorizonFetcher } from './src/triggers/volume-trigger.js';
export type {
  VolumeTrackConfig,
  VolumeCheckResult,
  VolumeTriggerOptions,
  HorizonFetcher,
} from './src/triggers/volume-trigger.js';

export {
  TriggerEvaluator,
  parseActionConfig,
  createDefaultTriggerEvaluator,
} from './src/triggers/trigger-evaluator.js';
export type {
  TriggerEvaluatorDeps,
  PriceTriggerLike,
  VolumeTriggerLike,
} from './src/triggers/trigger-evaluator.js';

export { ExecutionAttemptRegistry } from './src/services/execution-attempt-registry.js';
export type { AttemptStoreClient } from './src/services/execution-attempt-registry.js';

import { AutomationService } from './src/services/automation.service.js';
export default AutomationService;
