/**
 * @fileoverview Interactive menu definitions and guided prompt flows for Galaxy CLI
 * @description Provides a menu-driven REPL experience using inquirer. Users navigate
 *   a top-level command menu, fill in parameters interactively, and see formatted results.
 *   Supports graceful Ctrl+C aborts and smooth Back navigation via a state machine.
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-04-23
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import { Command } from 'commander';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MenuParam {
  name: string;
  message: string;
  type: 'input' | 'number' | 'confirm' | 'list' | 'password';
  default?: string | number | boolean;
  choices?: string[];
  validate?: (value: string) => boolean | string;
}

export interface MenuEntry {
  /** Display label shown in the list */
  label: string;
  /** CLI command string to execute, e.g. "account info" */
  command?: string;
  /** Parameters to collect before running the command */
  params?: MenuParam[];
  /** Nested submenu entries */
  children?: MenuEntry[];
  /** Human-readable description shown as a hint */
  description?: string;
}

/** Internal state machine states */
type MenuState =
  | { tag: 'root' }
  | { tag: 'submenu'; parent: MenuEntry; entries: MenuEntry[] }
  | { tag: 'params'; entry: MenuEntry }
  | { tag: 'done' };

// ─── Menu definitions ─────────────────────────────────────────────────────────

/** Sentinel value used for the Back / Exit choices */
const BACK = '__BACK__';
const EXIT = '__EXIT__';

/**
 * Top-level menu structure.
 * Extend this array to register new commands in the interactive UI.
 */
export const ROOT_MENU: MenuEntry[] = [
  {
    label: '🔑  Account',
    description: 'Manage Stellar accounts and keypairs',
    children: [
      {
        label: 'Show account info',
        command: 'account info',
        params: [
          {
            name: 'address',
            message: 'Stellar account address (G…):',
            type: 'input',
            validate: (v) =>
              v.startsWith('G') && v.length === 56
                ? true
                : 'Enter a valid Stellar public key (56 chars, starts with G)',
          },
        ],
      },
      {
        label: 'Generate new keypair',
        command: 'account generate',
      },
      {
        label: 'Fund account (testnet friendbot)',
        command: 'account fund',
        params: [
          {
            name: 'address',
            message: 'Account address to fund:',
            type: 'input',
            validate: (v) =>
              v.startsWith('G') && v.length === 56
                ? true
                : 'Enter a valid Stellar public key',
          },
        ],
      },
    ],
  },
  {
    label: '💸  Payments',
    description: 'Send payments and manage assets',
    children: [
      {
        label: 'Send XLM payment',
        command: 'payment send',
        params: [
          {
            name: 'from',
            message: 'Source account (G…):',
            type: 'input',
            validate: (v) => (v.length > 0 ? true : 'Required'),
          },
          {
            name: 'to',
            message: 'Destination account (G…):',
            type: 'input',
            validate: (v) => (v.length > 0 ? true : 'Required'),
          },
          {
            name: 'amount',
            message: 'Amount (XLM):',
            type: 'number',
            validate: (v) => (Number(v) > 0 ? true : 'Must be a positive number'),
          },
          {
            name: 'memo',
            message: 'Memo (optional):',
            type: 'input',
            default: '',
          },
        ],
      },
      {
        label: 'Check payment history',
        command: 'payment history',
        params: [
          {
            name: 'address',
            message: 'Account address:',
            type: 'input',
            validate: (v) => (v.length > 0 ? true : 'Required'),
          },
          {
            name: 'limit',
            message: 'Number of records:',
            type: 'number',
            default: 10,
          },
        ],
      },
    ],
  },
  {
    label: '🌊  DeFi / Liquidity',
    description: 'Interact with AMMs, liquidity pools, and swap protocols',
    children: [
      {
        label: 'List liquidity pools',
        command: 'defi pools',
        params: [
          {
            name: 'asset',
            message: 'Filter by asset (leave blank for all):',
            type: 'input',
            default: '',
          },
        ],
      },
      {
        label: 'Swap assets',
        command: 'defi swap',
        params: [
          {
            name: 'sell',
            message: 'Asset to sell (e.g. XLM):',
            type: 'input',
            validate: (v) => (v.length > 0 ? true : 'Required'),
          },
          {
            name: 'buy',
            message: 'Asset to buy (e.g. USDC):',
            type: 'input',
            validate: (v) => (v.length > 0 ? true : 'Required'),
          },
          {
            name: 'amount',
            message: 'Amount to sell:',
            type: 'number',
            validate: (v) => (Number(v) > 0 ? true : 'Must be positive'),
          },
          {
            name: 'slippage',
            message: 'Max slippage % (e.g. 0.5):',
            type: 'number',
            default: 0.5,
          },
        ],
      },
      {
        label: 'Add liquidity',
        command: 'defi add-liquidity',
        params: [
          {
            name: 'pool',
            message: 'Pool ID or asset pair (e.g. XLM/USDC):',
            type: 'input',
            validate: (v) => (v.length > 0 ? true : 'Required'),
          },
          {
            name: 'amount',
            message: 'Amount to deposit:',
            type: 'number',
            validate: (v) => (Number(v) > 0 ? true : 'Must be positive'),
          },
        ],
      },
    ],
  },
  {
    label: '🔮  Oracles',
    description: 'Read price feeds and oracle data',
    children: [
      {
        label: 'Get asset price',
        command: 'oracle price',
        params: [
          {
            name: 'asset',
            message: 'Asset symbol (e.g. XLM, BTC):',
            type: 'input',
            validate: (v) => (v.length > 0 ? true : 'Required'),
          },
        ],
      },
      {
        label: 'List supported assets',
        command: 'oracle assets',
      },
    ],
  },
  {
    label: '⚙️   Network',
    description: 'Switch networks and inspect ledger state',
    children: [
      {
        label: 'Switch network',
        command: 'network switch',
        params: [
          {
            name: 'network',
            message: 'Select network:',
            type: 'list',
            choices: ['mainnet', 'testnet', 'futurenet', 'localnet'],
            default: 'testnet',
          },
        ],
      },
      {
        label: 'Show current network',
        command: 'network current',
      },
      {
        label: 'Ledger info',
        command: 'network ledger',
      },
    ],
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Print a subtle horizontal rule */
function hr(): void {
  console.log(chalk.dim('─'.repeat(52)));
}

/** Build the choices array for an inquirer list prompt from MenuEntry[] */
function buildChoices(entries: MenuEntry[]): Array<{ name: string; value: string }> {
  return entries.map((e, i) => ({
    name: e.description
      ? `${e.label}  ${chalk.dim(e.description)}`
      : e.label,
    value: String(i),
  }));
}

/**
 * Collect parameter values for a MenuEntry interactively.
 * Returns the collected answers, or null if the user aborted (Ctrl+C).
 */
async function collectParams(
  entry: MenuEntry,
): Promise<Record<string, unknown> | null> {
  if (!entry.params || entry.params.length === 0) return {};

  console.log(chalk.cyan(`\n  Configure: ${entry.label}\n`));

  const questions = entry.params.map((p) => ({
    name: p.name,
    message: `  ${p.message}`,
    type: p.type,
    default: p.default,
    choices: p.choices,
    validate: p.validate,
  }));

  try {
    const answers = await inquirer.prompt(questions as Parameters<typeof inquirer.prompt>[0]);
    return answers as Record<string, unknown>;
  } catch (err: unknown) {
    // inquirer throws when the user force-exits via Ctrl+C
    if (isAbortError(err)) return null;
    throw err;
  }
}

/** Detect Ctrl+C / SIGINT signals thrown by inquirer */
function isAbortError(err: unknown): boolean {
  if (err instanceof Error) {
    return (
      err.message.includes('User force closed') ||
      err.message.includes('AbortError') ||
      (err as Error & { isTtyError?: boolean }).isTtyError === true
    );
  }
  return false;
}

/**
 * Build the CLI command string from a MenuEntry and collected params.
 * e.g. "payment send --from G... --to G... --amount 10"
 */
function buildCommandString(
  entry: MenuEntry,
  params: Record<string, unknown>,
): string {
  if (!entry.command) return '';
  const flags = Object.entries(params)
    .filter(([, v]) => v !== '' && v !== undefined)
    .map(([k, v]) => `--${k} ${String(v)}`)
    .join(' ');
  return flags ? `${entry.command} ${flags}` : entry.command;
}

// ─── State machine ────────────────────────────────────────────────────────────

/**
 * Run the interactive menu loop.
 *
 * The loop is driven by a simple state machine:
 *   root → (select category) → submenu → (select action) → params → execute → submenu
 *
 * At any point the user can go Back or press Ctrl+C to abort gracefully.
 *
 * @param executor  Async function that runs a CLI command string.
 *                  Receives the full command like "payment send --to G… --amount 10".
 */
export async function runInteractiveMenus(
  executor: (command: string) => Promise<void>,
): Promise<void> {
  printWelcome();

  let state: MenuState = { tag: 'root' };

  while (state.tag !== 'done') {
    try {
      state = await step(state, executor);
    } catch (err: unknown) {
      if (isAbortError(err)) {
        printAbort();
        return;
      }
      throw err;
    }
  }

  console.log(chalk.dim('\n  Goodbye! 👋\n'));
}

/**
 * Advance the state machine by one step.
 */
async function step(
  state: MenuState,
  executor: (command: string) => Promise<void>,
): Promise<MenuState> {
  switch (state.tag) {
    case 'root':
      return stepRoot();

    case 'submenu':
      return stepSubmenu(state, executor);

    case 'done':
      return state;
  }
}

/** Handle the root (category selection) state */
async function stepRoot(): Promise<MenuState> {
  hr();

  const choices = [
    ...buildChoices(ROOT_MENU),
    new inquirer.Separator(),
    { name: chalk.red('Exit'), value: EXIT },
  ];

  let answer: { choice: string };
  try {
    answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'choice',
        message: chalk.bold('  Galaxy DevKit — What would you like to do?'),
        choices,
        pageSize: 12,
      },
    ]);
  } catch (err) {
    if (isAbortError(err)) return { tag: 'done' };
    throw err;
  }

  if (answer.choice === EXIT) return { tag: 'done' };

  const selected = ROOT_MENU[Number(answer.choice)];

  // If the entry has no children, treat it as a direct action
  if (!selected.children || selected.children.length === 0) {
    await executeEntry(selected, executor);
    return { tag: 'root' };
  }

  return { tag: 'submenu', parent: selected, entries: selected.children };
}

/** Handle the submenu (action selection within a category) state */
async function stepSubmenu(
  state: Extract<MenuState, { tag: 'submenu' }>,
  executor: (command: string) => Promise<void>,
): Promise<MenuState> {
  hr();

  const choices = [
    ...buildChoices(state.entries),
    new inquirer.Separator(),
    { name: chalk.yellow('← Back'), value: BACK },
    { name: chalk.red('Exit'), value: EXIT },
  ];

  let answer: { choice: string };
  try {
    answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'choice',
        message: chalk.bold(`  ${state.parent.label} — Choose an action:`),
        choices,
        pageSize: 10,
      },
    ]);
  } catch (err) {
    if (isAbortError(err)) return { tag: 'done' };
    throw err;
  }

  if (answer.choice === BACK) return { tag: 'root' };
  if (answer.choice === EXIT) return { tag: 'done' };

  const selected = state.entries[Number(answer.choice)];

  // Nested submenu support (one extra level)
  if (selected.children && selected.children.length > 0) {
    return { tag: 'submenu', parent: selected, entries: selected.children };
  }

  await executeEntry(selected, executor);

  // Return to the same submenu after executing
  return { tag: 'submenu', parent: state.parent, entries: state.entries };
}

/**
 * Collect params (if any) for an entry and hand off to the executor.
 */
async function executeEntry(
  entry: MenuEntry,
  executor: (command: string) => Promise<void>,
): Promise<void> {
  const params = await collectParams(entry);

  if (params === null) {
    // User aborted param collection — go back silently
    console.log(chalk.yellow('\n  Cancelled.\n'));
    return;
  }

  if (!entry.command) {
    console.log(chalk.dim(`  (No command registered for "${entry.label}")`));
    return;
  }

  const cmdString = buildCommandString(entry, params);

  console.log(chalk.dim(`\n  Running: galaxy ${cmdString}\n`));
  hr();

  try {
    await executor(cmdString);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\n  ✖  Error: ${message}\n`));
  }

  hr();
  console.log(''); // breathing room before re-rendering the submenu
}

// ─── Print helpers ─────────────────────────────────────────────────────────────

function printWelcome(): void {
  console.log('');
  console.log(chalk.cyan('  ╔══════════════════════════════════════════╗'));
  console.log(chalk.cyan('  ║') + chalk.bold('   🌌  Galaxy DevKit — Interactive Mode   ') + chalk.cyan('║'));
  console.log(chalk.cyan('  ╚══════════════════════════════════════════╝'));
  console.log(chalk.dim('  Use arrow keys to navigate, Enter to select.'));
  console.log(chalk.dim('  Press Ctrl+C at any time to exit gracefully.\n'));
}

function printAbort(): void {
  console.log(chalk.yellow('\n\n  Interrupted. Bye! 👋\n'));
}

// ─── Public factory ────────────────────────────────────────────────────────────

/**
 * Attach the interactive menu command to a Commander program.
 *
 * Usage:
 * ```ts
 * import { attachMenuCommand } from './menus.js';
 * attachMenuCommand(program);
 * ```
 *
 * Running `galaxy menu` launches the guided prompt interface.
 * All command execution is delegated back to the Commander program so
 * existing command logic is reused without duplication.
 *
 * @param program  The root Commander instance.
 */
export function attachMenuCommand(program: Command): void {
  program
    .command('menu')
    .description('Start guided interactive menu (recommended for new users)')
    .action(async () => {
      await runInteractiveMenus(async (cmdString) => {
        // Delegate back to Commander so all existing handlers run unchanged
        const args = cmdString.split(/\s+/).filter(Boolean);
        const temp = program.clone();
        temp.exitOverride();
        try {
          await temp.parseAsync(['node', 'galaxy', ...args], { from: 'user' });
        } catch (err: unknown) {
          const code = (err as Error & { code?: string }).code ?? '';
          if (code === 'commander.helpDisplayed' || code === 'commander.help') return;
          throw err;
        }
      });
    });
}

function executor(command: string): Promise<void> {
    throw new Error('Function not implemented.');
}
