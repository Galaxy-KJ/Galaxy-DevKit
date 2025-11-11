/**
 * @fileoverview Dependency installer utility for Galaxy CLI
 * @description Handles dependency installation for created projects
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { execa } from 'execa';
import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { TemplateConfig, DependencyInfo } from '../types/template-types.js';

export class DependencyInstaller {
  /**
   * Installs dependencies for a project
   * @param projectDir - Project directory
   * @param config - Template configuration
   * @returns Promise<boolean>
   */
  async installDependencies(projectDir: string, config: TemplateConfig): Promise<boolean> {
    try {
      // Check if package.json exists
      const packageJsonPath = path.join(projectDir, 'package.json');
      if (!await fs.pathExists(packageJsonPath)) {
        console.warn(chalk.yellow('No package.json found, skipping dependency installation'));
        return false;
      }

      // Update package.json with dependencies
      await this.updatePackageJson(packageJsonPath, config);

      // Install dependencies
      console.log(chalk.blue('Installing dependencies...'));
      await this.runInstallCommand(projectDir);

      return true;
    } catch (error) {
      console.error(chalk.red(`Failed to install dependencies: ${(error as Error).message}`));
      return false;
    }
  }

  /**
   * Updates package.json with template dependencies
   * @param packageJsonPath - Path to package.json
   * @param config - Template configuration
   */
  private async updatePackageJson(packageJsonPath: string, config: TemplateConfig): Promise<void> {
    const packageJson = await fs.readJson(packageJsonPath);

    // Add dependencies
    if (config.dependencies && config.dependencies.length > 0) {
      packageJson.dependencies = packageJson.dependencies || {};
      for (const dep of config.dependencies) {
        const depInfo = this.parseDependency(dep);
        packageJson.dependencies[depInfo.name] = depInfo.version;
      }
    }

    // Add dev dependencies
    if (config.devDependencies && config.devDependencies.length > 0) {
      packageJson.devDependencies = packageJson.devDependencies || {};
      for (const dep of config.devDependencies) {
        const depInfo = this.parseDependency(dep);
        packageJson.devDependencies[depInfo.name] = depInfo.version;
      }
    }

    // Add scripts
    if (config.scripts) {
      packageJson.scripts = { ...packageJson.scripts, ...config.scripts };
    }

    await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
  }

  /**
   * Parses dependency string into name and version
   * @param dep - Dependency string (e.g., "react@^18.0.0" or "lodash")
   * @returns DependencyInfo
   */
  private parseDependency(dep: string): DependencyInfo {
    // Handle scoped packages: @scope/name@version
    const atIndex = dep.lastIndexOf('@');
    if (atIndex === -1 || atIndex === 0) {
      // No version specified, or starts with @ (scoped without version)
      return { name: dep, version: 'latest' };
    }

    const name = dep.substring(0, atIndex);
    const version = dep.substring(atIndex + 1);

    return { name, version };
  }

  /**
   * Runs the install command
   * @param projectDir - Project directory
   */
  private async runInstallCommand(projectDir: string): Promise<void> {
    try {
      // Try npm first
      await execa('npm', ['install'], {
        cwd: projectDir,
        stdio: 'inherit',
        timeout: 300000 // 5 minutes timeout
      });
    } catch (npmError) {
      console.warn(chalk.yellow('npm install failed, trying yarn...'));

      try {
        // Try yarn as fallback
        await execa('yarn', ['install'], {
          cwd: projectDir,
          stdio: 'inherit',
          timeout: 300000
        });
      } catch (yarnError) {
        console.warn(chalk.yellow('yarn install also failed, trying pnpm...'));

        try {
          // Try pnpm as last resort
          await execa('pnpm', ['install'], {
            cwd: projectDir,
            stdio: 'inherit',
            timeout: 300000
          });
        } catch (pnpmError) {
          throw new Error('All package managers failed to install dependencies');
        }
      }
    }
  }

  /**
   * Checks if a package manager is available
   * @param manager - Package manager name
   * @returns Promise<boolean>
   */
  async isPackageManagerAvailable(manager: 'npm' | 'yarn' | 'pnpm'): Promise<boolean> {
    try {
      await execa(manager, ['--version'], { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Gets the preferred package manager for the project
   * @param projectDir - Project directory
   * @returns Promise<string>
   */
  async getPreferredPackageManager(projectDir: string): Promise<string> {
    // Check for lock files
    const lockFiles = [
      { file: 'yarn.lock', manager: 'yarn' },
      { file: 'pnpm-lock.yaml', manager: 'pnpm' },
      { file: 'package-lock.json', manager: 'npm' }
    ];

    for (const { file, manager } of lockFiles) {
      if (await fs.pathExists(path.join(projectDir, file))) {
        return manager;
      }
    }

    // Check availability
    if (await this.isPackageManagerAvailable('yarn')) return 'yarn';
    if (await this.isPackageManagerAvailable('pnpm')) return 'pnpm';
    if (await this.isPackageManagerAvailable('npm')) return 'npm';

    throw new Error('No package manager found');
  }
}