/**
 * @fileoverview Create command for Galaxy CLI
 * @description Creates new projects from templates
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

const createCommand = new Command('create');

createCommand
  .description('Create a new Galaxy project from template')
  .argument('[name]', 'Project name')
  .option('-t, --template <template>', 'Template to use', 'basic')
  .option('-d, --directory <directory>', 'Directory to create project in')
  .option('--skip-install', 'Skip dependency installation')
  .action(async (name, options) => {
    try {
      // If no name provided, prompt for it
      if (!name) {
        const answers = await inquirer.prompt([
          {
            type: 'input',
            name: 'name',
            message: 'What is your project name?',
            validate: (input) => {
              if (!input.trim()) {
                return 'Project name is required';
              }
              if (!/^[a-zA-Z0-9-_]+$/.test(input)) {
                return 'Project name can only contain letters, numbers, hyphens, and underscores';
              }
              return true;
            }
          }
        ]);
        name = answers.name;
      }

      // Validate template
      const availableTemplates = ['basic', 'defi', 'nft', 'enterprise'];
      if (!availableTemplates.includes(options.template)) {
        console.error(chalk.red(`Invalid template: ${options.template}`));
        console.error(chalk.yellow(`Available templates: ${availableTemplates.join(', ')}`));
        process.exit(1);
      }

      // Determine project directory
      const projectDir = options.directory || path.resolve(process.cwd(), name);
      
      // Check if directory already exists
      if (await fs.pathExists(projectDir)) {
        console.error(chalk.red(`Directory ${projectDir} already exists`));
        process.exit(1);
      }

      console.log(chalk.blue(`Creating Galaxy project: ${name}`));
      console.log(chalk.gray(`Template: ${options.template}`));
      console.log(chalk.gray(`Directory: ${projectDir}`));

      // Create project directory
      const spinner = ora('Creating project directory...').start();
      await fs.ensureDir(projectDir);
      spinner.succeed('Project directory created');

      // Copy template files
      const templateSpinner = ora('Copying template files...').start();
      await copyTemplateFiles(options.template, projectDir);
      templateSpinner.succeed('Template files copied');

      // Update package.json with project name
      const packageJsonPath = path.join(projectDir, 'package.json');
      if (await fs.pathExists(packageJsonPath)) {
        const packageJson = await fs.readJson(packageJsonPath);
        packageJson.name = name;
        await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
      }

      // Install dependencies
      if (!options.skipInstall) {
        const installSpinner = ora('Installing dependencies...').start();
        try {
          await execa('npm', ['install'], { cwd: projectDir });
          installSpinner.succeed('Dependencies installed');
        } catch (error) {
          installSpinner.fail('Failed to install dependencies');
          console.error(chalk.yellow('You can install dependencies manually with: npm install'));
        }
      }

      // Success message
      console.log(chalk.green('\n✅ Project created successfully!'));
      console.log(chalk.blue('\nNext steps:'));
      console.log(chalk.gray(`  cd ${name}`));
      if (options.skipInstall) {
        console.log(chalk.gray('  npm install'));
      }
      console.log(chalk.gray('  npm run dev'));

    } catch (error) {
      console.error(chalk.red('Error creating project:'), (error as Error).message);
      process.exit(1);
    }
  });

/**
 * Copies template files to project directory
 * @param template - Template name
 * @param projectDir - Project directory
 */
async function copyTemplateFiles(template: string, projectDir: string): Promise<void> {
  const templateDir = path.join(__dirname, '../../templates', template);
  
  if (!await fs.pathExists(templateDir)) {
    throw new Error(`Template ${template} not found`);
  }

  // Copy all files from template directory
  await fs.copy(templateDir, projectDir, {
    filter: (src) => {
      // Skip node_modules and other unnecessary files
      return !src.includes('node_modules') && 
             !src.includes('.git') && 
             !src.includes('dist') &&
             !src.includes('.next');
    }
  });
}

export { createCommand };

