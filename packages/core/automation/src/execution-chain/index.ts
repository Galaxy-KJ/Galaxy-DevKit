/**
 * @fileoverview Multi-step execution chain engine
 * @description Chains multiple transactions and DeFi interactions into a single
 *              sequential pipeline (e.g. withdraw Blend → swap on Soroswap →
 *              deposit to yield vault) with per-step retry and graceful failure
 *              handling.
 *
 * Roadmap item #50 / Issue #304.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** A single step in an execution pipeline. */
export interface ExecutionStep {
  /** Logical name for the step type (e.g. 'blend_withdraw', 'soroswap_swap'). */
  type: string;
  /** Arbitrary parameters forwarded to the step executor. */
  params: Record<string, unknown>;
  /**
   * Optional human-readable label used in logs and results.
   * Defaults to `type` when omitted.
   */
  label?: string;
  /** Per-step retry attempts (overrides chain-level default). */
  retryAttempts?: number;
  /** Per-step delay between retries in milliseconds. */
  retryDelayMs?: number;
}

/** Outcome of a single executed step. */
export interface StepResult {
  /** Zero-based index of this step in the chain. */
  index: number;
  type: string;
  label: string;
  success: boolean;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  /** Value returned by the executor on success. */
  output?: unknown;
  /** Error thrown by the executor on failure. */
  error?: Error;
  /** Number of retry attempts consumed (0 = succeeded on first try). */
  retriesUsed: number;
}

/** Aggregate result of a complete chain execution. */
export interface ChainResult {
  /** `true` only when every step succeeded. */
  success: boolean;
  /** Total wall-clock duration of the entire chain in milliseconds. */
  totalDurationMs: number;
  /** Ordered results for every step that was attempted. */
  steps: StepResult[];
  /**
   * Index of the step that caused the chain to halt, or `undefined` when
   * the chain completed successfully.
   */
  failedAtIndex?: number;
  /** Convenience reference to the error of the failing step. */
  error?: Error;
}

/**
 * Function that carries out the work for one step.
 *
 * Receives the step definition and the accumulated `context` object so
 * executors can pass data forward (e.g. a transaction hash produced by step 1
 * can be read by step 2).
 *
 * Should throw (or return a rejected Promise) to signal failure.
 */
export type StepExecutor = (
  step: ExecutionStep,
  context: ExecutionContext,
) => Promise<unknown>;

/**
 * Mutable context object threaded through every step.
 * Executors may write named outputs here so subsequent steps can consume them.
 */
export interface ExecutionContext {
  /** Outputs keyed by step label (or type when no label was given). */
  outputs: Record<string, unknown>;
  /** ISO-8601 timestamp when the chain started. */
  startedAt: string;
  /** Arbitrary metadata set by the caller when building the chain. */
  metadata: Record<string, unknown>;
}

/** Configuration options for an `ExecutionChain` instance. */
export interface ExecutionChainOptions {
  /**
   * Default number of retry attempts per step.
   * A value of `0` means each step is tried exactly once.
   * @default 0
   */
  defaultRetryAttempts?: number;
  /**
   * Default delay between retry attempts in milliseconds.
   * @default 500
   */
  defaultRetryDelayMs?: number;
  /**
   * Whether to emit `console.warn` / `console.error` logs during execution.
   * Disable in unit tests to keep output clean.
   * @default true
   */
  verbose?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

// ── ExecutionChain ────────────────────────────────────────────────────────────

/**
 * Orchestrates a sequential pipeline of {@link ExecutionStep}s.
 *
 * @example
 * ```ts
 * const chain = new ExecutionChain(
 *   {
 *     blend_withdraw:  async (step) => { ... },
 *     soroswap_swap:   async (step) => { ... },
 *     vault_deposit:   async (step) => { ... },
 *   },
 *   { defaultRetryAttempts: 2, defaultRetryDelayMs: 1000 },
 * );
 *
 * const result = await chain.executeSteps([
 *   { type: 'blend_withdraw', params: { amount: '100', asset: 'USDC' } },
 *   { type: 'soroswap_swap',  params: { from: 'USDC', to: 'XLM' } },
 *   { type: 'vault_deposit',  params: { amount: '95',  asset: 'XLM' } },
 * ]);
 *
 * console.log(result.success, result.steps);
 * ```
 */
export class ExecutionChain {
  private readonly executors: Record<string, StepExecutor>;
  private readonly defaultRetryAttempts: number;
  private readonly defaultRetryDelayMs: number;
  private readonly verbose: boolean;

  /**
   * @param executors  Map of step `type` → async executor function.
   * @param options    Chain-level configuration.
   */
  constructor(
    executors: Record<string, StepExecutor> = {},
    options: ExecutionChainOptions = {},
  ) {
    this.executors = executors;
    this.defaultRetryAttempts = options.defaultRetryAttempts ?? 0;
    this.defaultRetryDelayMs = options.defaultRetryDelayMs ?? 500;
    this.verbose = options.verbose ?? true;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Register (or overwrite) an executor for a given step type at runtime.
   */
  registerExecutor(type: string, executor: StepExecutor): void {
    this.executors[type] = executor;
  }

  /**
   * Execute `steps` sequentially.
   *
   * - On **success** the method returns `true` and a full {@link ChainResult}.
   * - On **failure** at any step, execution halts immediately.  Rollback is
   *   intentionally the caller's responsibility (a warning is logged listing
   *   the steps that already succeeded so the caller can compensate).
   *
   * Returns `true` when all steps pass, `false` otherwise.
   */
  async executeSteps(steps: ExecutionStep[]): Promise<boolean> {
    const result = await this.execute(steps);
    return result.success;
  }

  /**
   * Execute `steps` sequentially and return the full {@link ChainResult}.
   *
   * Prefer this method when you need per-step diagnostics.
   */
  async execute(steps: ExecutionStep[]): Promise<ChainResult> {
    if (steps.length === 0) {
      return {
        success: true,
        totalDurationMs: 0,
        steps: [],
      };
    }

    const chainStart = Date.now();
    const context: ExecutionContext = {
      outputs: {},
      startedAt: new Date().toISOString(),
      metadata: {},
    };
    const stepResults: StepResult[] = [];

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      const label = step.label ?? step.type;
      const maxRetries = step.retryAttempts ?? this.defaultRetryAttempts;
      const retryDelayMs = step.retryDelayMs ?? this.defaultRetryDelayMs;

      const executor = this.executors[step.type];
      if (!executor) {
        const err = new Error(
          `No executor registered for step type "${step.type}" (index ${i}, label "${label}")`,
        );
        const stepResult: StepResult = {
          index: i,
          type: step.type,
          label,
          success: false,
          durationMs: 0,
          error: err,
          retriesUsed: 0,
        };
        stepResults.push(stepResult);

        this.logFailure(label, i, err, stepResults);

        return {
          success: false,
          totalDurationMs: Date.now() - chainStart,
          steps: stepResults,
          failedAtIndex: i,
          error: err,
        };
      }

      const stepResult = await this.runWithRetry(
        step,
        label,
        i,
        executor,
        context,
        maxRetries,
        retryDelayMs,
      );

      stepResults.push(stepResult);

      if (!stepResult.success) {
        this.logFailure(label, i, stepResult.error!, stepResults);

        return {
          success: false,
          totalDurationMs: Date.now() - chainStart,
          steps: stepResults,
          failedAtIndex: i,
          error: stepResult.error,
        };
      }

      // Make output available to subsequent steps via context.
      context.outputs[label] = stepResult.output;

      if (this.verbose) {
        console.log(
          `[ExecutionChain] ✓ step ${i + 1}/${steps.length} "${label}" completed in ${stepResult.durationMs}ms`,
        );
      }
    }

    const totalDurationMs = Date.now() - chainStart;

    if (this.verbose) {
      console.log(
        `[ExecutionChain] ✓ chain completed — ${steps.length} step(s) in ${totalDurationMs}ms`,
      );
    }

    return {
      success: true,
      totalDurationMs,
      steps: stepResults,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async runWithRetry(
    step: ExecutionStep,
    label: string,
    index: number,
    executor: StepExecutor,
    context: ExecutionContext,
    maxRetries: number,
    retryDelayMs: number,
  ): Promise<StepResult> {
    let lastError: Error | undefined;
    let retriesUsed = 0;
    const stepStart = Date.now();

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        retriesUsed = attempt;
        if (this.verbose) {
          console.warn(
            `[ExecutionChain] ↺ retrying step "${label}" (attempt ${attempt}/${maxRetries}) after ${retryDelayMs}ms`,
          );
        }
        await sleep(retryDelayMs);
      }

      try {
        const output = await executor(step, context);
        return {
          index,
          type: step.type,
          label,
          success: true,
          durationMs: Date.now() - stepStart,
          output,
          retriesUsed,
        };
      } catch (err) {
        lastError = toError(err);
        if (this.verbose) {
          console.warn(
            `[ExecutionChain] ✗ step "${label}" attempt ${attempt + 1} failed: ${lastError.message}`,
          );
        }
      }
    }

    return {
      index,
      type: step.type,
      label,
      success: false,
      durationMs: Date.now() - stepStart,
      error: lastError,
      retriesUsed,
    };
  }

  private logFailure(
    label: string,
    failedIndex: number,
    error: Error,
    completedSteps: StepResult[],
  ): void {
    if (!this.verbose) return;

    const succeeded = completedSteps
      .filter((s) => s.success)
      .map((s) => `"${s.label}"`)
      .join(', ');

    console.error(
      `[ExecutionChain] ✗ chain halted at step ${failedIndex + 1} "${label}": ${error.message}`,
    );

    if (succeeded) {
      console.warn(
        `[ExecutionChain] ⚠ the following steps already completed and may need manual rollback: ${succeeded}`,
      );
    }
  }
}

// ── Tests (Jest) ──────────────────────────────────────────────────────────────

// Tests live in a separate __tests__ file per the project convention
// (see packages/core/automation/__tests__/execution-chain.test.ts).