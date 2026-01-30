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
  .action(async (options) => {
    try {
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

      // Build based on options
      if (options.contracts) {
        await buildContracts(options);
      } else if (options.frontend) {
        await buildFrontend(options);
      } else if (options.backend) {
        await buildBackend(options);
      } else {
        // Build all components
        await buildAll(options);
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

/**
 * Builds all components
 * @param options - Build options
 */
async function buildAll(options: any): Promise<void> {
  console.log(chalk.blue('Building all components...'));

  // Build contracts
  await buildContracts(options);

  // Build frontend
  await buildFrontend(options);

  // Build backend
  await buildBackend(options);
}

export { buildCommand };

