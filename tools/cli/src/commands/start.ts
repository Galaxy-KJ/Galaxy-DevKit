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
import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';

const startCommand = new Command('start');

startCommand
  .description('Start development servers and services')
  .option('-p, --port <port>', 'Port to run on', '3000')
  .option('--api', 'Start API server only')
  .option('--frontend', 'Start frontend only')
  .option('--backend', 'Start backend only')
  .option('--dev', 'Start in development mode')
  .action(async (options) => {
    try {
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

      // Start services based on options
      if (options.api) {
        await startAPIServer(options);
      } else if (options.frontend) {
        await startFrontend(options);
      } else if (options.backend) {
        await startBackend(options);
      } else {
        // Start all services
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

