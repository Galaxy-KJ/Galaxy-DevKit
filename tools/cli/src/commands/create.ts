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
import { ProjectScaffolder } from '../utils/project-scaffolder.js';
import { DependencyInstaller } from '../utils/dependency-installer.js';
import { TemplateLoader } from '../utils/template-loader.js';
import { ProjectOptions } from '../types/template-types.js';

const createCommand = new Command('create');

createCommand
  .description('Create a new Galaxy project from template')
  .argument('[name]', 'Project name')
  .option('-t, --template <template>', 'Template to use', 'basic')
  .option('-d, --directory <directory>', 'Directory to create project in')
  .option('--skip-install', 'Skip dependency installation')
  .action(async (name, options) => {
    const templateLoader = new TemplateLoader();
    const scaffolder = new ProjectScaffolder();
    const installer = new DependencyInstaller();

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

      // Get available templates and validate
      const availableTemplates = await templateLoader.listTemplates();
      const templateNames = availableTemplates.map(t => t.name);

      if (!templateNames.includes(options.template)) {
        console.error(chalk.red(`Invalid template: ${options.template}`));
        console.error(chalk.yellow(`Available templates: ${templateNames.join(', ')}`));
        process.exit(1);
      }

      const projectOptions: ProjectOptions = {
        name,
        template: options.template,
        directory: options.directory,
        skipInstall: options.skipInstall
      };

      console.log(chalk.blue(`Creating Galaxy project: ${name}`));
      console.log(chalk.gray(`Template: ${options.template}`));
      console.log(chalk.gray(`Directory: ${projectOptions.directory || path.resolve(process.cwd(), name)}`));

      // Scaffold project
      const scaffoldSpinner = ora('Scaffolding project...').start();
      const result = await scaffolder.scaffoldProject(projectOptions);

      if (!result.success) {
        scaffoldSpinner.fail('Project scaffolding failed');
        if (result.errors && result.errors.length > 0) {
          result.errors.forEach(error => console.error(chalk.red(`  ${error}`)));
        }
        process.exit(1);
      }

      scaffoldSpinner.succeed('Project scaffolded successfully');

      // Install dependencies
      if (!options.skipInstall) {
        const templateConfig = await templateLoader.loadTemplate(options.template);
        const installSuccess = await installer.installDependencies(result.projectPath, templateConfig);

        if (!installSuccess) {
          console.error(chalk.yellow('Dependency installation failed, but project was created'));
          console.error(chalk.gray('You can install dependencies manually with: npm install'));
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


export { createCommand };

