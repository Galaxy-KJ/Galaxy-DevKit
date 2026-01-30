/**
 * @fileoverview Test command for Galaxy CLI
 * @description Runs tests for Galaxy projects
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

const testCommand = new Command('test');

testCommand
  .description('Run tests for Galaxy project')
  .option('-w, --watch', 'Watch mode for continuous testing')
  .option('-c, --coverage', 'Generate coverage report')
  .option('--contracts', 'Test smart contracts only')
  .option('--frontend', 'Test frontend only')
  .option('--backend', 'Test backend only')
  .action(async (options) => {
    try {
      console.log(chalk.blue('Running Galaxy project tests...'));

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

      // Run different types of tests based on options
      if (options.contracts) {
        await runContractTests(options);
      } else if (options.frontend) {
        await runFrontendTests(options);
      } else if (options.backend) {
        await runBackendTests(options);
      } else {
        // Run all tests
        await runAllTests(options);
      }

      console.log(chalk.green('\n✅ All tests completed successfully!'));

    } catch (error) {
      console.error(chalk.red('Error running tests:'), (error as Error).message);
      process.exit(1);
    }
  });

/**
 * Runs smart contract tests
 * @param options - Test options
 */
async function runContractTests(options: any): Promise<void> {
  const spinner = ora('Running smart contract tests...').start();
  
  try {
    const contractsDir = path.join(process.cwd(), 'contracts');
    
    if (!await fs.pathExists(contractsDir)) {
      console.log(chalk.yellow('No contracts directory found, skipping contract tests'));
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
      console.log(chalk.yellow('No contracts found to test'));
      return;
    }

    // Run tests for each contract
    for (const contract of contractDirs) {
      const contractSpinner = ora(`Testing contract: ${contract}`).start();
      
      try {
        // Run cargo test for Rust contracts
        await execa('cargo', ['test'], { cwd: path.join(contractsDir, contract) });
        contractSpinner.succeed(`Contract ${contract} tests passed`);
      } catch (error) {
        contractSpinner.fail(`Contract ${contract} tests failed`);
        throw error;
      }
    }

    spinner.succeed('Smart contract tests completed');

  } catch (error) {
    spinner.fail('Smart contract tests failed');
    throw error;
  }
}

/**
 * Runs frontend tests
 * @param options - Test options
 */
async function runFrontendTests(options: any): Promise<void> {
  const spinner = ora('Running frontend tests...').start();
  
  try {
    // Check if Jest is configured
    const jestConfigPath = path.join(process.cwd(), 'jest.config.js');
    const packageJsonPath = path.join(process.cwd(), 'package.json');
    
    if (!await fs.pathExists(jestConfigPath)) {
      console.log(chalk.yellow('No Jest configuration found, skipping frontend tests'));
      return;
    }

    const packageJson = await fs.readJson(packageJsonPath);
    if (!packageJson.scripts?.test) {
      console.log(chalk.yellow('No test script found in package.json'));
      return;
    }

    // Build test command
    const testArgs = ['test'];
    if (options.watch) {
      testArgs.push('--watch');
    }
    if (options.coverage) {
      testArgs.push('--coverage');
    }

    // Run tests
    await execa('npm', testArgs, { cwd: process.cwd() });
    spinner.succeed('Frontend tests completed');

  } catch (error) {
    spinner.fail('Frontend tests failed');
    throw error;
  }
}

/**
 * Runs backend tests
 * @param options - Test options
 */
async function runBackendTests(options: any): Promise<void> {
  const spinner = ora('Running backend tests...').start();
  
  try {
    // Check if there's a backend directory
    const backendDir = path.join(process.cwd(), 'backend');
    const apiDir = path.join(process.cwd(), 'api');
    
    if (!await fs.pathExists(backendDir) && !await fs.pathExists(apiDir)) {
      console.log(chalk.yellow('No backend directory found, skipping backend tests'));
      return;
    }

    // Run backend tests
    const testDir = await fs.pathExists(backendDir) ? backendDir : apiDir;
    await execa('npm', ['test'], { cwd: testDir });
    
    spinner.succeed('Backend tests completed');

  } catch (error) {
    spinner.fail('Backend tests failed');
    throw error;
  }
}

/**
 * Runs all tests
 * @param options - Test options
 */
async function runAllTests(options: any): Promise<void> {
  console.log(chalk.blue('Running all tests...'));

  // Run contract tests
  await runContractTests(options);

  // Run frontend tests
  await runFrontendTests(options);

  // Run backend tests
  await runBackendTests(options);
}

export { testCommand };

