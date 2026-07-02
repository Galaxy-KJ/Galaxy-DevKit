/**
 * @fileoverview Unit tests for ExecutionChain
 *
 * Convention: tests live in packages/core/automation/__tests__/
 * Run with: jest --testPathPattern=execution-chain
 */

import { jest, describe, it, expect } from '@jest/globals';
import { ExecutionChain, ExecutionStep, ExecutionContext } from '../execution-chain/index.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns a mock executor that resolves with `output` after `delayMs`. */
function mockSuccess(output: unknown = 'ok', delayMs = 0) {
  return jest.fn(async () => {
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    return output;
  });
}

/** Returns a mock executor that rejects with `message`. */
function mockFailure(message = 'step failed') {
  return jest.fn(async () => {
    throw new Error(message);
  });
}

/**
 * Returns an executor that fails the first `failCount` times, then succeeds.
 */
function mockFlaky(failCount: number, output: unknown = 'ok') {
  let calls = 0;
  return jest.fn(async () => {
    calls += 1;
    if (calls <= failCount) throw new Error(`flaky attempt ${calls}`);
    return output;
  });
}

/** Silence console output so tests are clean. */
function silentChain(executors: Record<string, ReturnType<typeof jest.fn>>) {
  return new ExecutionChain(executors, { verbose: false });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ExecutionChain', () => {

  // ── Empty chain ────────────────────────────────────────────────────────────

  describe('empty chain', () => {
    it('returns success with no steps', async () => {
      const chain = silentChain({});
      const result = await chain.execute([]);
      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(0);
      expect(result.totalDurationMs).toBe(0);
    });

    it('executeSteps returns true for empty array', async () => {
      const chain = silentChain({});
      expect(await chain.executeSteps([])).toBe(true);
    });
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  describe('successful chain', () => {
    it('executes all steps sequentially and returns success', async () => {
      const ex1 = mockSuccess('result-1');
      const ex2 = mockSuccess('result-2');
      const ex3 = mockSuccess('result-3');

      const chain = silentChain({ step_a: ex1, step_b: ex2, step_c: ex3 });

      const steps: ExecutionStep[] = [
        { type: 'step_a', params: {} },
        { type: 'step_b', params: {} },
        { type: 'step_c', params: {} },
      ];

      const result = await chain.execute(steps);

      expect(result.success).toBe(true);
      expect(result.failedAtIndex).toBeUndefined();
      expect(result.error).toBeUndefined();
      expect(result.steps).toHaveLength(3);
      expect(result.steps[0].success).toBe(true);
      expect(result.steps[1].success).toBe(true);
      expect(result.steps[2].success).toBe(true);
      expect(result.steps[0].output).toBe('result-1');
      expect(result.steps[1].output).toBe('result-2');
      expect(result.steps[2].output).toBe('result-3');
    });

    it('executeSteps returns true when all steps succeed', async () => {
      const chain = silentChain({ step: mockSuccess() });
      expect(await chain.executeSteps([{ type: 'step', params: {} }])).toBe(true);
    });

    it('calls each executor exactly once in order (no retry)', async () => {
      const callOrder: string[] = [];
      const chain = silentChain({
        first:  jest.fn(async () => { callOrder.push('first');  return 1; }),
        second: jest.fn(async () => { callOrder.push('second'); return 2; }),
        third:  jest.fn(async () => { callOrder.push('third');  return 3; }),
      });

      await chain.execute([
        { type: 'first',  params: {} },
        { type: 'second', params: {} },
        { type: 'third',  params: {} },
      ]);

      expect(callOrder).toEqual(['first', 'second', 'third']);
    });

    it('passes step params to executor', async () => {
      const executor = jest.fn(async (step: ExecutionStep, ctx: ExecutionContext) => step.params.value);
      const chain = silentChain({ compute: executor });

      const result = await chain.execute([
        { type: 'compute', params: { value: 42 } },
      ]);

      expect(executor).toHaveBeenCalledWith(
        expect.objectContaining({ params: { value: 42 } }),
        expect.any(Object),
      );
      expect(result.steps[0].output).toBe(42);
    });

    it('records durationMs > 0 for each step', async () => {
      const chain = silentChain({ slow: mockSuccess('done', 10) });
      const result = await chain.execute([{ type: 'slow', params: {} }]);
      expect(result.steps[0].durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  // ── Context threading ──────────────────────────────────────────────────────

  describe('context threading', () => {
    it('threads output from step N to step N+1 via context.outputs', async () => {
      const receivedContexts: ExecutionContext[] = [];

      const chain = silentChain({
        produce: jest.fn(async (_step, ctx) => {
          receivedContexts.push(JSON.parse(JSON.stringify(ctx)));
          return 'produced-value';
        }),
        consume: jest.fn(async (_step, ctx) => {
          receivedContexts.push(JSON.parse(JSON.stringify(ctx)));
          return ctx.outputs['produce'];
        }),
      });

      const result = await chain.execute([
        { type: 'produce', params: {} },
        { type: 'consume', params: {} },
      ]);

      expect(result.success).toBe(true);
      // After step 1 completes, its output must be in context for step 2
      expect(receivedContexts[1].outputs['produce']).toBe('produced-value');
      expect(result.steps[1].output).toBe('produced-value');
    });

    it('uses step label as context key when label is provided', async () => {
      const capturedCtx: ExecutionContext[] = [];

      const chain = silentChain({
        step_type: jest.fn(async (_s, ctx) => {
          capturedCtx.push(JSON.parse(JSON.stringify(ctx)));
          return 'value';
        }),
        reader: jest.fn(async (_s, ctx) => ctx.outputs['my-label']),
      });

      const result = await chain.execute([
        { type: 'step_type', label: 'my-label', params: {} },
        { type: 'reader',    params: {} },
      ]);

      expect(result.success).toBe(true);
      expect(result.steps[1].output).toBe('value');
    });
  });

  // ── Failure and halt ───────────────────────────────────────────────────────

  describe('failure handling', () => {
    it('halts the chain at the failing step', async () => {
      const ex1 = mockSuccess();
      const ex2 = mockFailure('boom');
      const ex3 = mockSuccess();

      const chain = silentChain({ a: ex1, b: ex2, c: ex3 });

      const result = await chain.execute([
        { type: 'a', params: {} },
        { type: 'b', params: {} },
        { type: 'c', params: {} },
      ]);

      expect(result.success).toBe(false);
      expect(result.failedAtIndex).toBe(1);
      expect(result.error?.message).toBe('boom');
      // Only steps a and b were attempted
      expect(result.steps).toHaveLength(2);
      expect(ex3).not.toHaveBeenCalled();
    });

    it('executeSteps returns false when a step fails', async () => {
      const chain = silentChain({ bad: mockFailure() });
      expect(await chain.executeSteps([{ type: 'bad', params: {} }])).toBe(false);
    });

    it('records error on the failing step result', async () => {
      const chain = silentChain({ fail: mockFailure('specific error') });
      const result = await chain.execute([{ type: 'fail', params: {} }]);
      expect(result.steps[0].success).toBe(false);
      expect(result.steps[0].error?.message).toBe('specific error');
    });

    it('marks successful steps before the failure as success=true', async () => {
      const chain = silentChain({
        ok:   mockSuccess(),
        fail: mockFailure(),
      });
      const result = await chain.execute([
        { type: 'ok',   params: {} },
        { type: 'fail', params: {} },
      ]);
      expect(result.steps[0].success).toBe(true);
      expect(result.steps[1].success).toBe(false);
    });

    it('returns error for unregistered step type', async () => {
      const chain = silentChain({});
      const result = await chain.execute([{ type: 'unknown', params: {} }]);
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('unknown');
      expect(result.failedAtIndex).toBe(0);
    });

    it('handles executor throwing a non-Error value', async () => {
      const chain = silentChain({
        bad: jest.fn(async () => { throw 'string error'; }),  // eslint-disable-line @typescript-eslint/only-throw-error
      });
      const result = await chain.execute([{ type: 'bad', params: {} }]);
      expect(result.success).toBe(false);
      expect(result.steps[0].error).toBeInstanceOf(Error);
      expect(result.steps[0].error?.message).toBe('string error');
    });
  });

  // ── Retry ──────────────────────────────────────────────────────────────────

  describe('retry behaviour', () => {
    it('retries a flaky step and eventually succeeds', async () => {
      const executor = mockFlaky(2, 'finally!');
      const chain = new ExecutionChain(
        { flaky: executor },
        { defaultRetryAttempts: 3, defaultRetryDelayMs: 0, verbose: false },
      );

      const result = await chain.execute([{ type: 'flaky', params: {} }]);

      expect(result.success).toBe(true);
      expect(result.steps[0].retriesUsed).toBe(2);
      expect(result.steps[0].output).toBe('finally!');
      expect(executor).toHaveBeenCalledTimes(3); // 2 failures + 1 success
    });

    it('exhausts retries and marks step as failed', async () => {
      const executor = mockFlaky(10, 'ok');
      const chain = new ExecutionChain(
        { flaky: executor },
        { defaultRetryAttempts: 2, defaultRetryDelayMs: 0, verbose: false },
      );

      const result = await chain.execute([{ type: 'flaky', params: {} }]);

      expect(result.success).toBe(false);
      expect(executor).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it('honours per-step retryAttempts over chain default', async () => {
      const executor = mockFlaky(1, 'ok');
      const chain = new ExecutionChain(
        { flaky: executor },
        { defaultRetryAttempts: 0, defaultRetryDelayMs: 0, verbose: false },
      );

      // Chain default = 0 retries but step overrides to 1 retry
      const result = await chain.execute([
        { type: 'flaky', params: {}, retryAttempts: 1, retryDelayMs: 0 },
      ]);

      expect(result.success).toBe(true);
      expect(executor).toHaveBeenCalledTimes(2);
    });

    it('records retriesUsed = 0 when step succeeds on first attempt', async () => {
      const chain = silentChain({ ok: mockSuccess() });
      const result = await chain.execute([{ type: 'ok', params: {} }]);
      expect(result.steps[0].retriesUsed).toBe(0);
    });
  });

  // ── registerExecutor ───────────────────────────────────────────────────────

  describe('registerExecutor', () => {
    it('allows adding an executor after construction', async () => {
      const chain = silentChain({});
      chain.registerExecutor('dynamic', mockSuccess('dynamic-out'));

      const result = await chain.execute([{ type: 'dynamic', params: {} }]);
      expect(result.success).toBe(true);
      expect(result.steps[0].output).toBe('dynamic-out');
    });

    it('overwrites an existing executor', async () => {
      const chain = silentChain({ op: mockFailure('old') });
      chain.registerExecutor('op', mockSuccess('new'));

      const result = await chain.execute([{ type: 'op', params: {} }]);
      expect(result.success).toBe(true);
      expect(result.steps[0].output).toBe('new');
    });
  });

  // ── Real-world scenario: Blend → Soroswap → Vault ─────────────────────────

  describe('DeFi pipeline simulation', () => {
    it('executes blend_withdraw → soroswap_swap → vault_deposit successfully', async () => {
      const blendWithdraw  = jest.fn(async () => ({ txHash: 'hash-1', amount: '100' }));
      const soroswapSwap   = jest.fn(async (_s: ExecutionStep, ctx: ExecutionContext) => {
        const prev = ctx.outputs['blend_withdraw'] as { amount: string };
        return { txHash: 'hash-2', received: prev.amount, asset: 'XLM' };
      });
      const vaultDeposit   = jest.fn(async (_s: ExecutionStep, ctx: ExecutionContext) => {
        const prev = ctx.outputs['soroswap_swap'] as { received: string; asset: string };
        return { txHash: 'hash-3', deposited: prev.received, asset: prev.asset };
      });

      const chain = silentChain({
        blend_withdraw:  blendWithdraw,
        soroswap_swap:   soroswapSwap,
        vault_deposit:   vaultDeposit,
      });

      const steps: ExecutionStep[] = [
        {
          type: 'blend_withdraw',
          label: 'blend_withdraw',
          params: { poolId: 'blend-1', amount: '100', asset: 'USDC' },
        },
        {
          type: 'soroswap_swap',
          label: 'soroswap_swap',
          params: { from: 'USDC', to: 'XLM', slippage: '0.5' },
        },
        {
          type: 'vault_deposit',
          label: 'vault_deposit',
          params: { vaultId: 'vault-1' },
        },
      ];

      const result = await chain.execute(steps);

      expect(result.success).toBe(true);
      expect(result.steps).toHaveLength(3);
      expect((result.steps[2].output as { deposited: string }).deposited).toBe('100');
      expect((result.steps[2].output as { asset: string }).asset).toBe('XLM');
    });

    it('halts after soroswap_swap fails and does not call vault_deposit', async () => {
      const vaultDeposit = mockSuccess();
      const chain = silentChain({
        blend_withdraw: mockSuccess({ txHash: 'hash-1' }),
        soroswap_swap:  mockFailure('insufficient liquidity'),
        vault_deposit:  vaultDeposit,
      });

      const result = await chain.execute([
        { type: 'blend_withdraw', params: {} },
        { type: 'soroswap_swap',  params: {} },
        { type: 'vault_deposit',  params: {} },
      ]);

      expect(result.success).toBe(false);
      expect(result.failedAtIndex).toBe(1);
      expect(result.error?.message).toBe('insufficient liquidity');
      expect(vaultDeposit).not.toHaveBeenCalled();
    });
  });
});