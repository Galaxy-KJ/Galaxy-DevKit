import { randomUUID } from 'crypto';

/**
 * Generate a unique identifier for an automation rule.
 *
 * Backed by a cryptographically secure UUID, so IDs created in the same
 * millisecond (for example, one per grid level) never collide.
 */
export function generateId(): string {
  return randomUUID();
}
