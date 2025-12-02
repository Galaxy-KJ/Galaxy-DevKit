// Centralized channel name constants for subscriptions and emits
export const CONTRACT_DEPLOYED = 'contract:deployed';
export const CONTRACT_UPDATED = 'contract:updated';
export const CONTRACT_DELETED = 'contract:deleted';
export const CONTRACT_FUNCTION_INVOKED = 'contract:function-invoked';

export const contractScoped = (id: string, event: string) => `contract:${id}:${event}`;

export const AUTOMATION_CREATED = 'automation:created';
export const AUTOMATION_UPDATED = 'automation:updated';
export const AUTOMATION_DELETED = 'automation:deleted';

// Generic helpers
export const EVENT_PREFIX = 'event';
