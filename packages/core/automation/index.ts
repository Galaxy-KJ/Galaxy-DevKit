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

import { AutomationService } from './src/services/automation.service.js';
export default AutomationService;
