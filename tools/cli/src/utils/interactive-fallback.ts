/**
 * @fileoverview Auto-fallback system — when a user runs a command without required
 *   arguments/flags, this module intercepts the error and redirects to the
 *   corresponding interactive PromptFlow.
 * @description Maps command paths to prompt flow IDs so that missing-argument
 *   errors are transparently converted into guided interactive prompts.
 *   Maintains backward compatibility: when `--non-interactive` or `--json` is
 *   passed (or CI env var is set), the original error is surfaced instead.
 * @since 2026-07-29
 */

import type { Command } from 'commander';

/**
 * Registry mapping command paths (e.g. "wallet send") to prompt flow IDs.
 * Extend this map when new PromptFlows are added.
 */
export const COMMAND_TO_PROMPT_FLOW: Record<string, string> = {
  // Wallet commands
  'wallet create': 'wallet:create',
  'wallet import': 'wallet:import',
  'wallet list': 'wallet:list',
  'wallet info': 'wallet:info',
  'wallet balance': 'wallet:balance',
  'wallet fund': 'wallet:fund',
  'wallet send': 'wallet:send',

  // DeFi commands
  'defi blend supply': 'defi:blend-supply',
  'defi blend borrow': 'defi:blend-borrow',
  'defi swap': 'defi:swap',
  'defi pools list': 'defi:pools',

  // Oracle commands
  'oracle price': 'oracle:price',

  // Protocol commands
  'protocol supply': 'protocol:supply',
  'protocol swap execute': 'protocol:swap',
  'protocol liquidity add': 'protocol:liquidity',
};

/**
 * Extract the canonical command path from a Commander command.
 * Walks up parent commands to build a full path, e.g. "wallet send".
 */
export function getCommandPath(cmd: Command): string {
  const parts: string[] = [];
  let current: Command | null = cmd;
  while (current) {
    const name = current.name();
    if (name && name !== 'galaxy') {
      parts.unshift(name);
    }
    current = (current as any).parent ?? null;
  }
  return parts.join(' ');
}

/**
 * Check whether we should bypass interactive prompts (CI/CD mode).
 * Returns true when any of these conditions are met:
 *   - `--non-interactive` is present in process.argv
 *   - `--json` is present in process.argv
 *   - CI environment variable is set
 *   - NON_INTERACTIVE environment variable is set
 */
export function isNonInteractive(): boolean {
  const args = process.argv.slice(2);

  // Check for explicit bypass flags
  if (args.includes('--non-interactive') || args.includes('--json')) {
    return true;
  }

  // Check environment variables
  if (process.env.CI || process.env.NON_INTERACTIVE) {
    return true;
  }

  return false;
}

/**
 * Determine if an error from Commander is a "missing required argument" error
 * that should trigger interactive fallback.
 */
export function isMissingArgumentError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    msg.includes("missing required argument") ||
    msg.includes("required argument") ||
    msg.includes("not enough arguments") ||
    msg.includes("command requires") ||
    msg.includes("enter a command") ||
    error.message.includes("error: missing required")
  );
}

/**
 * Determine if a command can be resolved to a prompt flow.
 */
export function getPromptFlowForCommand(cmd: Command): string | undefined {
  const path = getCommandPath(cmd);
  return COMMAND_TO_PROMPT_FLOW[path];
}
