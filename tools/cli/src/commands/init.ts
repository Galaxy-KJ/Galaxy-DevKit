/**
 * @fileoverview Init command for Galaxy CLI
 * @description Initializes Galaxy DevKit in an existing project
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
import { ProjectValidator, ValidationResult } from '../utils/project-validator.js';
import { ConfigGenerator, ConfigOptions } from '../utils/config-generator.js';
import { DependencyInstaller } from '../utils/dependency-installer.js';

const initCommand = new Command('init');

initCommand
  .description('Initialize Galaxy DevKit in an existing project')
  .option('-y, --yes', 'Skip interactive prompts and use defaults')
  .option('--skip-install', 'Skip dependency installation')
  .option('--project-type <type>', 'Force project type (react, vue, angular, node, next, nuxt, svelte, vanilla)')
  .option('--features <features>', 'Comma-separated list of features to enable (wallet,automation,api,contracts)')
  .option('--network <network>', 'Stellar network to use (testnet, mainnet, futurenet)', 'testnet')
  .action(async (options) => {
    const projectRoot = process.cwd();
    const validator = new ProjectValidator();
    const configGenerator = new ConfigGenerator();
    const dependencyInstaller = new DependencyInstaller();

    try {
      console.log(chalk.blue('🚀 Galaxy DevKit Initialization'));
      console.log(chalk.gray(`Project directory: ${projectRoot}\n`));

      // Validate project
      const validationSpinner = ora('Validating project...').start();
      const validationResult = await validator.validateProject(projectRoot);
      validationSpinner.succeed('Project validation complete');

      // Display validation results
      console.log(ProjectValidator.getSummary(validationResult));

      if (!validationResult.isValid) {
        console.error(chalk.red('❌ Cannot initialize Galaxy DevKit due to validation errors.'));
        process.exit(1);
      }

      // Get configuration options
      const configOptions = await getConfigurationOptions(validationResult, options);

      // Confirm initialization
      if (!options.yes) {
        const confirm = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'proceed',
            message: 'Do you want to proceed with Galaxy DevKit initialization?',
            default: true,
          },
        ]);

        if (!confirm.proceed) {
          console.log(chalk.yellow('Initialization cancelled by user.'));
          return;
        }
      }

      // Generate configuration
      const configSpinner = ora('Generating Galaxy DevKit configuration...').start();
      const configSuccess = await configGenerator.generateConfig(projectRoot, configOptions);
      if (!configSuccess) {
        configSpinner.fail('Configuration generation failed');
        process.exit(1);
      }
      configSpinner.succeed('Configuration generated');

      // Update package.json
      const packageSpinner = ora('Updating package.json...').start();
      await configGenerator.updatePackageJson(projectRoot, configOptions);
      packageSpinner.succeed('Package.json updated');

      // Install Galaxy DevKit dependencies
      if (!options.skipInstall) {
        const installSpinner = ora('Installing Galaxy DevKit dependencies...').start();
        const installSuccess = await installGalaxyDependencies(projectRoot, configOptions);
        if (!installSuccess) {
          installSpinner.fail('Dependency installation failed');
          console.error(chalk.yellow('You can install dependencies manually with: npm install'));
        } else {
          installSpinner.succeed('Dependencies installed');
        }
      }

      // Create .galaxy directory for internal files
      await createGalaxyDirectory(projectRoot);

      // Success message
      console.log(chalk.green('\n✅ Galaxy DevKit initialized successfully!'));
      console.log(chalk.blue('\n📋 Next steps:'));
      console.log(chalk.gray('  1. Review and configure .env.galaxy file'));
      console.log(chalk.gray('  2. Add your API keys to environment variables'));
      if (options.skipInstall) {
        console.log(chalk.gray('  3. Run npm install to install dependencies'));
      }
      console.log(chalk.gray('  4. Run npm run galaxy:dev to start development'));

      // Display feature-specific instructions
      displayFeatureInstructions(configOptions);

    } catch (error) {
      console.error(chalk.red('❌ Error initializing Galaxy DevKit:'), (error as Error).message);
      process.exit(1);
    }
  });

/**
 * Gets configuration options from user input or defaults
 * @param validationResult - Project validation result
 * @param cliOptions - CLI options
 * @returns Promise<ConfigOptions>
 */
async function getConfigurationOptions(validationResult: ValidationResult, cliOptions: any): Promise<ConfigOptions> {
  let projectType = cliOptions.projectType || validationResult.projectType || 'vanilla';
  let features = cliOptions.features ? cliOptions.features.split(',').map((f: string) => f.trim()) : [];
  let stellarNetwork = cliOptions.network || 'testnet';

  if (!cliOptions.yes && !cliOptions.projectType) {
    // Interactive mode
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'projectType',
        message: 'What type of project is this?',
        choices: [
          { name: 'React', value: 'react' },
          { name: 'Vue.js', value: 'vue' },
          { name: 'Angular', value: 'angular' },
          { name: 'Next.js', value: 'next' },
          { name: 'Nuxt.js', value: 'nuxt' },
          { name: 'Svelte', value: 'svelte' },
          { name: 'Node.js', value: 'node' },
          { name: 'Vanilla JS/TS', value: 'vanilla' },
        ],
        default: projectType,
      },
      {
        type: 'checkbox',
        name: 'features',
        message: 'Which Galaxy DevKit features would you like to enable?',
        choices: [
          { name: 'Wallet Integration', value: 'wallet', checked: true },
          { name: 'Automation Engine', value: 'automation' },
          { name: 'API Server', value: 'api' },
          { name: 'Smart Contracts', value: 'contracts' },
        ],
        default: features,
      },
      {
        type: 'list',
        name: 'network',
        message: 'Which Stellar network would you like to use?',
        choices: [
          { name: 'Testnet (recommended for development)', value: 'testnet' },
          { name: 'Mainnet (production)', value: 'mainnet' },
          { name: 'Futurenet (experimental)', value: 'futurenet' },
        ],
        default: stellarNetwork,
      },
    ]);

    projectType = answers.projectType;
    features = answers.features;
    stellarNetwork = answers.network;
  }

  // Ensure at least basic features are enabled
  if (features.length === 0) {
    features = ['wallet']; // Default to wallet feature
  }

  return {
    projectType,
    features,
    stellarNetwork: stellarNetwork as 'testnet' | 'mainnet' | 'futurenet',
  };
}

/**
 * Installs Galaxy DevKit dependencies
 * @param projectRoot - Project root directory
 * @param configOptions - Configuration options
 * @returns Promise<boolean>
 */
async function installGalaxyDependencies(projectRoot: string, configOptions: ConfigOptions): Promise<boolean> {
  try {
    const packageJsonPath = path.join(projectRoot, 'package.json');
    const packageJson = await fs.readJson(packageJsonPath);

    // Core Galaxy DevKit dependencies
    const coreDeps = [
      '@galaxy-devkit/core',
      '@galaxy-devkit/stellar-sdk',
    ];

    // Feature-specific dependencies
    const featureDeps: Record<string, string[]> = {
      wallet: ['@galaxy-devkit/invisible-wallet'],
      automation: ['@galaxy-devkit/automation'],
      api: ['@galaxy-devkit/api'],
      contracts: ['@galaxy-devkit/contracts'],
    };

    const allDeps = [...coreDeps];
    configOptions.features.forEach(feature => {
      if (featureDeps[feature]) {
        allDeps.push(...featureDeps[feature]);
      }
    });

    // Add dependencies to package.json
    packageJson.dependencies = packageJson.dependencies || {};
    for (const dep of allDeps) {
      if (!packageJson.dependencies[dep]) {
        packageJson.dependencies[dep] = '^1.0.0';
      }
    }

    await fs.writeJson(packageJsonPath, packageJson, { spaces: 2 });

    // Install dependencies
    await execa('npm', ['install'], { cwd: projectRoot, stdio: 'inherit' });

    return true;
  } catch (error) {
    console.error(chalk.red(`Failed to install Galaxy dependencies: ${(error as Error).message}`));
    return false;
  }
}

/**
 * Creates .galaxy directory for internal files
 * @param projectRoot - Project root directory
 */
async function createGalaxyDirectory(projectRoot: string): Promise<void> {
  const galaxyDir = path.join(projectRoot, '.galaxy');

  await fs.ensureDir(galaxyDir);
  await fs.ensureDir(path.join(galaxyDir, 'wallet'));
  await fs.ensureDir(path.join(galaxyDir, 'automation'));
  await fs.ensureDir(path.join(galaxyDir, 'logs'));

  // Create .gitignore for .galaxy directory if it doesn't exist
  const gitignorePath = path.join(projectRoot, '.gitignore');
  let gitignoreContent = '';

  if (await fs.pathExists(gitignorePath)) {
    gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
  }

  if (!gitignoreContent.includes('.galaxy/')) {
    gitignoreContent += '\n# Galaxy DevKit\n.galaxy/\n.env.galaxy\n';
    await fs.writeFile(gitignorePath, gitignoreContent);
  }
}

/**
 * Displays feature-specific setup instructions
 * @param configOptions - Configuration options
 */
function displayFeatureInstructions(configOptions: ConfigOptions): void {
  const { features } = configOptions;

  if (features.includes('wallet')) {
    console.log(chalk.blue('\n💰 Wallet Feature:'));
    console.log(chalk.gray('  • Run "npm run galaxy:wallet" to access wallet commands'));
    console.log(chalk.gray('  • Wallets are stored in .galaxy/wallet/'));
  }

  if (features.includes('automation')) {
    console.log(chalk.blue('\n🤖 Automation Feature:'));
    console.log(chalk.gray('  • Run "npm run galaxy:automation" to manage automations'));
    console.log(chalk.gray('  • Automation database: .galaxy/automation/'));
  }

  if (features.includes('api')) {
    console.log(chalk.blue('\n🌐 API Feature:'));
    console.log(chalk.gray('  • API server will start on port 3001 by default'));
    console.log(chalk.gray('  • Configure GALAXY_API_PORT in .env.galaxy'));
  }

  if (features.includes('contracts')) {
    console.log(chalk.blue('\n📄 Smart Contracts Feature:'));
    console.log(chalk.gray('  • Create contracts in ./contracts/ directory'));
    console.log(chalk.gray('  • Run "npm run galaxy:contracts" to manage deployments'));
  }
}

export { initCommand };

