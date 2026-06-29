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
import { getPromptFlow, runPromptFlow } from './prompts/index.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MenuParam {
  name: string;
  message: string;
  type: 'input' | 'number' | 'confirm' | 'list' | 'password';
  default?: string | number | boolean;
  choices?: string[];
  // Accepts any runtime value (number, boolean, string) and supports async validators
  validate?: (value: any) => boolean | string | Promise<boolean | string>;
  /**
   * When true, emit the value as a positional argument instead of `--name value`.
   * Positional params are appended in declaration order, after the base command
   * tokens and before any flags.
   */
  positional?: boolean;
}

export interface MenuEntry {
  /** Display label shown in the list */
  label: string;
  /** CLI command string to execute, e.g. "wallet info" — required if children and promptFlow are absent */
  command?: string;
  /**
   * Id of a guided PromptFlow to run (see prompts/index.ts). When set,
   * `command` and `params` are ignored — the flow drives its own prompts.
   */
  promptFlow?: string;
  /** Parameters to collect before running the command */
  params?: MenuParam[];
  /** Nested submenu entries — required if command and promptFlow are absent */
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
 * Every entry must have one of: `children` (submenu), `command` (direct), or `promptFlow` (guided).
 *
 * Use `promptFlow` for multi-step guided flows with validation + confirmation
 * (see prompts/index.ts). Use `command` + `params` for simple one-shot inputs.
 */
export const ROOT_MENU: MenuEntry[] = [
  {
    label: '🔑  Wallet',
    description: 'Create, import and manage local wallets',
    children: [
      {
        label: 'Create wallet (guided)',
        description: 'Generate a new keypair with optional encryption',
        promptFlow: 'wallet:create',
      },
      {
        label: 'Import wallet (guided)',
        description: 'Import from a secret key',
        promptFlow: 'wallet:import',
      },
      {
        label: 'List wallets',
        command: 'wallet list',
      },
      {
        label: 'Wallet info',
        command: 'wallet info',
        params: [
          {
            name: 'target',
            message: 'Wallet name or public key:',
            type: 'input',
            positional: true,
            validate: (v: string) =>
              v && v.trim().length > 0 ? true : 'Required',
          },
        ],
      },
      {
        label: 'Check balance (guided)',
        description: 'Lookup by wallet name or address',
        promptFlow: 'wallet:balance',
      },
      {
        label: 'Fund testnet wallet (guided)',
        description: 'Request XLM from friendbot',
        promptFlow: 'wallet:fund',
      },
    ],
  },
  {
    label: '💸  Payments',
    description: 'Send XLM and issued assets',
    children: [
      {
        label: 'Send payment (guided)',
        description: 'Transfer XLM or an issued asset — asks for confirmation',
        promptFlow: 'wallet:send',
      },
    ],
  },
  {
    label: '🌊  DeFi / Liquidity',
    description: 'Soroswap swaps, Blend lending, liquidity pools',
    children: [
      {
        label: 'Swap tokens (Soroswap, guided)',
        description: 'Swap with quote preview + confirmation',
        promptFlow: 'defi:swap',
      },
      {
        label: 'Blend — supply (guided)',
        description: 'Supply assets to Blend Protocol',
        promptFlow: 'defi:blend-supply',
      },
      {
        label: 'Blend — borrow (guided)',
        description: 'Borrow assets from Blend Protocol',
        promptFlow: 'defi:blend-borrow',
      },
      {
        label: 'List liquidity pools',
        description: 'Show TVL and APY across Soroswap pools',
        promptFlow: 'defi:pools',
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
            name: 'symbol',
            message: 'Asset symbol (e.g. XLM/USD):',
            type: 'input',
            positional: true,
            default: 'XLM/USD',
            validate: (v: string) => (v && v.length > 0 ? true : 'Required'),
          },
          {
            name: 'strategy',
            message: 'Aggregation strategy:',
            type: 'list',
            choices: ['median', 'mean', 'twap', 'weighted'],
            default: 'median',
          },
          {
            name: 'network',
            message: 'Network:',
            type: 'list',
            choices: ['testnet', 'mainnet'],
            default: 'testnet',
          },
        ],
      },
      {
        label: 'List configured oracle sources',
        command: 'oracle sources list',
      },
      {
        label: 'List supported strategies',
        command: 'oracle strategies',
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
 * Params marked `positional: true` are emitted in declaration order, immediately
 * after the base command tokens. Remaining params become `--flag value` pairs.
 *
 * e.g. for `wallet send <from> <to> <amount> <asset> [--memo X]`:
 *   ['wallet', 'send', 'alice', 'G...', '10', 'XLM', '--memo', 'gift']
 *
 * For human-readable display use buildCommandPreview() instead.
 */
function buildCommandArgs(
  entry: MenuEntry,
  params: Record<string, unknown>,
): string[] {
  if (!entry.command) return [];

  const base = entry.command.split(/\s+/).filter(Boolean);
  const positionals: string[] = [];
  const flags: string[] = [];

  // Walk declared params in order so positionals stay aligned with the command signature.
  const positionalNames = new Set<string>(
    (entry.params ?? []).filter((p) => p.positional).map((p) => p.name),
  );

  if (entry.params) {
    for (const p of entry.params) {
      if (!p.positional) continue;
      const v = params[p.name];
      if (v === '' || v === undefined || v === null) continue;
      positionals.push(String(v));
    }
  }

  for (const [k, v] of Object.entries(params)) {
    if (positionalNames.has(k)) continue;
    if (v === '' || v === undefined || v === null) continue;
    if (typeof v === 'boolean') {
      if (v) flags.push(`--${k}`);
      continue;
    }
    flags.push(`--${k}`, String(v));
  }

  return [...base, ...positionals, ...flags];
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
    if (!selected.command && !selected.promptFlow) {
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

  if (!selected.command && !selected.promptFlow) {
    console.log(chalk.yellow(`\n  ⚠  No command registered for "${selected.label}". Skipping.\n`));
    return { tag: 'submenu', parent: state.parent, entries: state.entries };
  }

  await executeEntry(selected, executor);

  // Return to the same submenu after executing
  return { tag: 'submenu', parent: state.parent, entries: state.entries };
}

/**
 * Run an entry: either delegate to a registered PromptFlow (guided multi-step
 * flow with confirmation) or collect params and run a direct command.
 */
async function executeEntry(
  entry: MenuEntry,
  executor: (args: string[]) => Promise<void>,
): Promise<void> {
  if (entry.promptFlow) {
    const flow = getPromptFlow(entry.promptFlow);
    if (!flow) {
      console.log(chalk.yellow(`\n  ⚠  Unknown prompt flow: ${entry.promptFlow}\n`));
      return;
    }
    hr();
    const result = await runPromptFlow(flow, executor);
    if (result.error) {
      console.error(chalk.red(`\n  ✖  Error: ${result.error.message}\n`));
    }
    hr();
    console.log('');
    return;
  }

  const params = await collectParams(entry);

  if (params === null) {
    console.log(chalk.yellow('\n  Cancelled.\n'));
    return;
  }

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