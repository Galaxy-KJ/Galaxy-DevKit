/**
 * @fileoverview Project scaffolder utility for Galaxy CLI
 * @description Handles project scaffolding from templates
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import { TemplateConfig, ProjectOptions, ScaffoldResult } from '../types/template-types.js';
import { TemplateLoader } from './template-loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ProjectScaffolder {
  private templateLoader: TemplateLoader;

  constructor() {
    this.templateLoader = new TemplateLoader();
  }

  /**
   * Scaffolds a new project from a template
   * @param options - Project creation options
   * @returns Promise<ScaffoldResult>
   */
  async scaffoldProject(options: ProjectOptions): Promise<ScaffoldResult> {
    const result: ScaffoldResult = {
      success: false,
      projectPath: '',
      errors: [],
      warnings: []
    };

    // Ensure arrays are initialized
    if (!result.errors) result.errors = [];
    if (!result.warnings) result.warnings = [];

    try {
      // Validate template exists
      if (!await this.templateLoader.templateExists(options.template)) {
        result.errors.push(`Template '${options.template}' not found`);
        return result;
      }

      // Load template configuration
      const templateConfig = await this.templateLoader.loadTemplate(options.template);

      // Determine project directory
      const projectDir = options.directory || path.resolve(process.cwd(), options.name);

      // Check if directory already exists
      if (await fs.pathExists(projectDir)) {
        result.errors.push(`Directory ${projectDir} already exists`);
        return result;
      }

      result.projectPath = projectDir;

      // Create project directory
      await fs.ensureDir(projectDir);

      // Scaffold template files
      await this.scaffoldTemplateFiles(templateConfig, projectDir, options);

      // Update package.json with project name
      await this.updatePackageJson(projectDir, options.name, templateConfig);

      // Run post-install scripts if any
      if (templateConfig.postInstall && templateConfig.postInstall.length > 0) {
        await this.runPostInstallScripts(templateConfig.postInstall, projectDir);
      }

      result.success = true;

    } catch (error) {
      result.errors.push(`Scaffolding failed: ${(error as Error).message}`);
    }

    return result;
  }

  /**
   * Scaffolds template files to project directory
   * @param config - Template configuration
   * @param projectDir - Project directory
   * @param options - Project options
   */
  private async scaffoldTemplateFiles(
    config: TemplateConfig,
    projectDir: string,
    options: ProjectOptions
  ): Promise<void> {
    const templateDir = path.join('/home/user/Galaxy-DevKit/packages/templates', options.template);

    // Copy all files from template directory
    await fs.copy(templateDir, projectDir, {
      filter: (src) => {
        const relativePath = path.relative(templateDir, src);
        // Skip template.json and unnecessary files
        return !relativePath.startsWith('template.json') &&
               !src.includes('node_modules') &&
               !src.includes('.git') &&
               !src.includes('dist') &&
               !src.includes('.next') &&
               !src.includes('.DS_Store');
      }
    });

    // Process template files with variable substitution
    await this.processTemplateFiles(config, projectDir, options);
  }

  /**
   * Processes template files with variable substitution
   * @param config - Template configuration
   * @param projectDir - Project directory
   * @param options - Project options
   */
  private async processTemplateFiles(
    config: TemplateConfig,
    projectDir: string,
    options: ProjectOptions
  ): Promise<void> {
    const variables = {
      PROJECT_NAME: options.name,
      PROJECT_NAME_LOWER: options.name.toLowerCase(),
      PROJECT_NAME_UPPER: options.name.toUpperCase(),
      AUTHOR: config.author,
      VERSION: config.version,
      DESCRIPTION: config.description
    };

    // Process each file in the template
    for (const file of config.files) {
      const filePath = path.join(projectDir, file.path);

      if (await fs.pathExists(filePath)) {
        let content = await fs.readFile(filePath, 'utf-8');

        // Replace variables in content
        content = this.replaceVariables(content, variables);

        await fs.writeFile(filePath, content, 'utf-8');

        // Set executable permissions if needed
        if (file.executable) {
          await fs.chmod(filePath, 0o755);
        }
      }
    }
  }

  /**
   * Replaces variables in content
   * @param content - File content
   * @param variables - Variables to replace
   * @returns string
   */
  private replaceVariables(content: string, variables: Record<string, string>): string {
    let result = content;

    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, value);
    }

    return result;
  }

  /**
   * Updates package.json with project-specific information
   * @param projectDir - Project directory
   * @param projectName - Project name
   * @param config - Template configuration
   */
  private async updatePackageJson(
    projectDir: string,
    projectName: string,
    config: TemplateConfig
  ): Promise<void> {
    const packageJsonPath = path.join(projectDir, 'package.json');

    if (!await fs.pathExists(packageJsonPath)) {
      // Create package.json if it doesn't exist
      const packageJson = {
        name: projectName,
        version: config.version,
        description: config.description,
        author: config.author,
        scripts: config.scripts,
        dependencies: {},
        devDependencies: {}
      };

      await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
      return;
    }

    // Update existing package.json
    const packageJson = await fs.readJson(packageJsonPath);
    packageJson.name = projectName;
    packageJson.version = config.version;
    packageJson.description = config.description;
    packageJson.author = config.author;

    // Merge scripts
    if (config.scripts) {
      packageJson.scripts = { ...packageJson.scripts, ...config.scripts };
    }

    await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
  }

  /**
   * Runs post-install scripts
   * @param scripts - Array of scripts to run
   * @param projectDir - Project directory
   */
  private async runPostInstallScripts(scripts: string[], projectDir: string): Promise<void> {
    for (const script of scripts) {
      try {
        // Note: In a real implementation, you'd use execa or similar to run these scripts
        console.log(chalk.gray(`Running post-install script: ${script}`));
        // await execa(script, [], { cwd: projectDir, shell: true });
      } catch (error) {
        console.warn(chalk.yellow(`Post-install script failed: ${script}`));
      }
    }
  }
}