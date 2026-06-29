/**
 * @fileoverview PromptFlow runner — guided prompt orchestration for the CLI.
 * @description Declarative step-by-step prompt flows with real-time validation,
 *   a summary screen, and a confirmation gate before destructive actions.
 *   Flows execute by emitting a structured argv array that is fed into the
 *   existing Commander program — so business logic is reused, not duplicated.
 * @since 2026-06-28
 */

import inquirer from 'inquirer';
import chalk from 'chalk';

export type PromptStepType =
  | 'input'
  | 'password'
  | 'number'
  | 'confirm'
  | 'list'
  | 'checkbox';

export interface PromptChoice {
  name: string;
  value: string | number | boolean;
  description?: string;
  default?: boolean;
}

export interface PromptStep {
  name: string;
  message: string;
  type: PromptStepType;
  default?: string | number | boolean;
  choices?: PromptChoice[];
  validate?: (value: unknown) => boolean | string | Promise<boolean | string>;
  when?: (answers: Record<string, unknown>) => boolean;
  mask?: string;
}

export type ArgBuilder = (answers: Record<string, unknown>) => string[];

export interface SummaryLine {
  label: string;
  value: string;
}

export type Summarizer = (answers: Record<string, unknown>) => SummaryLine[];

export interface PromptFlow {
  /** Stable id used to register and look up the flow */
  id: string;
  /** Short imperative title shown at the top of the flow */
  title: string;
  /** One-line description shown below the title */
  description: string;
  /** Marks the flow as destructive — forces an explicit confirmation gate */
  destructive?: boolean;
  /** Question steps collected from the user, in order */
  steps: PromptStep[];
  /** Build the Commander argv (e.g. ['wallet', 'send', 'alice', 'G...', '1', 'XLM']) */
  buildArgs: ArgBuilder;
  /** Optional custom summary; falls back to the raw answers if omitted */
  summarize?: Summarizer;
}

/** Function that runs a Commander argv against the existing program. */
export type PromptExecutor = (argv: string[]) => Promise<void>;

/** Inquirer-compatible prompt function — injectable for testing. */
export type PromptFn = typeof inquirer.prompt;

export interface RunPromptFlowOptions {
  /** Override the prompt function (used by tests). */
  prompt?: PromptFn;
  /** Skip the confirmation gate (equivalent to passing -y to the command). */
  yes?: boolean;
  /** Silence summary / header output (used by tests). */
  silent?: boolean;
}

export interface PromptFlowResult {
  cancelled: boolean;
  executed: boolean;
  answers: Record<string, unknown>;
  argv: string[];
  error?: Error;
}

const ABORT_MARKERS = [
  'User force closed',
  'AbortError',
  'force closed the prompt',
];

function isAbortError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return ABORT_MARKERS.some((marker) => err.message.includes(marker));
}

function defaultSummary(answers: Record<string, unknown>): SummaryLine[] {
  return Object.entries(answers)
    .filter(([key]) => !key.startsWith('_'))
    .map(([key, value]) => ({
      label: key,
      value: value === undefined || value === null ? '' : String(value),
    }));
}

function buildInquirerQuestion(step: PromptStep): Record<string, unknown> {
  const base: Record<string, unknown> = {
    name: step.name,
    message: step.message,
    type: step.type,
    default: step.default,
    when: step.when,
    validate: step.validate,
  };

  if (step.type === 'password') {
    base.mask = step.mask ?? '*';
  }

  if (step.type === 'list' || step.type === 'checkbox') {
    base.choices = (step.choices ?? []).map((c) => ({
      name: c.description ? `${c.name} — ${c.description}` : c.name,
      value: c.value,
      checked: c.default,
    }));
  }

  return base;
}

function printHeader(flow: PromptFlow): void {
  console.log('');
  console.log(chalk.cyan(`  ${flow.title}`));
  console.log(chalk.dim(`  ${flow.description}`));
  console.log('');
}

function printSummary(flow: PromptFlow, answers: Record<string, unknown>): void {
  const lines = (flow.summarize ?? defaultSummary)(answers);
  if (lines.length === 0) return;
  console.log('');
  console.log(chalk.bold('  Summary'));
  for (const { label, value } of lines) {
    console.log(`  ${chalk.gray(label.padEnd(12, ' '))} ${value}`);
  }
  console.log('');
}

/**
 * Run a PromptFlow end-to-end.
 *
 * Steps:
 *   1. Print the flow header.
 *   2. Collect each step's answer (validation runs inside inquirer).
 *   3. Print a summary of the collected values.
 *   4. For destructive flows (and when `yes` is not set), require an explicit
 *      "Proceed?" confirmation. Non-destructive flows skip this step.
 *   5. Build argv and hand off to the Commander executor.
 *
 * The function never throws on user cancellation (Ctrl+C / inquirer abort).
 * It returns `{ cancelled: true }` so callers can decide what to do next.
 */
export async function runPromptFlow(
  flow: PromptFlow,
  executor: PromptExecutor,
  options: RunPromptFlowOptions = {},
): Promise<PromptFlowResult> {
  const prompt = options.prompt ?? inquirer.prompt;
  const answers: Record<string, unknown> = {};

  if (!options.silent) printHeader(flow);

  for (const step of flow.steps) {
    if (step.when && !step.when(answers)) continue;
    try {
      const result = await prompt([buildInquirerQuestion(step)] as Parameters<PromptFn>[0]);
      answers[step.name] = (result as Record<string, unknown>)[step.name];
    } catch (err) {
      if (isAbortError(err)) {
        if (!options.silent) console.log(chalk.yellow('\n  Cancelled.\n'));
        return { cancelled: true, executed: false, answers, argv: [] };
      }
      throw err;
    }
  }

  if (!options.silent) printSummary(flow, answers);

  if (flow.destructive && !options.yes) {
    try {
      const confirmAnswer = await prompt([
        {
          name: '_confirm',
          message: 'Proceed?',
          type: 'confirm',
          default: false,
        },
      ] as Parameters<PromptFn>[0]);
      if (!(confirmAnswer as Record<string, boolean>)._confirm) {
        if (!options.silent) console.log(chalk.yellow('  Aborted by user.\n'));
        return { cancelled: true, executed: false, answers, argv: [] };
      }
    } catch (err) {
      if (isAbortError(err)) {
        if (!options.silent) console.log(chalk.yellow('\n  Cancelled.\n'));
        return { cancelled: true, executed: false, answers, argv: [] };
      }
      throw err;
    }
  }

  const argv = flow.buildArgs(answers);

  try {
    await executor(argv);
    return { cancelled: false, executed: true, answers, argv };
  } catch (err) {
    return {
      cancelled: false,
      executed: false,
      answers,
      argv,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

import { WALLET_PROMPTS } from './wallet-prompts.js';
import { DEFI_PROMPTS } from './defi-prompts.js';

export { WALLET_PROMPTS } from './wallet-prompts.js';
export { DEFI_PROMPTS } from './defi-prompts.js';

/** Combined registry of every prompt flow shipped with the CLI. */
export const PROMPT_FLOWS: Record<string, PromptFlow> = {
  ...WALLET_PROMPTS,
  ...DEFI_PROMPTS,
};

export function getPromptFlow(id: string): PromptFlow | undefined {
  return PROMPT_FLOWS[id];
}

export function listPromptFlows(): Array<{ id: string; title: string; description: string }> {
  return Object.values(PROMPT_FLOWS).map((f) => ({
    id: f.id,
    title: f.title,
    description: f.description,
  }));
}
