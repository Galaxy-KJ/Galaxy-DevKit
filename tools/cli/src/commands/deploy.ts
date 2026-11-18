/** @fileoverview Build and deploy Soroban contracts with confirmed network results. */
import { Command, Option } from 'commander';
import { deployContract } from '../utils/contract-deployment.js';

/** Create a fresh command tree for the CLI and command-level tests. */
export function createDeployCommand(): Command {
  const command = new Command('deploy')
    .description('Deploy Soroban contracts (application hosting is out of scope)');
  command.command('contract <name>')
    .description('Build contracts/<name>/Cargo.toml and deploy to Stellar')
    .addOption(new Option('-n, --network <network>', 'Stellar network')
      .choices(['testnet', 'futurenet', 'mainnet']).default('testnet'))
    .option('--json', 'Print the confirmed deployment as JSON')
    .addHelpText('after', '\nRequires stellar CLI, Rust, and a funded STELLAR_SECRET_KEY environment variable.\nExample: galaxy deploy contract hello --network testnet')
    .action(async (name, options) => {
      try {
        const result = await deployContract(name, options);
        if (options.json) {
          console.log(JSON.stringify(result));
        } else {
          console.log(`Contract deployed: ${result.address}`);
          console.log(`Transaction: ${result.transactionHash}`);
          console.log(`Network: ${result.network}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(options.json ? JSON.stringify({ error: message }) : `Deployment failed: ${message}`);
        process.exitCode = 1;
      }
    });
  return command;
}

export const deployCommand = createDeployCommand();
