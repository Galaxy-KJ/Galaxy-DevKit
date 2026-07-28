/**
 * @fileoverview Start command for Galaxy CLI
 * @description Starts development servers and services
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

const startCommand = new Command('start');

startCommand
  .description('Start development servers and services')
  .option('-p, --port <port>', 'Port to run on')
  .option('--api', 'Start API server only')
  .option('--frontend', 'Start frontend only')
  .option('--backend', 'Start backend only')
  .option('--dev', 'Start in development mode')
  .option('--json', 'Output in JSON format (disables interactive prompts)')
  .option('-y, --yes', 'Skip confirmation prompts')
  .action(async (options) => {
    try {
      const isJson = options.json === true;
      const skipConfirm = options.yes === true;

      console.log(chalk.blue('Starting Galaxy development environment...'));

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

      // Detect available services
      const hasApi = await fs.pathExists(path.join(process.cwd(), 'api')) ||
                     await fs.pathExists(path.join(process.cwd(), 'backend'));
      const hasFrontend = await fs.pathExists(path.join(process.cwd(), 'next.config.js'));
      const hasBackend = await fs.pathExists(path.join(process.cwd(), 'backend')) ||
                         await fs.pathExists(path.join(process.cwd(), 'api'));

      const componentFlagsProvided = options.api || options.frontend || options.backend;

      // Resolve port interactively if not provided
      if (!options.port) {
        if (isJson) {
          options.port = '3000';
        } else {
          const answer = await inquirer.prompt([{
            type: 'input',
            name: 'port',
            message: 'Port to run on:',
            default: '3000',
            validate: (val: string) => {
              const n = parseInt(val, 10);
              return n > 0 && n <= 65535 ? true : 'Enter a valid port number (1-65535)';
            },
          }]);
          options.port = answer.port;
        }
      }

      // If no component flags were provided, prompt interactively
      if (!componentFlagsProvided) {
        const availableServices: string[] = [];
        if (hasApi) availableServices.push('api');
        if (hasFrontend) availableServices.push('frontend');
        if (hasBackend) availableServices.push('backend');

        if (availableServices.length === 0) {
          console.log(chalk.yellow('No services found in this project'));
          process.exit(0);
        }

        if (isJson) {
          // In JSON mode, start all services
          options.api = hasApi;
          options.frontend = hasFrontend;
          options.backend = hasBackend;
        } else {
          const choices = [
            ...availableServices,
            { name: chalk.gray('Start all services'), value: '__all__' },
          ];
          const answer = await inquirer.prompt([{
            type: 'checkbox',
            name: 'services',
            message: 'Select services to start:',
            choices,
            validate: (selected: string[]) => selected.length > 0 ? true : 'Select at least one service',
          }]);

          const selected = answer.services as string[];
          const startAll = selected.includes('__all__');
          options.api = startAll || selected.includes('api');
          options.frontend = startAll || selected.includes('frontend');
          options.backend = startAll || selected.includes('backend');
        }
      }

      // Show start preview
      if (!skipConfirm && !isJson) {
        const targets: string[] = [];
        if (options.api) targets.push('api');
        if (options.frontend) targets.push('frontend');
        if (options.backend) targets.push('backend');

        console.log(chalk.cyan('\n--- Start Preview ---'));
        console.log(chalk.white(`  Services: ${targets.join(', ')}`));
        console.log(chalk.white(`  Port:     ${options.port}`));
        console.log(chalk.white(`  Dev mode: ${options.dev ? 'Yes' : 'No'}`));
        console.log(chalk.cyan('---------------------\n'));

        const { confirm } = await inquirer.prompt([{
          type: 'confirm',
          name: 'confirm',
          message: 'Proceed?',
          default: true,
        }]);

        if (!confirm) {
          console.log(chalk.yellow('Startup cancelled.'));
          process.exit(0);
        }
      }

      // Start services based on options
      if (options.api) {
        await startAPIServer(options);
      }
      if (options.frontend) {
        await startFrontend(options);
      }
      if (options.backend) {
        await startBackend(options);
      }

      // If no specific service was requested, start all
      if (!options.api && !options.frontend && !options.backend) {
        await startAllServices(options);
      }

      console.log(chalk.green('\n✅ Development environment started successfully!'));

    } catch (error) {
      console.error(chalk.red('Error starting development environment:'), (error as Error).message);
      process.exit(1);
    }
  });

/**
 * Starts API server
 * @param options - Start options
 */
async function startAPIServer(options: any): Promise<void> {
  const spinner = ora('Starting API server...').start();
  
  try {
    // Check if API server exists
    const apiDir = path.join(process.cwd(), 'api');
    const backendDir = path.join(process.cwd(), 'backend');
    
    if (!await fs.pathExists(apiDir) && !await fs.pathExists(backendDir)) {
      console.log(chalk.yellow('No API server found, skipping API server start'));
      return;
    }

    const serverDir = await fs.pathExists(apiDir) ? apiDir : backendDir;
    const packageJsonPath = path.join(serverDir, 'package.json');
    
    if (!await fs.pathExists(packageJsonPath)) {
      console.log(chalk.yellow('No package.json found in API directory'));
      return;
    }

    const packageJson = await fs.readJson(packageJsonPath);
    if (!packageJson.scripts?.dev && !packageJson.scripts?.start) {
      console.log(chalk.yellow('No dev or start script found in API package.json'));
      return;
    }

    // Start API server
    const script = packageJson.scripts.dev || packageJson.scripts.start;
    await execa('npm', ['run', script], { 
      cwd: serverDir,
      stdio: 'inherit'
    });

    spinner.succeed('API server started');

  } catch (error) {
    spinner.fail('Failed to start API server');
    throw error;
  }
}

/**
 * Starts frontend
 * @param options - Start options
 */
async function startFrontend(options: any): Promise<void> {
  const spinner = ora('Starting frontend...').start();
  
  try {
    // Check if this is a Next.js project
    const nextConfigPath = path.join(process.cwd(), 'next.config.js');
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    
    if (!await fs.pathExists(nextConfigPath)) {
      console.log(chalk.yellow('No Next.js project found, skipping frontend start'));
      return;
    }

    const packageJson = await fs.readJson(packageJsonPath);
    if (!packageJson.scripts?.dev) {
      console.log(chalk.yellow('No dev script found in package.json'));
      return;
    }

    // Start frontend
    await execa('npm', ['run', 'dev'], { 
      cwd: process.cwd(),
      stdio: 'inherit'
    });

    spinner.succeed('Frontend started');

  } catch (error) {
    spinner.fail('Failed to start frontend');
    throw error;
  }
}

/**
 * Starts backend
 * @param options - Start options
 */
async function startBackend(options: any): Promise<void> {
  const spinner = ora('Starting backend...').start();
  
  try {
    // Check if backend exists
    const backendDir = path.join(process.cwd(), 'backend');
    const apiDir = path.join(process.cwd(), 'api');
    
    if (!await fs.pathExists(backendDir) && !await fs.pathExists(apiDir)) {
      console.log(chalk.yellow('No backend found, skipping backend start'));
      return;
    }

    const serverDir = await fs.pathExists(backendDir) ? backendDir : apiDir;
    const packageJsonPath = path.join(serverDir, 'package.json');
    
    if (!await fs.pathExists(packageJsonPath)) {
      console.log(chalk.yellow('No package.json found in backend directory'));
      return;
    }

    const packageJson = await fs.readJson(packageJsonPath);
    if (!packageJson.scripts?.dev && !packageJson.scripts?.start) {
      console.log(chalk.yellow('No dev or start script found in backend package.json'));
      return;
    }

    // Start backend
    const script = packageJson.scripts.dev || packageJson.scripts.start;
    await execa('npm', ['run', script], { 
      cwd: serverDir,
      stdio: 'inherit'
    });

    spinner.succeed('Backend started');

  } catch (error) {
    spinner.fail('Failed to start backend');
    throw error;
  }
}

/**
 * Starts all services
 * @param options - Start options
 */
async function startAllServices(options: any): Promise<void> {
  console.log(chalk.blue('Starting all services...'));

  // Start API server
  await startAPIServer(options);

  // Start frontend
  await startFrontend(options);

  // Start backend
  await startBackend(options);
}

export { startCommand };
