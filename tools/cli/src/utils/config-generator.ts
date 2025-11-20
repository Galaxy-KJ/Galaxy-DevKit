/**
 * @fileoverview Configuration generator utility for Galaxy CLI
 * @description Generates configuration files for Galaxy DevKit integration
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { GalaxyConfig } from '../templates/galaxy-config.js';

export interface ConfigOptions {
  projectType: 'react' | 'vue' | 'angular' | 'node' | 'next' | 'nuxt' | 'svelte' | 'vanilla';
  features: string[];
  stellarNetwork: 'testnet' | 'mainnet' | 'futurenet';
  apiKeys?: {
    stellar?: string;
    supabase?: string;
  };
}

export class ConfigGenerator {
  /**
   * Generates Galaxy DevKit configuration files
   * @param projectRoot - Root directory of the project
   * @param options - Configuration options
   * @returns Promise<boolean>
   */
  async generateConfig(projectRoot: string, options: ConfigOptions): Promise<boolean> {
    try {
      console.log(chalk.blue('Generating Galaxy DevKit configuration...'));

      // Generate galaxy.config.js
      await this.generateGalaxyConfig(projectRoot, options);

      // Generate environment variables
      await this.generateEnvFile(projectRoot, options);

      // Generate TypeScript types if needed
      if (await this.hasTypeScript(projectRoot)) {
        await this.generateTypesFile(projectRoot, options);
      }

      console.log(chalk.green('Configuration files generated successfully'));
      return true;
    } catch (error) {
      console.error(chalk.red(`Failed to generate configuration: ${(error as Error).message}`));
      return false;
    }
  }

  /**
   * Generates the main galaxy.config.js file
   * @param projectRoot - Project root directory
   * @param options - Configuration options
   */
  private async generateGalaxyConfig(projectRoot: string, options: ConfigOptions): Promise<void> {
    const configPath = path.join(projectRoot, 'galaxy.config.js');
    const configContent = GalaxyConfig.generate(options);

    await fs.writeFile(configPath, configContent, 'utf-8');
    console.log(chalk.gray(`  ✓ Created galaxy.config.js`));
  }

  /**
   * Generates .env.galaxy file with environment variables
   * @param projectRoot - Project root directory
   * @param options - Configuration options
   */
  private async generateEnvFile(projectRoot: string, options: ConfigOptions): Promise<void> {
    const envPath = path.join(projectRoot, '.env.galaxy');
    let envContent = `# Galaxy DevKit Environment Variables
# Add these to your main .env file or rename this file to .env

# Stellar Network Configuration
GALAXY_STELLAR_NETWORK=${options.stellarNetwork}
GALAXY_STELLAR_HORIZON_URL=https://horizon${options.stellarNetwork === 'mainnet' ? '' : `-${options.stellarNetwork}`}.stellar.org

# API Keys (replace with your actual keys)
`;

    if (options.apiKeys?.stellar) {
      envContent += `GALAXY_STELLAR_API_KEY=${options.apiKeys.stellar}\n`;
    } else {
      envContent += `# GALAXY_STELLAR_API_KEY=your_stellar_api_key_here\n`;
    }

    if (options.apiKeys?.supabase) {
      envContent += `GALAXY_SUPABASE_URL=${options.apiKeys.supabase}\n`;
    } else {
      envContent += `# GALAXY_SUPABASE_URL=your_supabase_project_url\n`;
      envContent += `# GALAXY_SUPABASE_ANON_KEY=your_supabase_anon_key\n`;
    }

    // Add feature-specific environment variables
    if (options.features.includes('wallet')) {
      envContent += `
# Wallet Configuration
GALAXY_WALLET_ENCRYPTION_KEY=your_wallet_encryption_key_here
GALAXY_WALLET_STORAGE_PATH=./.galaxy/wallet
`;
    }

    if (options.features.includes('automation')) {
      envContent += `
# Automation Configuration
GALAXY_AUTOMATION_DB_PATH=./.galaxy/automation.db
GALAXY_AUTOMATION_LOG_LEVEL=info
`;
    }

    if (options.features.includes('api')) {
      envContent += `
# API Configuration
GALAXY_API_PORT=3001
GALAXY_API_HOST=localhost
GALAXY_API_CORS_ORIGIN=http://localhost:3000
`;
    }

    await fs.writeFile(envPath, envContent, 'utf-8');
    console.log(chalk.gray(`  ✓ Created .env.galaxy`));
  }

  /**
   * Generates TypeScript declaration file if project uses TypeScript
   * @param projectRoot - Project root directory
   * @param options - Configuration options
   */
  private async generateTypesFile(projectRoot: string, options: ConfigOptions): Promise<void> {
    const typesPath = path.join(projectRoot, 'types', 'galaxy.d.ts');

    let typesContent = `// Galaxy DevKit Type Definitions
/// <reference types="@galaxy/core" />

declare module 'galaxy.config' {
  interface GalaxyConfig {
    projectType: '${options.projectType}';
    features: string[];
    stellar: {
      network: '${options.stellarNetwork}';
      horizonUrl: string;
    };
  }

  const config: GalaxyConfig;
  export default config;
}
`;

    // Ensure types directory exists
    await fs.ensureDir(path.dirname(typesPath));
    await fs.writeFile(typesPath, typesContent, 'utf-8');
    console.log(chalk.gray(`  ✓ Created types/galaxy.d.ts`));
  }

  /**
   * Checks if the project uses TypeScript
   * @param projectRoot - Project root directory
   * @returns Promise<boolean>
   */
  private async hasTypeScript(projectRoot: string): Promise<boolean> {
    const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
    const packageJsonPath = path.join(projectRoot, 'package.json');

    // Check for tsconfig.json
    if (await fs.pathExists(tsconfigPath)) {
      return true;
    }

    // Check package.json for TypeScript dependency
    if (await fs.pathExists(packageJsonPath)) {
      try {
        const packageJson = await fs.readJson(packageJsonPath);
        const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
        return 'typescript' in deps || 'ts-node' in deps;
      } catch {
        // Ignore JSON parse errors
      }
    }

    return false;
  }

  /**
   * Updates package.json with Galaxy DevKit scripts and dependencies
   * @param projectRoot - Project root directory
   * @param options - Configuration options
   */
  async updatePackageJson(projectRoot: string, options: ConfigOptions): Promise<void> {
    const packageJsonPath = path.join(projectRoot, 'package.json');

    if (!await fs.pathExists(packageJsonPath)) {
      throw new Error('package.json not found');
    }

    const packageJson = await fs.readJson(packageJsonPath);

    // Add Galaxy scripts
    packageJson.scripts = packageJson.scripts || {};
    packageJson.scripts['galaxy:dev'] = 'galaxy dev';
    packageJson.scripts['galaxy:build'] = 'galaxy build';
    packageJson.scripts['galaxy:test'] = 'galaxy test';

    // Add feature-specific scripts
    if (options.features.includes('wallet')) {
      packageJson.scripts['galaxy:wallet'] = 'galaxy wallet';
    }

    if (options.features.includes('automation')) {
      packageJson.scripts['galaxy:automation'] = 'galaxy automation';
    }

    if (options.features.includes('api')) {
      packageJson.scripts['galaxy:api'] = 'galaxy api';
    }

    await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });
    console.log(chalk.gray(`  ✓ Updated package.json with Galaxy scripts`));
  }
}