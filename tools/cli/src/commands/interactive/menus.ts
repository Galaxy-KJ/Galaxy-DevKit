/**
 * @fileoverview Interactive menu definitions and guided prompt flows for Galaxy CLI
 * @description Provides a menu-driven REPL experience using inquirer. Users navigate
 *   a top-level command menu, fill in parameters interactively, and see formatted results.
 *   Supports graceful Ctrl+C aborts and smooth Back navigation via a state machine.
 * @author Galaxy DevKit Team
 * @version 1.0.1
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
  // Accepts any runtime value (number, boolean, string) and supports async validators
  validate?: (value: any) => boolean | string | Promise<boolean | string>;
}

export interface MenuEntry {
  /** Display label shown in the list */
  label: string;
  /** CLI command string to execute, e.g. "account info" — required if children is absent */
  command?: string;
  /** Parameters to collect before running the command */
  params?: MenuParam[];
  /** Nested submenu entries — required if command is absent */
  children?: MenuEntry[];
  /** Human-readable description shown as a hint */
  description?: string;
}

/** Internal state machine states */
type MenuState =
  | { tag: 'root' }
  | { tag: 'submenu'; parent: MenuEntry; entries: MenuEntry[] }
  | { tag: 'done' };

// ─── Menu definitions ─────────────────────────────────────────────────────────

/** Sentinel value used for the Back / Exit choices */
const BACK = '__BACK__';
const EXIT = '__EXIT__';

/**
 * Top-level menu structure.
 * Extend this array to register new commands in the interactive UI.
 * Every entry must have either `children` (submenu) or `command` (action).
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
            validate: (v: string) =>
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
            validate: (v: string) =>
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
            validate: (v: string) => (v.length > 0 ? true : 'Required'),
          },
          {
            name: 'to',
            message: 'Destination account (G…):',
            type: 'input',
            validate: (v: string) => (v.length > 0 ? true : 'Required'),
          },
          {
            name: 'amount',
            message: 'Amount (XLM):',
            type: 'number',
            // inquirer number prompt returns NaN for empty/invalid input
            validate: (v: number) =>
              !isNaN(v) && v > 0 ? true : 'Must be a positive number',
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
            validate: (v: string) => (v.length > 0 ? true : 'Required'),
          },
          {
            name: 'limit',
            message: 'Number of records:',
            type: 'number',
            default: 10,
            validate: (v: number) =>
              !isNaN(v) && v > 0 ? true : 'Must be a positive number',
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
            validate: (v: string) => (v.length > 0 ? true : 'Required'),
          },
          {
            name: 'buy',
            message: 'Asset to buy (e.g. USDC):',
            type: 'input',
            validate: (v: string) => (v.length > 0 ? true : 'Required'),
          },
          {
            name: 'amount',
            message: 'Amount to sell:',
            type: 'number',
            validate: (v: number) =>
              !isNaN(v) && v > 0 ? true : 'Must be a positive number',
          },
          {
            name: 'slippage',
            message: 'Max slippage % (e.g. 0.5):',
            type: 'number',
            default: 0.5,
            validate: (v: number) =>
              !isNaN(v) && v >= 0 ? true : 'Must be a non-negative number',
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
            validate: (v: string) => (v.length > 0 ? true : 'Required'),
          },
          {
            name: 'amount',
            message: 'Amount to deposit:',
            type: 'number',
            validate: (v: number) =>
              !isNaN(v) && v > 0 ? true : 'Must be a positive number',
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
            validate: (v: string) => (v.length > 0 ? true : 'Required'),
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
 * Build a structured argument list from a MenuEntry and collected params.
 * Returns string[] safe to pass directly into Commander's parseAsync —
 * no shell splitting needed, whitespace in values is fully preserved.
 *
 * e.g. ['payment', 'send', '--from', 'G...', '--to', 'G...', '--amount', '10']
 *
 * For human-readable display use buildCommandPreview() instead.
 */
function buildCommandArgs(
  entry: MenuEntry,
  params: Record<string, unknown>,
): string[] {
  if (!entry.command) return [];

  // Split the base command into individual tokens (e.g. "payment send" → ['payment', 'send'])
  const base = entry.command.split(/\s+/).filter(Boolean);
  const flags: string[] = [];

  for (const [k, v] of Object.entries(params)) {
    if (v === '' || v === undefined || v === null) continue;
    if (typeof v === 'boolean') {
      if (v) flags.push(`--${k}`); // omit the flag entirely when false
      continue;
    }
    // Push key and value as separate array elements — whitespace in v is preserved
    flags.push(`--${k}`, String(v));
  }

  return [...base, ...flags];
}

/**
 * Build a human-readable preview string for display only.
 * Do NOT use this output for actual command parsing.
 */
function buildCommandPreview(
  entry: MenuEntry,
  params: Record<string, unknown>,
): string {
  return buildCommandArgs(entry, params).join(' ');
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
 * @param executor  Async function that receives a structured string[] argument list.
 *                  e.g. ['payment', 'send', '--to', 'G...', '--amount', '10']
 *                  No shell splitting or quoting is performed by the caller.
 */
export async function runInteractiveMenus(
  executor: (args: string[]) => Promise<void>,
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
  executor: (args: string[]) => Promise<void>,
): Promise<MenuState> {
  switch (state.tag) {
    case 'root':
      return stepRoot(executor);
    case 'submenu':
      return stepSubmenu(state, executor);
    case 'done':
      return state;
  }
}

/** Handle the root (category selection) state */
async function stepRoot(
  executor: (args: string[]) => Promise<void>,
): Promise<MenuState> {
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

  if (!selected.children || selected.children.length === 0) {
    // Guard: entry with no children must have a command registered
    if (!selected.command) {
      console.log(chalk.yellow(`\n  ⚠  No command registered for "${selected.label}". Skipping.\n`));
      return { tag: 'root' };
    }
    await executeEntry(selected, executor);
    return { tag: 'root' };
  }

  return { tag: 'submenu', parent: selected, entries: selected.children };
}

/** Handle the submenu (action selection within a category) state */
async function stepSubmenu(
  state: Extract<MenuState, { tag: 'submenu' }>,
  executor: (args: string[]) => Promise<void>,
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

  // Guard: entry with no children must have a command registered
  if (!selected.command) {
    console.log(chalk.yellow(`\n  ⚠  No command registered for "${selected.label}". Skipping.\n`));
    return { tag: 'submenu', parent: state.parent, entries: state.entries };
  }

  await executeEntry(selected, executor);

  // Return to the same submenu after executing
  return { tag: 'submenu', parent: state.parent, entries: state.entries };
}

/**
 * Collect params (if any) for an entry and forward a structured string[]
 * to the executor — no shell splitting at the call site.
 */
async function executeEntry(
  entry: MenuEntry,
  executor: (args: string[]) => Promise<void>,
): Promise<void> {
  const params = await collectParams(entry);

  if (params === null) {
    console.log(chalk.yellow('\n  Cancelled.\n'));
    return;
  }

  // entry.command is guaranteed to be set by all callers (checked before this call)
  const args = buildCommandArgs(entry, params);
  const preview = buildCommandPreview(entry, params);

  console.log(chalk.dim(`\n  Running: galaxy ${preview}\n`));
  hr();

  try {
    await executor(args);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(chalk.red(`\n  ✖  Error: ${message}\n`));
  }

  hr();
  console.log('');
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
 * Attach the `galaxy menu` command to a Commander program.
 *
 * Usage:
 * ```ts
 * import { attachMenuCommand } from './menus.js';
 * attachMenuCommand(program);
 * ```
 *
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
      // executor receives a structured string[] — no splitting or quoting needed
      await runInteractiveMenus(async (args: string[]) => {
        // Commander v12 has no .clone() — rebuild a temp instance and
        // re-attach registered sub-commands so existing handlers run unchanged.
        const temp = new Command();
        temp.name(program.name());
        temp.exitOverride();
        temp.configureOutput({
          writeOut: (str) => process.stdout.write(str),
          writeErr: (str) => process.stderr.write(str),
        });
        for (const cmd of program.commands) {
          temp.addCommand(cmd);
        }
        try {
          await temp.parseAsync(['node', program.name(), ...args], { from: 'user' });
        } catch (err: unknown) {
          const code = (err as Error & { code?: string }).code ?? '';
          if (code === 'commander.helpDisplayed' || code === 'commander.help') return;
          throw err;
        }
      });
    });
}