/**
 * @fileoverview Interactive mode orchestrator for Galaxy CLI
 * @description Top-level `startInteractiveMode()` entry point that launches a
 *   menu-driven guided experience using step-by-step prompts. Implements the
 *   PromptFlow / PromptStep API consumed by wallet-prompts.ts and defi-prompts.ts.
 *
 *   Launch via `galaxy interactive` or `galaxy -i`.
 *
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-06-02
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { Command } from 'commander';
import { WALLET_FLOWS } from './wallet-prompts.js';
import { DEFI_FLOWS } from './defi-prompts.js';

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * Collected answers map — keys are step IDs, values are raw user input.
 */
export type Answers = Record<string, any>;

/**
 * A single step within a prompt flow.
 */
export interface PromptStep {
  /** Unique identifier used as the answers key */
  id: string;
  /**
   * Question text shown to the user.
   * Can be a static string or a function receiving prior answers (for dynamic labels).
   */
  title: string | ((answers: Answers) => string);
  /** Optional helper text displayed beneath the question */
  description?: string;
  /** Input type */
  type: 'input' | 'select' | 'multiselect' | 'confirm' | 'password';
  /** Available choices — required when type is 'select' or 'multiselect' */
  choices?: Array<{ name: string; value: string; default?: boolean }>;
  /**
   * Validation function — return true on success, or an error string.
   * May be async.
   */
  validate?: (value: any) => boolean | string | Promise<boolean | string>;
  /** Static default value */
  default?: string | boolean;
  /** Whether the step is optional (skipped when the user leaves it blank) */
  optional?: boolean;
  /**
   * Condition controlling whether the step is shown.
   * Receives all answers collected so far.
   */
  when?: (answers: Answers) => boolean;
}

/**
 * A complete guided prompt flow consisting of ordered steps and an executor.
 */
export interface PromptFlow {
  /** Human-readable display name */
  name: string;
  /** Ordered list of prompt steps */
  steps: PromptStep[];
  /**
   * Called after all steps have been answered.
   * Receives the full answers map and performs the actual CLI operation.
   */
  execute: (answers: Answers) => Promise<void>;
}

// ─── All registered flows ─────────────────────────────────────────────────────

const ALL_FLOWS: Record<string, PromptFlow> = {
  ...WALLET_FLOWS,
  ...DEFI_FLOWS,
};

// ─── Menu categories ──────────────────────────────────────────────────────────

interface MenuCategory {
  label: string;
  flows: string[]; // flow IDs
}

const MENU_CATEGORIES: MenuCategory[] = [
  {
    label: '🔑  Wallet',
    flows: [
      'wallet-create',
      'wallet-import',
      'wallet-info',
      'wallet-fund',
      'wallet-backup',
      'wallet-send',
    ],
  },
  {
    label: '🏦  Blend Protocol (lending)',
    flows: [
      'blend-supply',
      'blend-withdraw',
      'blend-borrow',
      'blend-repay',
      'blend-position',
    ],
  },
  {
    label: '🔄  Swap (Soroswap)',
    flows: ['swap-quote', 'swap-execute'],
  },
  {
    label: '💧  Liquidity',
    flows: ['liquidity-add', 'liquidity-pools'],
  },
];

const EXIT_SENTINEL = '__EXIT__';
const BACK_SENTINEL = '__BACK__';

// ─── Step execution ───────────────────────────────────────────────────────────

/**
 * Execute a single prompt step using inquirer and return the user's answer.
 * Returns `undefined` if the step is skipped (condition not met or optional + blank).
 */
async function executeStep(
  step: PromptStep,
  answers: Answers,
): Promise<any> {
  // Evaluate conditional display
  if (step.when && !step.when(answers)) return undefined;

  const message =
    typeof step.title === 'function' ? step.title(answers) : step.title;

  // Build the inquirer question descriptor
  const baseQuestion = {
    name: step.id,
    message: step.description ? `${message}\n  ${chalk.dim(step.description)}` : message,
  };

  let question: any;

  switch (step.type) {
    case 'input':
      question = {
        ...baseQuestion,
        type: 'input',
        default: step.default as string | undefined,
        validate: step.validate,
      };
      break;

    case 'password':
      question = {
        ...baseQuestion,
        type: 'password',
        mask: '*',
        validate: step.validate,
      };
      break;

    case 'select':
      question = {
        ...baseQuestion,
        type: 'list',
        choices: step.choices?.map((c) => ({ name: c.name, value: c.value })) ?? [],
        default: step.choices?.find((c) => c.default)?.value ?? step.default,
      };
      break;

    case 'multiselect':
      question = {
        ...baseQuestion,
        type: 'checkbox',
        choices: step.choices?.map((c) => ({
          name: c.name,
          value: c.value,
          checked: c.default ?? false,
        })) ?? [],
      };
      break;

    case 'confirm':
      question = {
        ...baseQuestion,
        type: 'confirm',
        default: typeof step.default === 'boolean' ? step.default : true,
      };
      break;

    default:
      throw new Error(`Unknown step type: ${(step as PromptStep).type}`);
  }

  const result = await inquirer.prompt([question]);
  const value = result[step.id];

  // Skip optional steps left blank
  if (step.optional && (value === '' || value === undefined || value === null)) {
    return undefined;
  }

  return value;
}

// ─── Flow runner ──────────────────────────────────────────────────────────────

/**
 * Run a complete PromptFlow: collect all step answers, show a spinner during
 * execution, then call `flow.execute(answers)`.
 */
export async function runFlow(flow: PromptFlow): Promise<void> {
  console.log(chalk.bold.cyan(`\n  ${flow.name}\n`));

  const answers: Answers = {};

  for (const step of flow.steps) {
    try {
      const answer = await executeStep(step, answers);
      if (answer !== undefined) {
        answers[step.id] = answer;
      }
    } catch (error) {
      const err = error as Error;
      if (
        err.message.includes('User force closed') ||
        err.message.includes('AbortError')
      ) {
        console.log(chalk.yellow('\n  Flow cancelled.\n'));
        return;
      }
      throw err;
    }
  }

  // Execute the flow action
  const spinner = ora('Processing...').start();
  try {
    spinner.stop();
    await flow.execute(answers);
  } catch (error) {
    spinner.fail(chalk.red('Operation failed'));
    console.error(chalk.red(`  Error: ${(error as Error).message}`));
  }
}

// ─── Interactive menu loop ────────────────────────────────────────────────────

/**
 * Launch the interactive guided menu.
 * Presents categories → flows → prompts → confirmation in a loop until the
 * user chooses to exit.
 *
 * @example
 * ```ts
 * // From index.ts:
 * import { startInteractiveMode } from './commands/interactive/interactive.js';
 * await startInteractiveMode();
 * ```
 */
export async function startInteractiveMode(): Promise<void> {
  printWelcome();

  // Top-level category loop
  while (true) {
    const categoryChoice = await selectCategory();
    if (categoryChoice === EXIT_SENTINEL) break;

    const category = MENU_CATEGORIES.find((c) => c.label === categoryChoice);
    if (!category) continue;

    // Sub-menu flow loop
    let backToCategories = false;
    while (!backToCategories) {
      const flowId = await selectFlow(category);

      if (flowId === EXIT_SENTINEL) {
        // Exit from the sub-menu also exits the whole mode
        console.log(chalk.dim('\n  Goodbye! 👋\n'));
        return;
      }

      if (flowId === BACK_SENTINEL) {
        backToCategories = true;
        continue;
      }

      const flow = ALL_FLOWS[flowId];
      if (!flow) {
        console.log(chalk.yellow(`  Unknown flow: ${flowId}`));
        continue;
      }

      await runFlow(flow);
    }
  }

  console.log(chalk.dim('\n  Goodbye! 👋\n'));
}

// ─── Menu helpers ─────────────────────────────────────────────────────────────

async function selectCategory(): Promise<string> {
  console.log(chalk.dim('─'.repeat(52)));

  const choices = [
    ...MENU_CATEGORIES.map((c) => ({ name: c.label, value: c.label })),
    new inquirer.Separator(),
    { name: chalk.red('Exit'), value: EXIT_SENTINEL },
  ];

  try {
    const { choice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'choice',
        message: chalk.bold('  What would you like to do?'),
        choices,
        pageSize: 10,
      },
    ]);
    return choice;
  } catch {
    return EXIT_SENTINEL;
  }
}

async function selectFlow(category: MenuCategory): Promise<string> {
  console.log(chalk.dim('─'.repeat(52)));

  const flowChoices = category.flows
    .map((id) => ALL_FLOWS[id])
    .filter(Boolean)
    .map((flow, i) => ({ name: flow.name, value: category.flows[i] }));

  const choices = [
    ...flowChoices,
    new inquirer.Separator(),
    { name: chalk.yellow('← Back'), value: BACK_SENTINEL },
    { name: chalk.red('Exit'), value: EXIT_SENTINEL },
  ];

  try {
    const { choice } = await inquirer.prompt([
      {
        type: 'list',
        name: 'choice',
        message: chalk.bold(`  ${category.label} — Choose an operation:`),
        choices,
        pageSize: 12,
      },
    ]);
    return choice;
  } catch {
    return EXIT_SENTINEL;
  }
}

// ─── Print helpers ────────────────────────────────────────────────────────────

function printWelcome(): void {
  console.log('');
  console.log(chalk.cyan('  ╔══════════════════════════════════════════╗'));
  console.log(chalk.cyan('  ║') + chalk.bold('   🌌  Galaxy DevKit — Interactive Mode   ') + chalk.cyan('║'));
  console.log(chalk.cyan('  ╚══════════════════════════════════════════╝'));
  console.log(chalk.dim('  Use arrow keys to navigate, Enter to select.'));
  console.log(chalk.dim('  Press Ctrl+C at any time to exit gracefully.\n'));
}

// ─── Register -i / galaxy interactive flag ────────────────────────────────────

/**
 * Register the `-i` shorthand flag on a Commander program so that
 * `galaxy -i` launches interactive mode directly.
 *
 * @param program The root Commander instance (from index.ts)
 */
export function registerInteractiveFlag(program: Command): void {
  program.option('-i, --interactive', 'Launch interactive guided mode');

  // Inject pre-parse check so -i works before subcommand dispatch
  const originalParseAsync = program.parseAsync.bind(program);
  program.parseAsync = async function (argv?: string[], parseOptions?: { from?: string }): Promise<Command> {
    const args = (argv ?? process.argv).slice(2);
    if (args.includes('-i') || args.includes('--interactive')) {
      await startInteractiveMode();
      return program;
    }
    return originalParseAsync(argv, parseOptions);
  };
}
