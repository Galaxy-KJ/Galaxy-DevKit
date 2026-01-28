/**
 * @fileoverview Type definitions for Galaxy CLI interactive mode
 * @description Defines interfaces and types for REPL, session, history, and workflows
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-01-28
 */

/**
 * Network configuration for Stellar blockchain
 */
export type NetworkType = 'testnet' | 'mainnet' | 'futurenet' | 'standalone';

/**
 * Session state maintained across REPL commands
 */
export interface SessionState {
  /** Currently selected network */
  network: NetworkType;
  /** Currently active wallet public key */
  activeWallet: string | null;
  /** Currently active wallet name */
  activeWalletName: string | null;
  /** Current working directory */
  workingDirectory: string;
  /** Session start timestamp */
  startedAt: Date;
  /** Last command executed timestamp */
  lastCommandAt: Date | null;
  /** Number of commands executed in session */
  commandCount: number;
  /** Custom session variables */
  variables: Record<string, string>;
}

/**
 * Configuration for session persistence
 */
export interface SessionConfig {
  /** Auto-save session state */
  autoSave: boolean;
  /** Session timeout in milliseconds (0 = no timeout) */
  timeout: number;
  /** Path to session state file */
  statePath: string;
}

/**
 * Command history entry
 */
export interface HistoryEntry {
  /** The command that was executed */
  command: string;
  /** Timestamp when command was executed */
  timestamp: Date;
  /** Whether the command succeeded */
  success: boolean;
  /** Execution duration in milliseconds */
  duration?: number;
}

/**
 * Configuration for command history
 */
export interface HistoryConfig {
  /** Maximum number of history entries to keep */
  maxEntries: number;
  /** Path to history file */
  historyPath: string;
  /** Whether to persist history to disk */
  persist: boolean;
  /** Whether to deduplicate consecutive identical commands */
  deduplicate: boolean;
}

/**
 * Command definition for autocomplete
 */
export interface CommandDefinition {
  /** Command name */
  name: string;
  /** Command description */
  description: string;
  /** Parent command (for subcommands) */
  parent?: string;
  /** Available options/flags */
  options?: OptionDefinition[];
  /** Positional arguments */
  arguments?: ArgumentDefinition[];
  /** Subcommands */
  subcommands?: CommandDefinition[];
  /** Examples of usage */
  examples?: string[];
}

/**
 * Option/flag definition for autocomplete
 */
export interface OptionDefinition {
  /** Long form flag (e.g., --network) */
  long: string;
  /** Short form flag (e.g., -n) */
  short?: string;
  /** Description of the option */
  description: string;
  /** Whether option requires a value */
  requiresValue: boolean;
  /** Possible values for autocomplete */
  values?: string[];
  /** Default value */
  defaultValue?: string;
}

/**
 * Argument definition for autocomplete
 */
export interface ArgumentDefinition {
  /** Argument name */
  name: string;
  /** Description of the argument */
  description: string;
  /** Whether argument is required */
  required: boolean;
  /** Possible values for autocomplete */
  values?: string[] | (() => Promise<string[]>);
}

/**
 * Autocomplete suggestion
 */
export interface AutocompleteSuggestion {
  /** The suggestion text */
  value: string;
  /** Description of the suggestion */
  description?: string;
  /** Type of suggestion */
  type: 'command' | 'subcommand' | 'option' | 'argument' | 'value';
}

/**
 * Workflow step definition
 */
export interface WorkflowStep {
  /** Step identifier */
  id: string;
  /** Step title/question */
  title: string;
  /** Step description */
  description?: string;
  /** Type of input required */
  type: 'input' | 'select' | 'multiselect' | 'confirm' | 'password';
  /** Available choices (for select/multiselect) */
  choices?: WorkflowChoice[];
  /** Validation function */
  validate?: (value: string) => boolean | string;
  /** Default value */
  default?: string | boolean;
  /** Whether step is optional */
  optional?: boolean;
  /** Condition to show this step */
  when?: (answers: Record<string, any>) => boolean;
}

/**
 * Choice option for workflow steps
 */
export interface WorkflowChoice {
  /** Display name */
  name: string;
  /** Actual value */
  value: string;
  /** Short description */
  description?: string;
  /** Whether this is the default choice */
  default?: boolean;
}

/**
 * Workflow definition
 */
export interface Workflow {
  /** Workflow identifier */
  id: string;
  /** Workflow name */
  name: string;
  /** Workflow description */
  description: string;
  /** Workflow steps */
  steps: WorkflowStep[];
  /** Command to execute with collected answers */
  execute: (answers: Record<string, any>) => Promise<void>;
}

/**
 * REPL configuration
 */
export interface ReplConfig {
  /** Prompt string to display */
  prompt: string;
  /** Welcome message */
  welcomeMessage: string;
  /** Goodbye message */
  goodbyeMessage: string;
  /** Whether to show hints */
  showHints: boolean;
  /** History configuration */
  history: HistoryConfig;
  /** Session configuration */
  session: SessionConfig;
}

/**
 * Result of executing a command in the REPL
 */
export interface CommandResult {
  /** Whether command executed successfully */
  success: boolean;
  /** Output message */
  message?: string;
  /** Error if command failed */
  error?: Error;
  /** Whether to exit the REPL */
  exit?: boolean;
  /** Data returned by the command */
  data?: any;
}

/**
 * Built-in REPL commands
 */
export type BuiltinCommand =
  | 'help'
  | 'exit'
  | 'quit'
  | 'clear'
  | 'history'
  | 'session'
  | 'network'
  | 'wallet'
  | 'env'
  | 'set'
  | 'unset';

/**
 * Event types emitted by the REPL
 */
export type ReplEvent =
  | 'start'
  | 'command'
  | 'error'
  | 'exit'
  | 'session-change'
  | 'network-change'
  | 'wallet-change';

/**
 * Event handler for REPL events
 */
export interface ReplEventHandler {
  event: ReplEvent;
  handler: (data?: any) => void;
}

/**
 * Theme colors for the REPL
 */
export interface ReplTheme {
  /** Prompt color */
  prompt: string;
  /** Success message color */
  success: string;
  /** Error message color */
  error: string;
  /** Warning message color */
  warning: string;
  /** Info message color */
  info: string;
  /** Muted/dim color */
  muted: string;
  /** Highlight color */
  highlight: string;
}

/**
 * Search result for history search (Ctrl+R)
 */
export interface HistorySearchResult {
  /** Matching history entries */
  matches: HistoryEntry[];
  /** Current search query */
  query: string;
  /** Currently selected index */
  selectedIndex: number;
}
