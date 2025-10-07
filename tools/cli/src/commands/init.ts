/**
 * @fileoverview Init command for Galaxy CLI
 * @description Initializes a new Galaxy project in current directory
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import fs from 'fs-extra';
import path from 'path';
import { execa } from 'execa';

const initCommand = new Command('init');

initCommand
  .description('Initialize a new Galaxy project in current directory')
  .option('-t, --template <template>', 'Template to use', 'basic')
  .option('--skip-install', 'Skip dependency installation')
  .action(async (options) => {
    try {
      const currentDir = process.cwd();
      const packageJsonPath = path.join(currentDir, 'package.json');

      // Check if package.json already exists
      if (await fs.pathExists(packageJsonPath)) {
        const answers = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'overwrite',
            message: 'package.json already exists. Do you want to overwrite it?',
            default: false
          }
        ]);

        if (!answers.overwrite) {
          console.log(chalk.yellow('Initialization cancelled'));
          return;
        }
      }

      console.log(chalk.blue('Initializing Galaxy project...'));
      console.log(chalk.gray(`Template: ${options.template}`));
      console.log(chalk.gray(`Directory: ${currentDir}`));

      // Validate template
      const availableTemplates = ['basic', 'defi', 'nft', 'enterprise'];
      if (!availableTemplates.includes(options.template)) {
        console.error(chalk.red(`Invalid template: ${options.template}`));
        console.error(chalk.yellow(`Available templates: ${availableTemplates.join(', ')}`));
        process.exit(1);
      }

      // Copy template files
      const spinner = ora('Copying template files...').start();
      await copyTemplateFiles(options.template, currentDir);
      spinner.succeed('Template files copied');

      // Install dependencies
      if (!options.skipInstall) {
        const installSpinner = ora('Installing dependencies...').start();
        try {
          await execa('npm', ['install'], { cwd: currentDir });
          installSpinner.succeed('Dependencies installed');
        } catch (error) {
          installSpinner.fail('Failed to install dependencies');
          console.error(chalk.yellow('You can install dependencies manually with: npm install'));
        }
      }

      // Success message
      console.log(chalk.green('\n✅ Project initialized successfully!'));
      console.log(chalk.blue('\nNext steps:'));
      if (options.skipInstall) {
        console.log(chalk.gray('  npm install'));
      }
      console.log(chalk.gray('  npm run dev'));

    } catch (error) {
      console.error(chalk.red('Error initializing project:'), (error as Error).message);
      process.exit(1);
    }
  });

/**
 * Copies template files to current directory
 * @param template - Template name
 * @param targetDir - Target directory
 */
async function copyTemplateFiles(template: string, targetDir: string): Promise<void> {
  const templateDir = path.join(__dirname, '../../templates', template);
  
  if (!await fs.pathExists(templateDir)) {
    throw new Error(`Template ${template} not found`);
  }

  // Copy all files from template directory
  await fs.copy(templateDir, targetDir, {
    filter: (src) => {
      // Skip node_modules and other unnecessary files
      return !src.includes('node_modules') && 
             !src.includes('.git') && 
             !src.includes('dist') &&
             !src.includes('.next');
    }
  });
}

export { initCommand };

