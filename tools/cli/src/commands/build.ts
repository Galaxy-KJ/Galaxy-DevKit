/**
 * @fileoverview Build command for Galaxy CLI
 * @description Builds Galaxy projects for production
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';

const buildCommand = new Command('build');

buildCommand
  .description('Build Galaxy project for production')
  .option('-o, --output <directory>', 'Output directory', './dist')
  .option('--optimize', 'Optimize build for production')
  .option('--contracts', 'Build smart contracts only')
  .option('--frontend', 'Build frontend only')
  .option('--backend', 'Build backend only')
  .option('--json', 'Output in JSON format (disables interactive prompts)')
  .option('-y, --yes', 'Skip confirmation prompts')
  .action(async (options) => {
    try {
      const isJson = options.json === true;
      const skipConfirm = options.yes === true;

      console.log(chalk.blue('Building Galaxy project...'));

      // Check if we're in a Galaxy project
      const packageJsonPath = path.join(process.cwd(), 'package.json');
      if (!await fs.pathExists(packageJsonPath)) {
        console.error(chalk.red('Not in a Galaxy project directory'));
        console.error(chalk.yellow('Run this command from your Galaxy project root'));
        process.exit(1);
      }

      const packageJson = await fs.readJson(packageJsonPath);
      if (!packageJson.name?.includes('galaxy') && !packageJson.dependencies?.['@galaxy-kj/']) {
        console.error(chalk.red('Not a Galaxy project'));
        console.error(chalk.yellow('This command must be run from a Galaxy project'));
        process.exit(1);
      }

      // Detect available components
      const hasContracts = await fs.pathExists(path.join(process.cwd(), 'contracts'));
      const hasFrontend = await fs.pathExists(path.join(process.cwd(), 'next.config.js'));
      const hasBackend = await fs.pathExists(path.join(process.cwd(), 'backend')) ||
                         await fs.pathExists(path.join(process.cwd(), 'api'));

      const componentFlagsProvided = options.contracts || options.frontend || options.backend;

      // If no component flags were provided, prompt interactively
      if (!componentFlagsProvided) {
        const availableComponents: string[] = [];
        if (hasContracts) availableComponents.push('contracts');
        if (hasFrontend) availableComponents.push('frontend');
        if (hasBackend) availableComponents.push('backend');

        if (availableComponents.length === 0) {
          console.log(chalk.yellow('No buildable components found in this project'));
          process.exit(0);
        }

        if (isJson) {
          // In JSON mode, build all available components
          options.contracts = hasContracts;
          options.frontend = hasFrontend;
          options.backend = hasBackend;
        } else {
          const choices = [
            ...availableComponents,
            { name: chalk.gray('Build all components'), value: '__all__' },
          ];
          const answer = await inquirer.prompt([{
            type: 'checkbox',
            name: 'components',
            message: 'Select components to build:',
            choices,
            validate: (selected: string[]) => selected.length > 0 ? true : 'Select at least one component',
          }]);

          const selected = answer.components as string[];
          const buildAll = selected.includes('__all__');
          options.contracts = buildAll || selected.includes('contracts');
          options.frontend = buildAll || selected.includes('frontend');
          options.backend = buildAll || selected.includes('backend');
        }
      }

      // Show build preview
      if (!skipConfirm && !isJson) {
        const targets: string[] = [];
        if (options.contracts) targets.push('contracts');
        if (options.frontend) targets.push('frontend');
        if (options.backend) targets.push('backend');

        console.log(chalk.cyan('\n--- Build Preview ---'));
        console.log(chalk.white(`  Targets:  ${targets.join(', ')}`));
        console.log(chalk.white(`  Output:   ${options.output}`));
        console.log(chalk.white(`  Optimize: ${options.optimize ? 'Yes' : 'No'}`));
        console.log(chalk.cyan('---------------------\n'));

        const { confirm } = await inquirer.prompt([{
          type: 'confirm',
          name: 'confirm',
          message: 'Proceed with build?',
          default: true,
        }]);

        if (!confirm) {
          console.log(chalk.yellow('Build cancelled.'));
          process.exit(0);
        }
      }

      // Build based on options
      if (options.contracts) {
        await buildContracts(options);
      }
      if (options.frontend) {
        await buildFrontend(options);
      }
      if (options.backend) {
        await buildBackend(options);
      }

      console.log(chalk.green('\n✅ Build completed successfully!'));

    } catch (error) {
      console.error(chalk.red('Error building project:'), (error as Error).message);
      process.exit(1);
    }
  });

/**
 * Builds smart contracts
 * @param options - Build options
 */
async function buildContracts(options: any): Promise<void> {
  const spinner = ora('Building smart contracts...').start();
  
  try {
    const contractsDir = path.join(process.cwd(), 'contracts');
    
    if (!await fs.pathExists(contractsDir)) {
      console.log(chalk.yellow('No contracts directory found, skipping contract build'));
      return;
    }

    const contracts = await fs.readdir(contractsDir);
    const contractDirs = [];

    for (const contract of contracts) {
      const contractPath = path.join(contractsDir, contract);
      const stat = await fs.stat(contractPath);
      if (stat.isDirectory()) {
        contractDirs.push(contract);
      }
    }

    if (contractDirs.length === 0) {
      console.log(chalk.yellow('No contracts found to build'));
      return;
    }

    // Build each contract
    for (const contract of contractDirs) {
      const contractSpinner = ora(`Building contract: ${contract}`).start();
      
      try {
        // Build Rust contract
        await execa('cargo', ['build', '--release'], { cwd: path.join(contractsDir, contract) });
        contractSpinner.succeed(`Contract ${contract} built successfully`);
      } catch (error) {
        contractSpinner.fail(`Failed to build contract ${contract}`);
        throw error;
      }
    }

    spinner.succeed('Smart contracts built successfully');

  } catch (error) {
    spinner.fail('Failed to build smart contracts');
    throw error;
  }
}

/**
 * Builds frontend
 * @param options - Build options
 */
async function buildFrontend(options: any): Promise<void> {
  const spinner = ora('Building frontend...').start();
  
  try {
    // Check if this is a Next.js project
    const nextConfigPath = path.join(process.cwd(), 'next.config.js');
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    
    if (!await fs.pathExists(nextConfigPath)) {
      console.log(chalk.yellow('No Next.js project found, skipping frontend build'));
      return;
    }

    const packageJson = await fs.readJson(packageJsonPath);
    if (!packageJson.scripts?.build) {
      console.log(chalk.yellow('No build script found in package.json'));
      return;
    }

    // Build frontend
    await execa('npm', ['run', 'build'], { cwd: process.cwd() });
    spinner.succeed('Frontend built successfully');

  } catch (error) {
    spinner.fail('Failed to build frontend');
    throw error;
  }
}

/**
 * Builds backend
 * @param options - Build options
 */
async function buildBackend(options: any): Promise<void> {
  const spinner = ora('Building backend...').start();
  
  try {
    // Check if backend exists
    const backendDir = path.join(process.cwd(), 'backend');
    const apiDir = path.join(process.cwd(), 'api');
    
    if (!await fs.pathExists(backendDir) && !await fs.pathExists(apiDir)) {
      console.log(chalk.yellow('No backend found, skipping backend build'));
      return;
    }

    const serverDir = await fs.pathExists(backendDir) ? backendDir : apiDir;
    const packageJsonPath = path.join(serverDir, 'package.json');
    
    if (!await fs.pathExists(packageJsonPath)) {
      console.log(chalk.yellow('No package.json found in backend directory'));
      return;
    }

    const packageJson = await fs.readJson(packageJsonPath);
    if (!packageJson.scripts?.build) {
      console.log(chalk.yellow('No build script found in backend package.json'));
      return;
    }

    // Build backend
    await execa('npm', ['run', 'build'], { cwd: serverDir });
    spinner.succeed('Backend built successfully');

  } catch (error) {
    spinner.fail('Failed to build backend');
    throw error;
  }
}

export { buildCommand };
