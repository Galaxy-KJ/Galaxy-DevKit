# @galaxy-kj/core-automation

Automation engine for scheduling and executing Stellar and DeFi workflows.

## Price-triggered automations

`AutomationService` now supports live oracle-backed price evaluation for
automations that use `type: 'price'` conditions.

### Configure the service

```ts
import { AutomationService, TriggerType } from '@galaxy-kj/core-automation';
import { OracleAggregator } from '@galaxy-kj/core-oracles';

const oracle = new OracleAggregator();
const automationService = new AutomationService({
  oracle,
});
```

### Start polling for price rules

```ts
await automationService.startPriceMonitoring(30_000);
```

This polling loop:

- fetches live prices for the assets referenced by active `TriggerType.PRICE`
  rules
- populates `ExecutionContext.priceContext`
- evaluates `PRICE_ABOVE` / `PRICE_BELOW` style conditions against the live
  price map
- executes matching rules through the normal automation pipeline

### Fallback behavior

If no oracle is configured, non-price automations continue to work normally.
Price conditions simply evaluate to `false` unless a caller provides
`ExecutionContext.priceContext` explicitly.
