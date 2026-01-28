/**
 * @fileoverview Guided workflows for Galaxy CLI interactive mode
 * @description Multi-step guided flows for complex operations
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-01-28
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import type { Workflow, WorkflowStep } from '../../types/interactive-types.js';
import { getSessionManager } from './session.js';

/**
 * Execute a workflow step
 */
async function executeStep(
  step: WorkflowStep,
  answers: Record<string, any>
): Promise<any> {
  // Check condition
  if (step.when && !step.when(answers)) {
    return undefined;
  }

  const questionBase = {
    name: step.id,
    message: step.title,
  };

  // Using 'any' to accommodate different question types (input, password, list, checkbox, confirm)
  // Each type has different required properties that don't fit the base Question interface
  let question: any;

  switch (step.type) {
    case 'input':
      question = {
        ...questionBase,
        type: 'input',
        default: step.default as string,
        validate: step.validate,
      };
      break;

    case 'password':
      question = {
        ...questionBase,
        type: 'password',
        mask: '*',
        validate: step.validate,
      };
      break;

    case 'select':
      question = {
        ...questionBase,
        type: 'list',
        choices: step.choices?.map((c) => ({
          name: c.description ? `${c.name} - ${c.description}` : c.name,
          value: c.value,
        })),
        default: step.choices?.find((c) => c.default)?.value || step.default,
      };
      break;

    case 'multiselect':
      question = {
        ...questionBase,
        type: 'checkbox',
        choices: step.choices?.map((c) => ({
          name: c.description ? `${c.name} - ${c.description}` : c.name,
          value: c.value,
          checked: c.default,
        })),
      };
      break;

    case 'confirm':
      question = {
        ...questionBase,
        type: 'confirm',
        default: step.default as boolean ?? true,
      };
      break;

    default:
      throw new Error(`Unknown step type: ${step.type}`);
  }

  const result = await inquirer.prompt([question]);
  return result[step.id];
}

/**
 * Run a complete workflow
 */
export async function runWorkflow(workflow: Workflow): Promise<void> {
  console.log(chalk.blue(`\n${workflow.name}`));
  console.log(chalk.gray(workflow.description));
  console.log('');

  const answers: Record<string, any> = {};

  for (const step of workflow.steps) {
    try {
      const answer = await executeStep(step, answers);
      if (answer !== undefined) {
        answers[step.id] = answer;
      }
    } catch (error) {
      if ((error as Error).message.includes('User force closed')) {
        console.log(chalk.yellow('\nWorkflow cancelled.'));
        return;
      }
      throw error;
    }
  }

  // Execute the workflow action
  const spinner = ora('Executing workflow...').start();
  try {
    await workflow.execute(answers);
    spinner.succeed(chalk.green('Workflow completed successfully!'));
  } catch (error) {
    spinner.fail(chalk.red('Workflow failed'));
    console.error(chalk.red((error as Error).message));
  }
}

/**
 * Create Project workflow
 */
export const createProjectWorkflow: Workflow = {
  id: 'create-project',
  name: 'Create New Project',
  description: 'Set up a new Galaxy DevKit project with your preferred configuration',
  steps: [
    {
      id: 'projectName',
      title: 'What is your project name?',
      type: 'input',
      validate: (input: string) => {
        if (!input.trim()) return 'Project name is required';
        if (!/^[a-zA-Z0-9-_]+$/.test(input)) {
          return 'Project name can only contain letters, numbers, hyphens, and underscores';
        }
        return true;
      },
    },
    {
      id: 'template',
      title: 'Which template would you like to use?',
      type: 'select',
      choices: [
        { name: 'Basic', value: 'basic', description: 'Simple starter template', default: true },
        { name: 'DeFi', value: 'defi', description: 'DeFi application with trading features' },
        { name: 'NFT', value: 'nft', description: 'NFT marketplace template' },
        { name: 'Enterprise', value: 'enterprise', description: 'Full-featured enterprise setup' },
      ],
    },
    {
      id: 'network',
      title: 'Which network will you primarily use?',
      type: 'select',
      choices: [
        { name: 'Testnet', value: 'testnet', description: 'For development and testing', default: true },
        { name: 'Mainnet', value: 'mainnet', description: 'Production network' },
        { name: 'Futurenet', value: 'futurenet', description: 'Experimental features' },
      ],
    },
    {
      id: 'features',
      title: 'Which features do you want to enable?',
      type: 'multiselect',
      choices: [
        { name: 'Wallet Integration', value: 'wallet', default: true },
        { name: 'Oracle Support', value: 'oracle' },
        { name: 'Smart Contracts', value: 'contracts' },
        { name: 'REST API', value: 'api' },
        { name: 'Database (Supabase)', value: 'database' },
      ],
    },
    {
      id: 'installDeps',
      title: 'Install dependencies now?',
      type: 'confirm',
      default: true,
    },
  ],
  execute: async (answers) => {
    const { projectName, template, network, features, installDeps } = answers;

    console.log(chalk.blue('\nProject Configuration:'));
    console.log(chalk.gray(`  Name: ${projectName}`));
    console.log(chalk.gray(`  Template: ${template}`));
    console.log(chalk.gray(`  Network: ${network}`));
    console.log(chalk.gray(`  Features: ${features.join(', ') || 'none'}`));
    console.log(chalk.gray(`  Install: ${installDeps ? 'yes' : 'no'}`));

    // Update session with selected network
    const session = getSessionManager();
    await session.setNetwork(network);

    console.log(chalk.green(`\nProject "${projectName}" configured!`));
    console.log(chalk.gray(`Run: galaxy create ${projectName} --template ${template}${installDeps ? '' : ' --skip-install'}`));
  },
};

/**
 * Setup Wallet workflow
 */
export const setupWalletWorkflow: Workflow = {
  id: 'setup-wallet',
  name: 'Setup Wallet',
  description: 'Create or import a wallet for your project',
  steps: [
    {
      id: 'action',
      title: 'What would you like to do?',
      type: 'select',
      choices: [
        { name: 'Create New Wallet', value: 'create', description: 'Generate a new wallet', default: true },
        { name: 'Import Existing', value: 'import', description: 'Import from secret key or mnemonic' },
        { name: 'Connect Ledger', value: 'ledger', description: 'Use hardware wallet' },
      ],
    },
    {
      id: 'walletName',
      title: 'Enter a name for this wallet:',
      type: 'input',
      validate: (input: string) => {
        if (!input.trim()) return 'Wallet name is required';
        return true;
      },
    },
    {
      id: 'network',
      title: 'Which network?',
      type: 'select',
      choices: [
        { name: 'Testnet', value: 'testnet', default: true },
        { name: 'Mainnet', value: 'mainnet' },
      ],
    },
    {
      id: 'secretKey',
      title: 'Enter your secret key or mnemonic:',
      type: 'password',
      when: (answers) => answers.action === 'import',
      validate: (input: string) => {
        if (!input.trim()) return 'Secret key is required';
        return true;
      },
    },
    {
      id: 'enableBackup',
      title: 'Create a backup of this wallet?',
      type: 'confirm',
      default: true,
      when: (answers) => answers.action !== 'ledger',
    },
    {
      id: 'backupFormat',
      title: 'Choose backup format:',
      type: 'select',
      when: (answers) => answers.enableBackup === true,
      choices: [
        { name: 'Encrypted JSON', value: 'json', description: 'Secure encrypted file', default: true },
        { name: 'QR Code', value: 'qr', description: 'Scannable QR code image' },
        { name: 'Paper Wallet', value: 'paper', description: 'Printable format' },
        { name: 'Shamir Secret Sharing', value: 'shamir', description: 'Split across multiple parties' },
      ],
    },
    {
      id: 'setAsActive',
      title: 'Set as active wallet for this session?',
      type: 'confirm',
      default: true,
    },
  ],
  execute: async (answers) => {
    const { action, walletName, network, enableBackup, backupFormat, setAsActive } = answers;

    console.log(chalk.blue('\nWallet Configuration:'));
    console.log(chalk.gray(`  Action: ${action}`));
    console.log(chalk.gray(`  Name: ${walletName}`));
    console.log(chalk.gray(`  Network: ${network}`));
    if (enableBackup) {
      console.log(chalk.gray(`  Backup: ${backupFormat}`));
    }

    // Simulate wallet creation
    const publicKey = 'G' + 'A'.repeat(55); // Placeholder

    if (setAsActive) {
      const session = getSessionManager();
      await session.setActiveWallet(publicKey, walletName);
      await session.setNetwork(network);
    }

    console.log(chalk.green(`\nWallet "${walletName}" ready!`));
    console.log(chalk.gray(`Public Key: ${publicKey.slice(0, 8)}...${publicKey.slice(-8)}`));

    if (action === 'create') {
      console.log(chalk.gray(`Run: galaxy wallet create --name ${walletName} --network ${network}`));
    } else if (action === 'import') {
      console.log(chalk.gray(`Run: galaxy wallet import --name ${walletName}`));
    } else {
      console.log(chalk.gray(`Run: galaxy wallet ledger connect`));
    }
  },
};

/**
 * Deploy Contract workflow
 */
export const deployContractWorkflow: Workflow = {
  id: 'deploy-contract',
  name: 'Deploy Smart Contract',
  description: 'Deploy a Soroban smart contract to the network',
  steps: [
    {
      id: 'contractPath',
      title: 'Enter the path to your contract WASM file:',
      type: 'input',
      default: './target/wasm32-unknown-unknown/release/contract.wasm',
      validate: (input: string) => {
        if (!input.trim()) return 'Contract path is required';
        if (!input.endsWith('.wasm')) return 'File must be a .wasm file';
        return true;
      },
    },
    {
      id: 'network',
      title: 'Which network to deploy to?',
      type: 'select',
      choices: [
        { name: 'Testnet', value: 'testnet', description: 'Safe for testing', default: true },
        { name: 'Futurenet', value: 'futurenet', description: 'Latest Soroban features' },
        { name: 'Mainnet', value: 'mainnet', description: 'Production (use with caution)' },
      ],
    },
    {
      id: 'confirmMainnet',
      title: 'Are you sure you want to deploy to MAINNET? This action cannot be undone.',
      type: 'confirm',
      default: false,
      when: (answers) => answers.network === 'mainnet',
    },
    {
      id: 'initArgs',
      title: 'Does your contract require initialization arguments?',
      type: 'confirm',
      default: false,
    },
    {
      id: 'initArgsJson',
      title: 'Enter initialization arguments (JSON format):',
      type: 'input',
      when: (answers) => answers.initArgs === true,
      validate: (input: string) => {
        try {
          JSON.parse(input);
          return true;
        } catch {
          return 'Invalid JSON format';
        }
      },
    },
    {
      id: 'estimateGas',
      title: 'Estimate gas costs before deploying?',
      type: 'confirm',
      default: true,
    },
  ],
  execute: async (answers) => {
    const { contractPath, network, confirmMainnet, initArgs, initArgsJson, estimateGas } = answers;

    // Abort if mainnet not confirmed
    if (network === 'mainnet' && !confirmMainnet) {
      console.log(chalk.yellow('\nDeployment to mainnet cancelled.'));
      return;
    }

    console.log(chalk.blue('\nDeployment Configuration:'));
    console.log(chalk.gray(`  Contract: ${contractPath}`));
    console.log(chalk.gray(`  Network: ${network}`));
    if (initArgs && initArgsJson) {
      console.log(chalk.gray(`  Init Args: ${initArgsJson}`));
    }

    if (estimateGas) {
      console.log(chalk.gray('\nEstimating gas costs...'));
      // Simulated gas estimate
      console.log(chalk.gray(`  Estimated: ~1000 stroops`));
    }

    console.log(chalk.green(`\nContract deployment configured!`));
    console.log(chalk.gray(`Run: galaxy deploy --env ${network}`));
  },
};

/**
 * Available workflows registry
 */
export const WORKFLOWS: Record<string, Workflow> = {
  'create-project': createProjectWorkflow,
  'setup-wallet': setupWalletWorkflow,
  'deploy-contract': deployContractWorkflow,
};

/**
 * Get a workflow by ID
 */
export function getWorkflow(id: string): Workflow | undefined {
  return WORKFLOWS[id];
}

/**
 * List all available workflows
 */
export function listWorkflows(): { id: string; name: string; description: string }[] {
  return Object.values(WORKFLOWS).map((w) => ({
    id: w.id,
    name: w.name,
    description: w.description,
  }));
}

/**
 * WorkflowManager class for workflow execution
 */
export class WorkflowManager {
  private workflows: Map<string, Workflow> = new Map();

  constructor() {
    // Register default workflows
    Object.entries(WORKFLOWS).forEach(([id, workflow]) => {
      this.workflows.set(id, workflow);
    });
  }

  /**
   * Register a custom workflow
   */
  register(workflow: Workflow): void {
    this.workflows.set(workflow.id, workflow);
  }

  /**
   * Unregister a workflow
   */
  unregister(id: string): boolean {
    return this.workflows.delete(id);
  }

  /**
   * Get a workflow by ID
   */
  get(id: string): Workflow | undefined {
    return this.workflows.get(id);
  }

  /**
   * List all workflows
   */
  list(): Workflow[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Run a workflow by ID
   */
  async run(id: string): Promise<void> {
    const workflow = this.workflows.get(id);
    if (!workflow) {
      throw new Error(`Workflow not found: ${id}`);
    }
    await runWorkflow(workflow);
  }
}

/** Singleton workflow manager instance */
let workflowManagerInstance: WorkflowManager | null = null;

/**
 * Get the singleton workflow manager instance
 */
export function getWorkflowManager(): WorkflowManager {
  if (!workflowManagerInstance) {
    workflowManagerInstance = new WorkflowManager();
  }
  return workflowManagerInstance;
}

/**
 * Reset the singleton workflow manager (useful for testing)
 */
export function resetWorkflowManager(): void {
  workflowManagerInstance = null;
}
