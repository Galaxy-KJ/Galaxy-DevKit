#!/usr/bin/env node

/**
 * @fileoverview Galaxy CLI - Main entry point
 * @description Command line interface for Galaxy DevKit
 * @author Galaxy DevKit Team
 * @version 1.2.0
 * @since 2024-12-01
 *
 * Interactive Mode (v1.2.0):
 * When commands are invoked without required arguments/flags, the CLI
 * automatically falls back to interactive prompts (PromptFlows) to guide
 * the user. This behaviour can be bypassed by passing --non-interactive,
 * --json, setting CI=true, or NON_INTERACTIVE=true in the environment.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';

// Import commands
import { createCommand } from './commands/create.js';
import { oracleCommand } from './commands/oracle/index.js';
import { walletCommand } from './commands/wallet/index.js';
import { protocolCommand } from './commands/protocol/index.js';
import { blendCommand } from './commands/blend/index.js';
import { defiCommand } from './commands/defi/index.js';
import {
  createInteractiveCommand,
  launchInteractiveMode,
  shouldLaunchInteractive,
  attachMenuCommand,
} from './commands/interactive/index.js';

// Import interactive fallback system
import { isNonInteractive } from './utils/interactive-fallback.js';

const program = new Command();

program
  .name('galaxy')
  .description('Galaxy DevKit CLI - Build Stellar applications with ease')
  .version('1.0.0')
  .option('--non-interactive', 'Disable interactive prompts (for CI/CD and scripting)');

// Register imported commands
program.addCommand(createCommand);
program.addCommand(oracleCommand);
program.addCommand(walletCommand);
program.addCommand(protocolCommand);
program.addCommand(blendCommand);
program.addCommand(defiCommand);

// Register interactive command (raw REPL) and the guided menu command
program.addCommand(createInteractiveCommand(program));
attachMenuCommand(program);

// Watch command
import { watchCommand } from './commands/watch/index.js';
program.addCommand(watchCommand);

// Init command
program
  .command('init')
  .description('Initialize Galaxy DevKit in current directory')
  .option('-n, --name <name>', 'Project name')
  .action(async (options: any) => {
    const spinner = ora('Initializing Galaxy DevKit...').start();

    try {
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate work
      spinner.succeed(chalk.green('✅ Galaxy DevKit initialized!'));
      console.log(chalk.blue('\n🔧 Configuration:'));
      console.log(chalk.gray('  ├── Stellar SDK configured'));
      console.log(chalk.gray('  ├── Supabase connected'));
      console.log(chalk.gray('  └── CLI tools ready'));
    } catch (error) {
      spinner.fail(chalk.red('Failed to initialize'));
      process.exit(1);
    }
  });

// Build command
program
  .command('build')
  .description('Build the project')
  .option('-w, --watch', 'Watch for changes')
  .action(async (options: any) => {
    const spinner = ora('Building project...').start();

    try {
      await new Promise(resolve => setTimeout(resolve, 3000)); // Simulate work
      spinner.succeed(chalk.green('✅ Build completed successfully!'));
      console.log(chalk.blue('\n📦 Build output:'));
      console.log(chalk.gray('  ├── dist/'));
      console.log(chalk.gray('  ├── contracts/'));
      console.log(chalk.gray('  └── supabase/'));
    } catch (error) {
      spinner.fail(chalk.red('Build failed'));
      process.exit(1);
    }
  });

// Dev command
program
  .command('dev')
  .description('Start development server')
  .option('-p, --port <port>', 'Port number', '3000')
  .action(async (options: any) => {
    console.log(chalk.blue('🚀 Starting Galaxy DevKit development server...'));
    console.log(chalk.gray(`📡 Server running on http://localhost:${options.port}`));
    console.log(chalk.yellow('\n✨ Features available:'));
    console.log(chalk.gray('  ├── Stellar SDK'));
    console.log(chalk.gray('  ├── Smart Contracts'));
    console.log(chalk.gray('  ├── Supabase Integration'));
    console.log(chalk.gray('  └── Real-time Updates'));
    console.log(chalk.green('\n🎯 Ready for development!'));
  });

// Deploy command
program
  .command('deploy')
  .description('Deploy to production')
  .option('-e, --env <environment>', 'Environment', 'production')
  .action(async (options: any) => {
    const spinner = ora('Deploying to production...').start();

    try {
      await new Promise(resolve => setTimeout(resolve, 4000)); // Simulate work
      spinner.succeed(chalk.green('✅ Deployment completed!'));
      console.log(chalk.blue('\n🌐 Deployment info:'));
      console.log(chalk.gray('  ├── Environment: ' + options.env));
      console.log(chalk.gray('  ├── Contracts deployed'));
      console.log(chalk.gray('  └── APIs active'));
    } catch (error) {
      spinner.fail(chalk.red('Deployment failed'));
      process.exit(1);
    }
  });

// Help command (updated to include interactive mode)
program
  .command('help')
  .description('Show help information')
  .action(() => {
    console.log(chalk.blue('🌟 Galaxy DevKit CLI'));
    console.log(chalk.gray('Build Stellar applications with ease\n'));
    console.log(chalk.yellow('Available commands:'));
    console.log(chalk.gray('  galaxy                       Launch interactive REPL (raw)'));
    console.log(chalk.gray('  galaxy -i                     Launch guided menu (recommended)'));
    console.log(chalk.gray('  galaxy menu                   Launch guided menu (explicit)'));
    console.log(chalk.gray('  galaxy interactive            Launch interactive REPL (explicit)'));
    console.log(chalk.gray('  galaxy create <name>          Create new project'));
    console.log(chalk.gray('  galaxy init                   Initialize in current dir'));
    console.log(chalk.gray('  galaxy build                  Build project'));
    console.log(chalk.gray('  galaxy dev                    Start dev server'));
    console.log(chalk.gray('  galaxy deploy                 Deploy to production'));
    console.log(chalk.gray('  galaxy wallet <cmd>           Wallet management'));
    console.log(chalk.gray('  galaxy oracle <cmd>           Oracle price data'));
    console.log(chalk.gray('  galaxy protocol <cmd>         DeFi protocol interactions'));
    console.log(chalk.gray('  galaxy blend <cmd>            Blend Protocol DeFi'));
    console.log(chalk.gray('  galaxy defi <cmd>             DeFi CLI (supply, borrow, swap, pools)'));
    console.log(chalk.gray('  galaxy watch <cmd>            Real-time monitoring'));
    console.log(chalk.gray('  galaxy help                   Show this help'));
    console.log(chalk.gray('\n📌 Interactive mode:'));
    console.log(chalk.gray('  Run any command without required args for guided prompts.'));
    console.log(chalk.gray('  Use --non-interactive or --json to skip prompts (CI/CD).'));
    console.log(chalk.gray('\nRun galaxy <command> --help for detailed command help.'));
  });

function wantsGuidedMenu(argv: string[]): boolean {
  const args = argv.slice(2);
  return args.some((a) => a === '-i' || a === '--interactive');
}

/**
 * Run a command with interactive fallback.
 * If the command fails due to missing required arguments and we are not
 * in non-interactive mode, attempt to find and run a corresponding PromptFlow.
 */
async function runWithFallback(): Promise<void> {
  // Attempt normal parsing first.
  try {
    await program.parseAsync();
    return;
  } catch (err) {
    // If in non-interactive mode (CI/CD, --json, --non-interactive),
    // re-throw the original error.
    if (isNonInteractive()) {
      throw err;
    }

    // Try to find the last parsed command and look up a prompt flow.
    const lastCmd = findLastParsedCommand(program);
    if (lastCmd) {
      const { getPromptFlowForCommand } = await import('./utils/interactive-fallback.js');
      const { getPromptFlow, runPromptFlow } = await import('./commands/interactive/prompts/index.js');

      const flowId = getPromptFlowForCommand(lastCmd);
      if (flowId) {
        const flow = getPromptFlow(flowId);
        if (flow) {
          console.log(chalk.dim('\n  Missing required arguments — launching interactive prompts.\n'));
          const executor = buildReusableExecutor(program);
          const result = await runPromptFlow(flow, executor);
          if (result.error) {
            console.error(chalk.red(`\n  ✖  Error: ${result.error.message}\n`));
            process.exit(1);
          }
          return;
        }
      }
    }

    // No fallback available — re-throw the original error.
    throw err;
  }
}

/**
 * Walk the Commander program's command tree to find the most recently
 * parsed command (the deepest subcommand in the invocation chain).
 */
function findLastParsedCommand(program: Command): Command | null {
  // Commander stores the last parsed args — walk subcommands that match.
  const argv = process.argv.slice(2);
  const parts = argv.filter((a) => !a.startsWith('-'));

  let current: Command = program;
  let last: Command | null = null;

  for (const part of parts) {
    const child = current.commands.find((c) => c.name() === part);
    if (child) {
      last = child;
      current = child;
    } else {
      break;
    }
  }

  return last;
}

/**
 * Build a reusable executor that feeds argv into a fresh Commander instance
 * with all registered commands (same pattern as the menu system uses).
 */
function buildReusableExecutor(program: Command): (args: string[]) => Promise<void> {
  return async (args: string[]) => {
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
  };
}

// Main execution
async function main(): Promise<void> {
  // `galaxy -i` and `--interactive` launch the guided menu — the experience
  // promised by the AC: "All major operations available through prompts".
  if (wantsGuidedMenu(process.argv)) {
    await program.parseAsync(['node', 'galaxy', 'menu']);
    return;
  }

  // No arguments at all → raw REPL (back-compat with existing usage and tests).
  if (shouldLaunchInteractive(process.argv)) {
    await launchInteractiveMode(program);
    return;
  }

  // Run with automatic interactive fallback when args are missing.
  await runWithFallback();
}

// Run the CLI
main().catch((error) => {
  // Show a helpful message instead of a raw commander error.
  const message = error?.message ?? String(error);
  if (
    message.includes('missing required argument') ||
    message.includes('required argument')
  ) {
    console.error(chalk.red('Error:'), message);
    console.log(chalk.yellow('\n💡 Tip: Run the command without arguments for interactive prompts,'));
    console.log(chalk.yellow('   or use --help to see the required arguments.'));
    console.log(chalk.yellow('   Use --non-interactive to skip prompts in CI/CD.'));
  } else {
    console.error(chalk.red('Error:'), message);
  }
  process.exit(1);
});
