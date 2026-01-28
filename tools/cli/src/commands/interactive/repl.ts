/**
 * @fileoverview REPL loop for Galaxy CLI interactive mode
 * @description Main Read-Eval-Print-Loop implementation with command execution
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-01-28
 */

import readline from 'readline';
import chalk from 'chalk';
import inquirer from 'inquirer';
import type { CommandResult, ReplConfig, NetworkType } from '../../types/interactive-types.js';
import { SessionManager, getSessionManager } from './session.js';
import { HistoryManager, getHistoryManager } from './history.js';
import { AutocompleteManager, getAutocompleteManager } from './autocomplete.js';
import { WorkflowManager, getWorkflowManager } from './workflows.js';

/** Default REPL configuration */
const DEFAULT_REPL_CONFIG: ReplConfig = {
  prompt: 'galaxy> ',
  welcomeMessage: `
${chalk.blue('🌌 Galaxy DevKit Interactive Mode')}
${chalk.gray("Type 'help' for commands or 'exit' to quit")}
`,
  goodbyeMessage: chalk.blue('Goodbye! 👋'),
  showHints: true,
  history: {
    maxEntries: 100,
    historyPath: '',
    persist: true,
    deduplicate: true,
  },
  session: {
    autoSave: true,
    timeout: 0,
    statePath: '',
  },
};

/**
 * Built-in REPL command handlers
 */
const BUILTIN_COMMANDS: Record<
  string,
  (args: string[], repl: GalaxyRepl) => Promise<CommandResult>
> = {
  help: async (args, repl) => {
    const autocomplete = getAutocompleteManager();

    if (args.length > 0) {
      // Show help for specific command
      const commandPath = args.join(' ');
      const helpText = autocomplete.getHelp(commandPath);

      if (helpText) {
        console.log(chalk.blue(`\nHelp: ${commandPath}\n`));
        console.log(helpText);
      } else {
        console.log(chalk.yellow(`No help available for: ${commandPath}`));
      }
    } else {
      // Show general help
      console.log(chalk.blue('\n🌟 Galaxy DevKit CLI - Interactive Mode\n'));
      console.log(chalk.yellow('Built-in Commands:'));
      console.log(chalk.gray('  help [command]     Show help information'));
      console.log(chalk.gray('  exit, quit         Exit interactive mode'));
      console.log(chalk.gray('  clear              Clear the screen'));
      console.log(chalk.gray('  history [-n N]     Show command history'));
      console.log(chalk.gray('  session            Show session state'));
      console.log(chalk.gray('  network [name]     Show/switch network'));
      console.log(chalk.gray('  env                Show environment variables'));
      console.log(chalk.gray('  set <key> <value>  Set session variable'));
      console.log(chalk.gray('  unset <key>        Unset session variable'));

      console.log(chalk.yellow('\nGalaxy Commands:'));
      console.log(chalk.gray('  create <name>      Create new project'));
      console.log(chalk.gray('  init               Initialize in current dir'));
      console.log(chalk.gray('  build              Build project'));
      console.log(chalk.gray('  dev                Start dev server'));
      console.log(chalk.gray('  deploy             Deploy to production'));

      console.log(chalk.yellow('\nCommand Groups:'));
      console.log(chalk.gray('  wallet <cmd>       Wallet management'));
      console.log(chalk.gray('  oracle <cmd>       Oracle price data'));
      console.log(chalk.gray('  workflow <name>    Run guided workflow'));

      console.log(chalk.yellow('\nKeyboard Shortcuts:'));
      console.log(chalk.gray('  Tab                Autocomplete'));
      console.log(chalk.gray('  Up/Down            Navigate history'));
      console.log(chalk.gray('  Ctrl+R             Search history'));
      console.log(chalk.gray('  Ctrl+C             Cancel current input'));
      console.log(chalk.gray('  Ctrl+D             Exit'));

      console.log(chalk.gray("\nType 'help <command>' for detailed help on a specific command."));
    }

    return { success: true };
  },

  exit: async () => {
    return { success: true, exit: true };
  },

  quit: async () => {
    return { success: true, exit: true };
  },

  clear: async () => {
    console.clear();
    return { success: true };
  },

  history: async (args, repl) => {
    const historyManager = getHistoryManager();

    // Check for --clear flag
    if (args.includes('--clear')) {
      await historyManager.clear();
      console.log(chalk.green('History cleared.'));
      return { success: true };
    }

    // Parse -n option
    let count = 10;
    const nIndex = args.indexOf('-n');
    if (nIndex !== -1 && args[nIndex + 1]) {
      count = parseInt(args[nIndex + 1], 10) || 10;
    }

    const formatted = historyManager.format(count);
    if (formatted) {
      console.log(chalk.blue('\nCommand History:\n'));
      console.log(formatted);
    } else {
      console.log(chalk.gray('No history yet.'));
    }

    return { success: true };
  },

  session: async (args, repl) => {
    const sessionManager = getSessionManager();

    if (args.includes('--reset')) {
      await sessionManager.reset();
      console.log(chalk.green('Session reset to defaults.'));
      return { success: true };
    }

    console.log(chalk.blue('\nSession Info:\n'));
    console.log(sessionManager.formatInfo());

    return { success: true };
  },

  network: async (args, repl) => {
    const sessionManager = getSessionManager();

    if (args.length === 0) {
      // Show current network
      console.log(chalk.blue(`Current network: ${sessionManager.getNetwork()}`));
      console.log(chalk.gray('\nAvailable networks: testnet, mainnet, futurenet, standalone'));
    } else {
      // Switch network
      const network = args[0].toLowerCase() as NetworkType;
      const validNetworks = ['testnet', 'mainnet', 'futurenet', 'standalone'];

      if (!validNetworks.includes(network)) {
        console.log(chalk.red(`Invalid network: ${args[0]}`));
        console.log(chalk.gray(`Valid networks: ${validNetworks.join(', ')}`));
        return { success: false };
      }

      await sessionManager.setNetwork(network);
      console.log(chalk.green(`✓ Switched to ${network}`));
    }

    return { success: true };
  },

  env: async (args, repl) => {
    const sessionManager = getSessionManager();
    const variables = sessionManager.getVariables();
    const keys = Object.keys(variables);

    if (keys.length === 0) {
      console.log(chalk.gray('No session variables set.'));
      console.log(chalk.gray("Use 'set <key> <value>' to set a variable."));
    } else {
      console.log(chalk.blue('\nSession Variables:\n'));
      keys.forEach((key) => {
        console.log(chalk.gray(`  ${key}=${variables[key]}`));
      });
    }

    return { success: true };
  },

  set: async (args, repl) => {
    if (args.length < 2) {
      console.log(chalk.red('Usage: set <key> <value>'));
      return { success: false };
    }

    const [key, ...valueParts] = args;
    const value = valueParts.join(' ');

    const sessionManager = getSessionManager();
    await sessionManager.setVariable(key, value);
    console.log(chalk.green(`✓ Set ${key}=${value}`));

    return { success: true };
  },

  unset: async (args, repl) => {
    if (args.length < 1) {
      console.log(chalk.red('Usage: unset <key>'));
      return { success: false };
    }

    const key = args[0];
    const sessionManager = getSessionManager();

    if (await sessionManager.unsetVariable(key)) {
      console.log(chalk.green(`✓ Unset ${key}`));
    } else {
      console.log(chalk.yellow(`Variable not found: ${key}`));
    }

    return { success: true };
  },

  workflow: async (args, repl) => {
    const workflowManager = getWorkflowManager();

    if (args.length === 0) {
      // List workflows
      console.log(chalk.blue('\nAvailable Workflows:\n'));
      workflowManager.list().forEach((w) => {
        console.log(chalk.yellow(`  ${w.id}`));
        console.log(chalk.gray(`    ${w.description}`));
      });
      console.log(chalk.gray("\nUsage: workflow <name>"));
      return { success: true };
    }

    const workflowId = args[0];
    try {
      await workflowManager.run(workflowId);
      return { success: true };
    } catch (error) {
      console.log(chalk.red((error as Error).message));
      return { success: false };
    }
  },
};

/**
 * Galaxy REPL - Interactive command-line interface
 */
export class GalaxyRepl {
  private config: ReplConfig;
  private sessionManager: SessionManager;
  private historyManager: HistoryManager;
  private autocompleteManager: AutocompleteManager;
  private workflowManager: WorkflowManager;
  private rl: readline.Interface | null = null;
  private running: boolean = false;
  private commandExecutor: ((command: string) => Promise<void>) | null = null;

  constructor(config: Partial<ReplConfig> = {}) {
    this.config = { ...DEFAULT_REPL_CONFIG, ...config };
    this.sessionManager = getSessionManager(this.config.session);
    this.historyManager = getHistoryManager(this.config.history);
    this.autocompleteManager = getAutocompleteManager();
    this.workflowManager = getWorkflowManager();
  }

  /**
   * Set the external command executor for non-builtin commands
   */
  setCommandExecutor(executor: (command: string) => Promise<void>): void {
    this.commandExecutor = executor;
  }

  /**
   * Initialize the REPL
   */
  async initialize(): Promise<void> {
    await this.sessionManager.initialize();
    await this.historyManager.initialize();
  }

  /**
   * Start the REPL loop
   */
  async start(): Promise<void> {
    await this.initialize();

    // Show welcome message
    console.log(this.config.welcomeMessage);

    this.running = true;

    // Create readline interface
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      completer: this.completer.bind(this),
      terminal: true,
    });

    // Handle Ctrl+C
    this.rl.on('SIGINT', () => {
      console.log(chalk.gray('\n(Press Ctrl+D or type "exit" to quit)'));
      this.rl?.prompt();
    });

    // Handle Ctrl+D
    this.rl.on('close', () => {
      this.stop();
    });

    // Main REPL loop
    await this.loop();
  }

  /**
   * Main REPL loop
   */
  private async loop(): Promise<void> {
    while (this.running && this.rl) {
      try {
        const input = await this.prompt();

        if (input === null) {
          // EOF (Ctrl+D)
          break;
        }

        const trimmedInput = input.trim();

        if (!trimmedInput) {
          continue;
        }

        const startTime = Date.now();
        const result = await this.executeCommand(trimmedInput);
        const duration = Date.now() - startTime;

        // Record in history
        await this.historyManager.add(trimmedInput, result.success, duration);
        this.sessionManager.recordCommand();

        if (result.exit) {
          break;
        }
      } catch (error) {
        // Don't crash on errors, continue the REPL
        console.error(chalk.red('Error:'), (error as Error).message);
      }
    }

    this.stop();
  }

  /**
   * Display prompt and get user input
   */
  private prompt(): Promise<string | null> {
    return new Promise((resolve) => {
      if (!this.rl) {
        resolve(null);
        return;
      }

      const prefix = this.sessionManager.getPromptPrefix();
      const promptStr = chalk.cyan(prefix + this.config.prompt);

      this.rl.question(promptStr, (answer) => {
        resolve(answer);
      });
    });
  }

  /**
   * Tab completion handler
   */
  private completer(line: string): [string[], string] {
    const suggestions = this.autocompleteManager.getSuggestions(line);
    const completions = suggestions.map((s) => s.value);

    // Find the part of the line to complete
    const parts = line.split(/\s+/);
    const lastPart = parts[parts.length - 1] || '';

    // Filter completions that match the last part
    const hits = completions.filter((c) =>
      c.toLowerCase().startsWith(lastPart.toLowerCase())
    );

    return [hits.length ? hits : completions, lastPart];
  }

  /**
   * Execute a command
   */
  async executeCommand(input: string): Promise<CommandResult> {
    const parts = input.trim().split(/\s+/);
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);

    // Check for built-in commands
    if (command in BUILTIN_COMMANDS) {
      return BUILTIN_COMMANDS[command](args, this);
    }

    // Check for workflow shorthand
    if (command === 'workflow' || this.workflowManager.get(command)) {
      const workflowId = command === 'workflow' ? args[0] : command;
      if (workflowId && this.workflowManager.get(workflowId)) {
        try {
          await this.workflowManager.run(workflowId);
          return { success: true };
        } catch (error) {
          console.log(chalk.red((error as Error).message));
          return { success: false };
        }
      }
    }

    // Execute external command
    if (this.commandExecutor) {
      try {
        await this.commandExecutor(input);
        return { success: true };
      } catch (error) {
        const err = error as Error;
        // Don't print error if it's a commander error (already printed)
        if (!err.message.includes('commander')) {
          console.error(chalk.red('Error:'), err.message);
        }
        return { success: false, error: err };
      }
    }

    console.log(chalk.yellow(`Unknown command: ${command}`));
    console.log(chalk.gray("Type 'help' to see available commands."));
    return { success: false };
  }

  /**
   * Stop the REPL
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;
    console.log(this.config.goodbyeMessage);

    if (this.rl) {
      this.rl.close();
      this.rl = null;
    }
  }

  /**
   * Check if REPL is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get the session manager
   */
  getSession(): SessionManager {
    return this.sessionManager;
  }

  /**
   * Get the history manager
   */
  getHistory(): HistoryManager {
    return this.historyManager;
  }

  /**
   * Get the autocomplete manager
   */
  getAutocomplete(): AutocompleteManager {
    return this.autocompleteManager;
  }
}

/**
 * Create and start the REPL with the given command executor
 */
export async function startRepl(
  commandExecutor?: (command: string) => Promise<void>,
  config?: Partial<ReplConfig>
): Promise<GalaxyRepl> {
  const repl = new GalaxyRepl(config);

  if (commandExecutor) {
    repl.setCommandExecutor(commandExecutor);
  }

  await repl.start();
  return repl;
}

/**
 * Create a REPL instance without starting it
 */
export function createRepl(config?: Partial<ReplConfig>): GalaxyRepl {
  return new GalaxyRepl(config);
}
