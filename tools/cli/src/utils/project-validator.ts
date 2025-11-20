/**
 * @fileoverview Project validator utility for Galaxy CLI
 * @description Validates existing projects for Galaxy DevKit integration
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';

export interface ValidationResult {
  isValid: boolean;
  projectType: string | null;
  warnings: string[];
  errors: string[];
  recommendations: string[];
}

export interface ProjectInfo {
  hasPackageJson: boolean;
  hasNodeModules: boolean;
  hasTypeScript: boolean;
  hasGit: boolean;
  framework: string | null;
  packageManager: string | null;
  existingGalaxyConfig: boolean;
}

export class ProjectValidator {
  /**
   * Validates a project directory for Galaxy DevKit integration
   * @param projectRoot - Root directory of the project
   * @returns Promise<ValidationResult>
   */
  async validateProject(projectRoot: string): Promise<ValidationResult> {
    const result: ValidationResult = {
      isValid: true,
      projectType: null,
      warnings: [],
      errors: [],
      recommendations: [],
    };

    try {
      const projectInfo = await this.analyzeProject(projectRoot);

      // Check for package.json
      if (!projectInfo.hasPackageJson) {
        result.errors.push('No package.json found. This does not appear to be a Node.js project.');
        result.isValid = false;
        return result;
      }

      // Check for existing Galaxy configuration
      if (projectInfo.existingGalaxyConfig) {
        result.warnings.push('Galaxy DevKit is already initialized in this project.');
        result.warnings.push('Running init again will overwrite existing configuration.');
      }

      // Determine project type
      result.projectType = await this.detectProjectType(projectRoot, projectInfo);

      // Validate framework compatibility
      await this.validateFrameworkCompatibility(result, projectInfo);

      // Check Node.js version compatibility
      await this.validateNodeVersion(result);

      // Check for potential conflicts
      await this.checkForConflicts(result, projectRoot, projectInfo);

      // Generate recommendations
      this.generateRecommendations(result, projectInfo);

    } catch (error) {
      result.errors.push(`Validation failed: ${(error as Error).message}`);
      result.isValid = false;
    }

    return result;
  }

  /**
   * Analyzes the project structure and gathers information
   * @param projectRoot - Project root directory
   * @returns Promise<ProjectInfo>
   */
  private async analyzeProject(projectRoot: string): Promise<ProjectInfo> {
    const packageJsonPath = path.join(projectRoot, 'package.json');
    const nodeModulesPath = path.join(projectRoot, 'node_modules');
    const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
    const gitPath = path.join(projectRoot, '.git');
    const galaxyConfigPath = path.join(projectRoot, 'galaxy.config.js');

    const [
      hasPackageJson,
      hasNodeModules,
      hasTypeScript,
      hasGit,
      existingGalaxyConfig,
    ] = await Promise.all([
      fs.pathExists(packageJsonPath),
      fs.pathExists(nodeModulesPath),
      fs.pathExists(tsconfigPath),
      fs.pathExists(gitPath),
      fs.pathExists(galaxyConfigPath),
    ]);

    let packageManager: string | null = null;
    let framework: string | null = null;

    if (hasPackageJson) {
      try {
        const packageJson = await fs.readJson(packageJsonPath);

        // Detect package manager
        if (await fs.pathExists(path.join(projectRoot, 'yarn.lock'))) {
          packageManager = 'yarn';
        } else if (await fs.pathExists(path.join(projectRoot, 'pnpm-lock.yaml'))) {
          packageManager = 'pnpm';
        } else if (await fs.pathExists(path.join(projectRoot, 'package-lock.json'))) {
          packageManager = 'npm';
        }

        // Detect framework
        framework = this.detectFrameworkFromPackageJson(packageJson);
      } catch (error) {
        console.warn(chalk.yellow(`Warning: Could not parse package.json: ${(error as Error).message}`));
      }
    }

    return {
      hasPackageJson,
      hasNodeModules,
      hasTypeScript,
      hasGit,
      framework,
      packageManager,
      existingGalaxyConfig,
    };
  }

  /**
   * Detects the project type based on analysis
   * @param projectRoot - Project root directory
   * @param projectInfo - Project information
   * @returns Promise<string>
   */
  private async detectProjectType(projectRoot: string, projectInfo: ProjectInfo): Promise<string> {
    // If framework is detected from package.json, use that
    if (projectInfo.framework) {
      return projectInfo.framework;
    }

    // Check for common framework indicators
    const indicators = [
      { file: 'next.config.js', type: 'next' },
      { file: 'nuxt.config.js', type: 'nuxt' },
      { file: 'angular.json', type: 'angular' },
      { file: 'vue.config.js', type: 'vue' },
      { file: 'svelte.config.js', type: 'svelte' },
      { file: 'vite.config.js', type: 'vanilla' }, // Could be React, Vue, etc.
      { file: 'webpack.config.js', type: 'vanilla' },
    ];

    for (const indicator of indicators) {
      if (await fs.pathExists(path.join(projectRoot, indicator.file))) {
        return indicator.type;
      }
    }

    // Check for React-specific files
    const reactFiles = ['src/App.js', 'src/App.tsx', 'src/index.js', 'src/index.tsx'];
    for (const file of reactFiles) {
      if (await fs.pathExists(path.join(projectRoot, file))) {
        return 'react';
      }
    }

    // Default to vanilla Node.js project
    return 'node';
  }

  /**
   * Detects framework from package.json dependencies
   * @param packageJson - Package.json content
   * @returns string | null
   */
  private detectFrameworkFromPackageJson(packageJson: any): string | null {
    const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

    if (deps['next']) return 'next';
    if (deps['nuxt']) return 'nuxt';
    if (deps['@angular/core']) return 'angular';
    if (deps['vue']) return 'vue';
    if (deps['svelte']) return 'svelte';
    if (deps['react']) return 'react';
    if (deps['express']) return 'node';

    return null;
  }

  /**
   * Validates framework compatibility with Galaxy DevKit
   * @param result - Validation result
   * @param projectInfo - Project information
   */
  private async validateFrameworkCompatibility(result: ValidationResult, projectInfo: ProjectInfo): Promise<void> {
    const supportedFrameworks = ['react', 'vue', 'angular', 'node', 'next', 'nuxt', 'svelte', 'vanilla'];

    if (result.projectType && !supportedFrameworks.includes(result.projectType)) {
      result.warnings.push(`Framework '${result.projectType}' may not be fully supported by Galaxy DevKit.`);
      result.recommendations.push('Consider using a supported framework: React, Vue, Angular, Next.js, Nuxt.js, Svelte, or vanilla JavaScript/TypeScript.');
    }
  }

  /**
   * Validates Node.js version compatibility
   * @param result - Validation result
   */
  private async validateNodeVersion(result: ValidationResult): Promise<void> {
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.replace('v', '').split('.')[0]);

    if (majorVersion < 16) {
      result.errors.push(`Node.js version ${nodeVersion} is not supported. Galaxy DevKit requires Node.js 16 or higher.`);
      result.isValid = false;
    } else if (majorVersion < 18) {
      result.warnings.push(`Node.js version ${nodeVersion} is supported but Node.js 18+ is recommended for optimal performance.`);
    }
  }

  /**
   * Checks for potential conflicts with existing configuration
   * @param result - Validation result
   * @param projectRoot - Project root directory
   * @param projectInfo - Project information
   */
  private async checkForConflicts(result: ValidationResult, projectRoot: string, projectInfo: ProjectInfo): Promise<void> {
    // Check for conflicting configuration files
    const conflictingFiles = [
      'galaxy.config.json', // Old format
      '.galaxyrc',
    ];

    for (const file of conflictingFiles) {
      if (await fs.pathExists(path.join(projectRoot, file))) {
        result.warnings.push(`Found conflicting configuration file: ${file}`);
      }
    }

    // Check for existing Stellar-related configurations
    const stellarFiles = [
      'stellar.config.js',
      'soroban.config.js',
    ];

    for (const file of stellarFiles) {
      if (await fs.pathExists(path.join(projectRoot, file))) {
        result.warnings.push(`Found existing Stellar configuration: ${file}. Galaxy DevKit will extend this configuration.`);
      }
    }
  }

  /**
   * Generates recommendations based on project analysis
   * @param result - Validation result
   * @param projectInfo - Project information
   */
  private generateRecommendations(result: ValidationResult, projectInfo: ProjectInfo): void {
    if (!projectInfo.hasGit) {
      result.recommendations.push('Consider initializing a Git repository for version control.');
    }

    if (!projectInfo.hasNodeModules && projectInfo.hasPackageJson) {
      result.recommendations.push('Run npm install (or your preferred package manager) to install dependencies before initializing Galaxy DevKit.');
    }

    if (result.projectType === 'node' && !projectInfo.hasTypeScript) {
      result.recommendations.push('Consider adding TypeScript support for better development experience with Galaxy DevKit.');
    }

    result.recommendations.push('Review the generated .env.galaxy file and add your API keys and configuration.');
    result.recommendations.push('Run galaxy dev to start development with Galaxy DevKit features.');
  }

  /**
   * Gets a human-readable summary of the validation result
   * @param result - Validation result
   * @returns string
   */
  static getSummary(result: ValidationResult): string {
    let summary = '';

    if (result.isValid) {
      summary += chalk.green('✅ Project validation passed\n');
    } else {
      summary += chalk.red('❌ Project validation failed\n');
    }

    if (result.projectType) {
      summary += chalk.blue(`📁 Detected project type: ${result.projectType}\n`);
    }

    if (result.errors.length > 0) {
      summary += chalk.red('\nErrors:\n');
      result.errors.forEach(error => {
        summary += chalk.red(`  • ${error}\n`);
      });
    }

    if (result.warnings.length > 0) {
      summary += chalk.yellow('\nWarnings:\n');
      result.warnings.forEach(warning => {
        summary += chalk.yellow(`  • ${warning}\n`);
      });
    }

    if (result.recommendations.length > 0) {
      summary += chalk.blue('\nRecommendations:\n');
      result.recommendations.forEach(rec => {
        summary += chalk.blue(`  • ${rec}\n`);
      });
    }

    return summary;
  }
}