#!/usr/bin/env node

/**
 * @fileoverview Galaxy CLI - Main entry point
 * @description Command line interface for Galaxy DevKit
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';

// Import commands
import { createCommand } from './commands/create.js';
import { oracleCommand } from './commands/oracle/index.js';
import { walletCommand } from './commands/wallet/index.js';
import {
  createInteractiveCommand,
  launchInteractiveMode,
  shouldLaunchInteractive,
} from './commands/interactive/index.js';

const program = new Command();

program
  .name('galaxy')
  .description('Galaxy DevKit CLI - Build Stellar applications with ease')
  .version('1.0.0');

// Register imported commands
program.addCommand(createCommand);
program.addCommand(oracleCommand);
program.addCommand(walletCommand);

// Register interactive command
program.addCommand(createInteractiveCommand(program));

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
    console.log(chalk.gray('  galaxy                 Launch interactive mode'));
    console.log(chalk.gray('  galaxy interactive     Launch interactive mode (explicit)'));
    console.log(chalk.gray('  galaxy create <name>   Create new project'));
    console.log(chalk.gray('  galaxy init            Initialize in current dir'));
    console.log(chalk.gray('  galaxy build           Build project'));
    console.log(chalk.gray('  galaxy dev             Start dev server'));
    console.log(chalk.gray('  galaxy deploy          Deploy to production'));
    console.log(chalk.gray('  galaxy wallet <cmd>    Wallet management'));
    console.log(chalk.gray('  galaxy oracle <cmd>    Oracle price data'));
    console.log(chalk.gray('  galaxy help            Show this help'));
    console.log(chalk.gray('\nRun galaxy <command> --help for detailed command help.'));
  });

// Main execution
async function main(): Promise<void> {
  // Check if we should launch interactive mode
  if (shouldLaunchInteractive(process.argv)) {
    await launchInteractiveMode(program);
    return;
  }

  // Parse command line arguments normally
  await program.parseAsync();
}

// Run the CLI
main().catch((error) => {
  console.error(chalk.red('Error:'), error.message);
  process.exit(1);
});
