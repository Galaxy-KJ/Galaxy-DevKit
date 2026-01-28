/**
 * @fileoverview Autocomplete functionality for Galaxy CLI interactive mode
 * @description Provides tab completion for commands, options, and arguments
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-01-28
 */

import type {
  CommandDefinition,
  OptionDefinition,
  AutocompleteSuggestion,
  NetworkType,
} from '../../types/interactive-types.js';
import { getHistoryManager } from './history.js';

/**
 * Complete command registry with all available Galaxy CLI commands
 */
export const COMMAND_REGISTRY: CommandDefinition[] = [
  // Top-level commands
  {
    name: 'help',
    description: 'Show help information',
    examples: ['help', 'help wallet', 'help oracle price'],
  },
  {
    name: 'exit',
    description: 'Exit interactive mode',
    examples: ['exit'],
  },
  {
    name: 'quit',
    description: 'Exit interactive mode (alias for exit)',
    examples: ['quit'],
  },
  {
    name: 'clear',
    description: 'Clear the screen',
    examples: ['clear'],
  },
  {
    name: 'history',
    description: 'Show command history',
    options: [
      { long: '--count', short: '-n', description: 'Number of entries to show', requiresValue: true },
      { long: '--clear', description: 'Clear history', requiresValue: false },
    ],
    examples: ['history', 'history -n 20', 'history --clear'],
  },
  {
    name: 'session',
    description: 'Show or manage session state',
    options: [
      { long: '--reset', description: 'Reset session to defaults', requiresValue: false },
    ],
    examples: ['session', 'session --reset'],
  },
  {
    name: 'network',
    description: 'Show or switch network',
    arguments: [
      {
        name: 'network',
        description: 'Network to switch to',
        required: false,
        values: ['testnet', 'mainnet', 'futurenet', 'standalone'],
      },
    ],
    examples: ['network', 'network testnet', 'network mainnet'],
  },
  {
    name: 'env',
    description: 'Show session environment variables',
    examples: ['env'],
  },
  {
    name: 'set',
    description: 'Set a session variable',
    arguments: [
      { name: 'key', description: 'Variable name', required: true },
      { name: 'value', description: 'Variable value', required: true },
    ],
    examples: ['set MY_VAR value', 'set DEFAULT_AMOUNT 100'],
  },
  {
    name: 'unset',
    description: 'Unset a session variable',
    arguments: [
      { name: 'key', description: 'Variable name', required: true },
    ],
    examples: ['unset MY_VAR'],
  },
  {
    name: 'create',
    description: 'Create a new Galaxy project from template',
    arguments: [
      { name: 'name', description: 'Project name', required: false },
    ],
    options: [
      { long: '--template', short: '-t', description: 'Template to use', requiresValue: true, values: ['basic', 'defi', 'nft', 'enterprise'] },
      { long: '--directory', short: '-d', description: 'Directory to create project in', requiresValue: true },
      { long: '--skip-install', description: 'Skip dependency installation', requiresValue: false },
    ],
    examples: ['create my-project', 'create --template defi my-defi-app'],
  },
  {
    name: 'init',
    description: 'Initialize Galaxy DevKit in current directory',
    options: [
      { long: '--name', short: '-n', description: 'Project name', requiresValue: true },
    ],
    examples: ['init', 'init --name my-project'],
  },
  {
    name: 'build',
    description: 'Build the project',
    options: [
      { long: '--watch', short: '-w', description: 'Watch for changes', requiresValue: false },
    ],
    examples: ['build', 'build --watch'],
  },
  {
    name: 'dev',
    description: 'Start development server',
    options: [
      { long: '--port', short: '-p', description: 'Port number', requiresValue: true, defaultValue: '3000' },
    ],
    examples: ['dev', 'dev --port 8080'],
  },
  {
    name: 'deploy',
    description: 'Deploy to production',
    options: [
      { long: '--env', short: '-e', description: 'Environment', requiresValue: true, values: ['production', 'staging', 'development'] },
    ],
    examples: ['deploy', 'deploy --env staging'],
  },
  // Wallet command group
  {
    name: 'wallet',
    description: 'Wallet management commands',
    subcommands: [
      {
        name: 'create',
        description: 'Create a new wallet',
        parent: 'wallet',
        options: [
          { long: '--name', short: '-n', description: 'Wallet name', requiresValue: true },
          { long: '--network', description: 'Network', requiresValue: true, values: ['testnet', 'mainnet'] },
        ],
      },
      {
        name: 'import',
        description: 'Import existing wallet',
        parent: 'wallet',
        arguments: [
          { name: 'secret', description: 'Secret key or mnemonic', required: true },
        ],
        options: [
          { long: '--name', short: '-n', description: 'Wallet name', requiresValue: true },
        ],
      },
      {
        name: 'list',
        description: 'List all wallets',
        parent: 'wallet',
        options: [
          { long: '--json', description: 'Output as JSON', requiresValue: false },
        ],
      },
      {
        name: 'multisig',
        description: 'Multi-signature wallet operations',
        parent: 'wallet',
        subcommands: [
          { name: 'create', description: 'Create multi-sig wallet', parent: 'wallet multisig' },
          { name: 'propose', description: 'Propose transaction', parent: 'wallet multisig' },
          { name: 'sign', description: 'Sign transaction', parent: 'wallet multisig' },
          { name: 'submit', description: 'Submit transaction', parent: 'wallet multisig' },
        ],
      },
      {
        name: 'ledger',
        description: 'Ledger hardware wallet operations',
        parent: 'wallet',
        subcommands: [
          { name: 'connect', description: 'Connect to Ledger', parent: 'wallet ledger' },
          { name: 'accounts', description: 'List accounts', parent: 'wallet ledger' },
          { name: 'sign', description: 'Sign with Ledger', parent: 'wallet ledger' },
        ],
      },
      {
        name: 'biometric',
        description: 'Biometric authentication',
        parent: 'wallet',
        subcommands: [
          { name: 'enable', description: 'Enable biometric auth', parent: 'wallet biometric' },
          { name: 'disable', description: 'Disable biometric auth', parent: 'wallet biometric' },
        ],
      },
      {
        name: 'recovery',
        description: 'Wallet recovery options',
        parent: 'wallet',
        subcommands: [
          { name: 'setup', description: 'Setup recovery', parent: 'wallet recovery' },
          { name: 'guardians', description: 'Manage guardians', parent: 'wallet recovery' },
          { name: 'initiate', description: 'Start recovery', parent: 'wallet recovery' },
        ],
      },
      {
        name: 'backup',
        description: 'Backup wallet',
        parent: 'wallet',
        options: [
          { long: '--format', short: '-f', description: 'Backup format', requiresValue: true, values: ['json', 'qr', 'paper', 'shamir'] },
          { long: '--output', short: '-o', description: 'Output path', requiresValue: true },
        ],
      },
      {
        name: 'restore',
        description: 'Restore wallet from backup',
        parent: 'wallet',
        arguments: [
          { name: 'backup-file', description: 'Backup file path', required: true },
        ],
      },
    ],
  },
  // Oracle command group
  {
    name: 'oracle',
    description: 'Query oracle price data',
    subcommands: [
      {
        name: 'price',
        description: 'Get current price',
        parent: 'oracle',
        arguments: [
          { name: 'pair', description: 'Trading pair (e.g., XLM/USD)', required: true },
        ],
        options: [
          { long: '--json', description: 'Output as JSON', requiresValue: false },
          { long: '--strategy', short: '-s', description: 'Aggregation strategy', requiresValue: true, values: ['median', 'mean', 'weighted', 'twap'] },
        ],
      },
      {
        name: 'history',
        description: 'Get price history',
        parent: 'oracle',
        arguments: [
          { name: 'pair', description: 'Trading pair', required: true },
        ],
        options: [
          { long: '--period', short: '-p', description: 'Time period', requiresValue: true, values: ['1h', '24h', '7d', '30d'] },
          { long: '--json', description: 'Output as JSON', requiresValue: false },
        ],
      },
      {
        name: 'sources',
        description: 'Manage oracle sources',
        parent: 'oracle',
        subcommands: [
          { name: 'list', description: 'List available sources', parent: 'oracle sources' },
          { name: 'add', description: 'Add custom source', parent: 'oracle sources' },
          { name: 'remove', description: 'Remove source', parent: 'oracle sources' },
          { name: 'enable', description: 'Enable source', parent: 'oracle sources' },
          { name: 'disable', description: 'Disable source', parent: 'oracle sources' },
        ],
      },
      {
        name: 'strategies',
        description: 'View aggregation strategies',
        parent: 'oracle',
        options: [
          { long: '--json', description: 'Output as JSON', requiresValue: false },
        ],
      },
      {
        name: 'validate',
        description: 'Validate price data',
        parent: 'oracle',
        arguments: [
          { name: 'pair', description: 'Trading pair', required: true },
        ],
      },
    ],
  },
  // Workflow commands
  {
    name: 'workflow',
    description: 'Run guided workflows',
    subcommands: [
      { name: 'create-project', description: 'Create a new project (guided)', parent: 'workflow' },
      { name: 'setup-wallet', description: 'Setup wallet (guided)', parent: 'workflow' },
      { name: 'deploy-contract', description: 'Deploy contract (guided)', parent: 'workflow' },
    ],
  },
];

/**
 * Autocomplete manager for interactive REPL mode
 */
export class AutocompleteManager {
  private commands: CommandDefinition[];
  private flatCommands: Map<string, CommandDefinition> = new Map();

  constructor(commands: CommandDefinition[] = COMMAND_REGISTRY) {
    this.commands = commands;
    this.buildFlatIndex();
  }

  /**
   * Build a flat index of all commands for quick lookup
   */
  private buildFlatIndex(): void {
    const indexCommand = (cmd: CommandDefinition, path: string = ''): void => {
      const fullPath = path ? `${path} ${cmd.name}` : cmd.name;
      this.flatCommands.set(fullPath, cmd);

      if (cmd.subcommands) {
        cmd.subcommands.forEach((sub) => indexCommand(sub, fullPath));
      }
    };

    this.commands.forEach((cmd) => indexCommand(cmd));
  }

  /**
   * Get autocomplete suggestions for the current input
   * @param input Current input string
   * @returns Array of suggestions
   */
  getSuggestions(input: string): AutocompleteSuggestion[] {
    const trimmedInput = input.trim();
    const endsWithSpace = input.length > 0 && input.endsWith(' ');
    const parts = trimmedInput.split(/\s+/);
    const suggestions: AutocompleteSuggestion[] = [];

    // Empty input - suggest all top-level commands
    if (!trimmedInput) {
      return this.commands.map((cmd) => ({
        value: cmd.name,
        description: cmd.description,
        type: 'command' as const,
      }));
    }

    // Determine what we're completing based on trailing space
    const lastPart = endsWithSpace ? '' : parts[parts.length - 1];
    const previousPart = endsWithSpace ? parts[parts.length - 1] : parts[parts.length - 2];

    // Check if we're completing an option value (previous part is an option)
    if (previousPart?.startsWith('-')) {
      const partsWithEmpty = endsWithSpace ? [...parts, ''] : parts;
      const optionSuggestions = this.getOptionValueSuggestions(partsWithEmpty, previousPart);
      if (optionSuggestions.length > 0) {
        return optionSuggestions;
      }
    }

    // Check if we're in the middle of typing an option
    if (lastPart.startsWith('-')) {
      return this.getOptionSuggestions(parts.slice(0, -1), lastPart);
    }

    // Try to match command path
    const commandPath = this.findCommandPath(parts);

    if (commandPath.command) {
      // We have a complete command, suggest subcommands or options
      const { command, consumedParts } = commandPath;

      // If there's more input after the command, we're in argument/option territory
      if (parts.length > consumedParts) {
        // Suggest options
        if (command.options) {
          suggestions.push(
            ...command.options
              .filter((opt) => !parts.includes(opt.long) && (!opt.short || !parts.includes(opt.short)))
              .map((opt) => ({
                value: opt.long,
                description: opt.description,
                type: 'option' as const,
              }))
          );
        }

        // Suggest subcommands if available
        if (command.subcommands) {
          const subPrefix = parts[consumedParts]?.toLowerCase() || '';
          suggestions.push(
            ...command.subcommands
              .filter((sub) => sub.name.toLowerCase().startsWith(subPrefix))
              .map((sub) => ({
                value: sub.name,
                description: sub.description,
                type: 'subcommand' as const,
              }))
          );
        }
      } else {
        // Suggest argument values if the command has arguments with predefined values
        if (command.arguments && endsWithSpace) {
          const argIndex = parts.length - consumedParts;
          const arg = command.arguments[argIndex];
          if (arg?.values && Array.isArray(arg.values)) {
            suggestions.push(
              ...arg.values.map((v) => ({
                value: v,
                description: arg.description,
                type: 'argument' as const,
              }))
            );
          }
        }

        // Suggest subcommands first
        if (command.subcommands) {
          suggestions.push(
            ...command.subcommands.map((sub) => ({
              value: sub.name,
              description: sub.description,
              type: 'subcommand' as const,
            }))
          );
        }

        // Then suggest options
        if (command.options) {
          suggestions.push(
            ...command.options.map((opt) => ({
              value: opt.long,
              description: opt.description,
              type: 'option' as const,
            }))
          );
        }
      }
    } else {
      // No complete command yet, suggest matching commands
      const prefix = parts[parts.length - 1]?.toLowerCase() || '';
      suggestions.push(
        ...this.commands
          .filter((cmd) => cmd.name.toLowerCase().startsWith(prefix))
          .map((cmd) => ({
            value: cmd.name,
            description: cmd.description,
            type: 'command' as const,
          }))
      );
    }

    // Add history-based suggestions
    const historyManager = getHistoryManager();
    const historySuggestions = historyManager
      .getByPrefix(trimmedInput)
      .slice(0, 3)
      .map((cmd) => ({
        value: cmd,
        description: '(from history)',
        type: 'command' as const,
      }));

    // Merge, prioritizing exact matches
    const seen = new Set(suggestions.map((s) => s.value));
    historySuggestions.forEach((hs) => {
      if (!seen.has(hs.value)) {
        suggestions.push(hs);
      }
    });

    return suggestions;
  }

  /**
   * Find the command definition from input parts
   */
  private findCommandPath(
    parts: string[]
  ): { command: CommandDefinition | null; consumedParts: number } {
    let current: CommandDefinition | undefined;
    let consumed = 0;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].toLowerCase();

      // Skip options
      if (part.startsWith('-')) continue;

      if (!current) {
        // Find top-level command
        current = this.commands.find((cmd) => cmd.name.toLowerCase() === part);
        if (current) consumed = i + 1;
      } else if (current.subcommands) {
        // Find subcommand
        const sub = current.subcommands.find((cmd) => cmd.name.toLowerCase() === part);
        if (sub) {
          current = sub;
          consumed = i + 1;
        } else {
          break;
        }
      } else {
        break;
      }
    }

    return { command: current || null, consumedParts: consumed };
  }

  /**
   * Get option suggestions for a command
   */
  private getOptionSuggestions(
    commandParts: string[],
    prefix: string
  ): AutocompleteSuggestion[] {
    const { command } = this.findCommandPath(commandParts);
    if (!command?.options) return [];

    const lowerPrefix = prefix.toLowerCase();
    return command.options
      .filter(
        (opt) =>
          // Match prefix
          (opt.long.toLowerCase().startsWith(lowerPrefix) ||
           (opt.short && opt.short.toLowerCase().startsWith(lowerPrefix))) &&
          // Exclude already-used options
          !commandParts.includes(opt.long) &&
          (!opt.short || !commandParts.includes(opt.short))
      )
      .map((opt) => ({
        value: opt.long,
        description: opt.description,
        type: 'option' as const,
      }));
  }

  /**
   * Get value suggestions for an option
   */
  private getOptionValueSuggestions(
    parts: string[],
    optionName: string
  ): AutocompleteSuggestion[] {
    // Find the command first
    const commandParts = parts.filter((p) => !p.startsWith('-')).slice(0, -1);
    const { command } = this.findCommandPath(commandParts);

    if (!command?.options) return [];

    const option = command.options.find(
      (opt) => opt.long === optionName || opt.short === optionName
    );

    if (!option?.values) return [];

    const prefix = parts[parts.length - 1]?.toLowerCase() || '';
    return option.values
      .filter((v) => v.toLowerCase().startsWith(prefix))
      .map((v) => ({
        value: v,
        description: `Value for ${option.long}`,
        type: 'value' as const,
      }));
  }

  /**
   * Get help text for a command
   */
  getHelp(commandPath: string): string | null {
    const command = this.flatCommands.get(commandPath);
    if (!command) return null;

    const lines: string[] = [
      `${command.name} - ${command.description}`,
      '',
    ];

    if (command.arguments?.length) {
      lines.push('Arguments:');
      command.arguments.forEach((arg) => {
        const required = arg.required ? '(required)' : '(optional)';
        lines.push(`  <${arg.name}> ${required} - ${arg.description}`);
      });
      lines.push('');
    }

    if (command.options?.length) {
      lines.push('Options:');
      command.options.forEach((opt) => {
        const shortStr = opt.short ? `${opt.short}, ` : '    ';
        lines.push(`  ${shortStr}${opt.long} - ${opt.description}`);
      });
      lines.push('');
    }

    if (command.subcommands?.length) {
      lines.push('Subcommands:');
      command.subcommands.forEach((sub) => {
        lines.push(`  ${sub.name} - ${sub.description}`);
      });
      lines.push('');
    }

    if (command.examples?.length) {
      lines.push('Examples:');
      command.examples.forEach((ex) => {
        lines.push(`  $ ${ex}`);
      });
    }

    return lines.join('\n');
  }

  /**
   * Get all command names (flat list)
   */
  getAllCommandNames(): string[] {
    return Array.from(this.flatCommands.keys());
  }

  /**
   * Check if a command exists
   */
  hasCommand(commandPath: string): boolean {
    return this.flatCommands.has(commandPath);
  }

  /**
   * Register a custom command
   */
  registerCommand(command: CommandDefinition): void {
    this.commands.push(command);
    this.buildFlatIndex();
  }
}

/** Singleton autocomplete manager instance */
let autocompleteInstance: AutocompleteManager | null = null;

/**
 * Get the singleton autocomplete manager instance
 */
export function getAutocompleteManager(): AutocompleteManager {
  if (!autocompleteInstance) {
    autocompleteInstance = new AutocompleteManager();
  }
  return autocompleteInstance;
}

/**
 * Reset the singleton autocomplete manager (useful for testing)
 */
export function resetAutocompleteManager(): void {
  autocompleteInstance = null;
}
