/**
 * @fileoverview Interactive mode entry point for Galaxy CLI
 * @description Exports the interactive command and starts the REPL
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-01-28
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { GalaxyRepl, startRepl, createRepl } from './repl.js';
import { SessionManager, getSessionManager, resetSessionManager } from './session.js';
import { HistoryManager, getHistoryManager, resetHistoryManager } from './history.js';
import { AutocompleteManager, getAutocompleteManager, resetAutocompleteManager, COMMAND_REGISTRY } from './autocomplete.js';
import { WorkflowManager, getWorkflowManager, resetWorkflowManager, runWorkflow, WORKFLOWS, listWorkflows } from './workflows.js';

// Re-export types
export type {
  SessionState,
  SessionConfig,
  HistoryEntry,
  HistoryConfig,
  CommandDefinition,
  OptionDefinition,
  ArgumentDefinition,
  AutocompleteSuggestion,
  Workflow,
  WorkflowStep,
  WorkflowChoice,
  ReplConfig,
  CommandResult,
  NetworkType,
} from '../../types/interactive-types.js';

// Re-export classes and functions
export {
  GalaxyRepl,
  startRepl,
  createRepl,
  SessionManager,
  getSessionManager,
  resetSessionManager,
  HistoryManager,
  getHistoryManager,
  resetHistoryManager,
  AutocompleteManager,
  getAutocompleteManager,
  resetAutocompleteManager,
  COMMAND_REGISTRY,
  WorkflowManager,
  getWorkflowManager,
  resetWorkflowManager,
  runWorkflow,
  WORKFLOWS,
  listWorkflows,
};

/**
 * Create the interactive command for Commander.js
 * @param programRef Reference to the main program for command execution
 */
export function createInteractiveCommand(programRef: Command): Command {
  const interactiveCommand = new Command('interactive')
    .description('Start interactive REPL mode with autocomplete and history')
    .option('--no-history', 'Disable command history')
    .option('--no-session', 'Disable session persistence')
    .action(async (options: { history: boolean; session: boolean }) => {
      await launchInteractiveMode(programRef, options);
    });

  return interactiveCommand;
}

/**
 * Launch the interactive REPL mode
 */
export async function launchInteractiveMode(
  program: Command,
  options: { history?: boolean; session?: boolean } = {}
): Promise<void> {
  const repl = createRepl({
    history: {
      maxEntries: 100,
      // historyPath uses default (~/.galaxy/history) when not specified
      persist: options.history !== false,
      deduplicate: true,
    },
    session: {
      autoSave: options.session !== false,
      timeout: 0,
      // statePath uses default (~/.galaxy/session.json) when not specified
    },
  });

  // Set up command executor that delegates to the main program
  repl.setCommandExecutor(async (input: string) => {
    // Parse the input as if it was command line arguments
    const args = parseCommandLine(input);

    // Create a temporary program instance to avoid modifying the original
    const tempProgram = createTempProgram(program);

    // Suppress exit on error
    tempProgram.exitOverride();

    // Execute the command
    try {
      await tempProgram.parseAsync(['node', 'galaxy', ...args], { from: 'user' });
    } catch (error) {
      const err = error as Error & { code?: string };
      // Ignore commander exit errors (like --help)
      if (err.code === 'commander.helpDisplayed' || err.code === 'commander.help') {
        return;
      }
      // Re-throw other errors
      if (err.code !== 'commander.executeSubCommandAsync') {
        throw error;
      }
    }
  });

  // Start the REPL
  await repl.start();
}

/**
 * Parse command line string into arguments array
 * Handles quoted strings and escaped characters
 */
function parseCommandLine(input: string): string[] {
  const args: string[] = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';
  let escaped = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if ((char === '"' || char === "'") && !inQuote) {
      inQuote = true;
      quoteChar = char;
      continue;
    }

    if (char === quoteChar && inQuote) {
      inQuote = false;
      quoteChar = '';
      continue;
    }

    if (char === ' ' && !inQuote) {
      if (current) {
        args.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current) {
    args.push(current);
  }

  return args;
}

/**
 * Create a temporary program instance with same commands but different error handling
 */
function createTempProgram(original: Command): Command {
  const temp = new Command();

  // Copy basic configuration
  temp.name(original.name());
  temp.description(original.description());

  // Copy all registered commands
  original.commands.forEach((cmd) => {
    temp.addCommand(cmd);
  });

  // Copy registered options from the original
  original.options.forEach((opt) => {
    temp.addOption(opt);
  });

  // Configure error handling
  temp.configureOutput({
    writeOut: (str) => console.log(str),
    writeErr: (str) => console.error(chalk.red(str)),
    outputError: (str, write) => write(chalk.red(str)),
  });

  return temp;
}

/**
 * Check if interactive mode should be launched (no args provided)
 */
export function shouldLaunchInteractive(argv: string[]): boolean {
  // Get args after node and script path
  const args = argv.slice(2);

  // Only auto-launch interactive mode when there are truly no arguments
  // When 'interactive' is specified explicitly, let Commander handle it
  // so that options like --no-history, --no-session, and --help are parsed
  return args.length === 0;
}

/**
 * Reset all singleton instances (useful for testing)
 */
export function resetAll(): void {
  resetSessionManager();
  resetHistoryManager();
  resetAutocompleteManager();
  resetWorkflowManager();
}

// Default export for convenience
export default {
  createInteractiveCommand,
  launchInteractiveMode,
  shouldLaunchInteractive,
  startRepl,
  createRepl,
  GalaxyRepl,
  getSessionManager,
  getHistoryManager,
  getAutocompleteManager,
  getWorkflowManager,
};
