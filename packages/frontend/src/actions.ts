import { isMainnetReadOnly } from './utils/network';

/**
 * Asserts that the current network is not in read-only mode.
 * Throws an error and provides UI feedback if write operations are disabled.
 */
export function assertWriteOperation(): void {
  if (isMainnetReadOnly()) {
    const message = 'Mainnet is in read-only mode. Write operations are disabled to prevent accidental transactions.';
    alert(message);
    throw new Error(message);
  }
}

/**
 * Wraps an action with a read-only check.
 */
export async function withWriteCheck<T>(action: () => Promise<T>): Promise<T> {
  assertWriteOperation();
  return action();
}
