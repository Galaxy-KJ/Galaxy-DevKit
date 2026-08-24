/**
 * @fileoverview Unit tests for ExecutionAttemptRegistry
 */

import { ExecutionAttemptRegistry } from '../services/execution-attempt-registry.js';

describe('ExecutionAttemptRegistry', () => {
  let registry: ExecutionAttemptRegistry;

  beforeEach(() => {
    registry = new ExecutionAttemptRegistry();
  });

  it('claims an automation once and rejects a concurrent claim', async () => {
    const first = await registry.tryClaim('auto-1');
    const second = await registry.tryClaim('auto-1');

    expect(first).not.toBeNull();
    expect(first?.status).toBe('pending');
    expect(second).toBeNull();
    expect(registry.isInFlight('auto-1')).toBe(true);
  });

  it('allows overlapping tryClaim races to serialize on in-flight state', async () => {
    const [a, b] = await Promise.all([
      registry.tryClaim('auto-2'),
      registry.tryClaim('auto-2'),
    ]);

    const claimed = [a, b].filter(Boolean);
    expect(claimed).toHaveLength(1);
  });

  it('does not resubmit after a hash is recorded', async () => {
    const attempt = await registry.tryClaim('auto-3');
    expect(attempt).not.toBeNull();

    await registry.markExecuting(attempt!.id);
    await registry.markSubmitted(attempt!.id, 'abc123hash');

    const reused = registry.get(attempt!.id);
    expect(reused?.transactionHash).toBe('abc123hash');
    expect(reused?.status).toBe('submitted');
  });

  it('releases in-flight so a later cycle can claim after resolve', async () => {
    const attempt = await registry.tryClaim('auto-4');
    await registry.markExecuting(attempt!.id);
    await registry.markResolved(attempt!.id, 'hash-4');
    registry.release('auto-4');

    expect(registry.isInFlight('auto-4')).toBe(false);

    const next = await registry.tryClaim('auto-4');
    expect(next).not.toBeNull();
    expect(next?.id).not.toBe(attempt!.id);
  });
});
