import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import {
    Horizon,
    Keypair,
    Networks,
    TransactionBuilder
} from '@stellar/stellar-sdk';

// Import local wallet implementation
// Assuming relative path from tools/cli/src/commands/wallet/multisig.ts
// to packages/core/wallet/src/multisig/MultiSigWallet.ts
import { MultiSigWallet } from '../../../../../packages/core/wallet/src/multisig/MultiSigWallet.js';
import { MultiSigConfig, MultiSigSigner } from '../../../../../packages/core/wallet/src/multisig/types.js';

const PROPOSALS_FILE = 'multisig-proposals.json';

async function getProposalsPath(): Promise<string> {
    const homeDir = os.homedir();
    const dir = path.join(homeDir, '.galaxy');
    await fs.ensureDir(dir);
    return path.join(dir, PROPOSALS_FILE);
}

export const multisigCommand = new Command('multisig')
    .description('Multi-signature wallet setup and management');

multisigCommand.command('create')
    .description('Create multi-signature wallet')
    .requiredOption('--threshold <n>', 'Signature threshold (number)', parseInt)
    .requiredOption('--signers <addresses>', 'Comma-separated signer addresses')
    .option('--network <network>', 'Network (testnet/mainnet)', 'testnet')
    .action(async (options: any) => {
        const spinner = ora('Setting up multisig wallet...').start();

        try {
            // 1. Select wallet to upgrade
            spinner.stop();
            const accounts = await getAvailableWallets();
            if (accounts.length === 0) {
                console.error(chalk.red('No wallets found. Create one first.'));
                return;
            }

            const { walletName } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'walletName',
                    message: 'Select wallet to upgrade to multisig:',
                    choices: accounts.map((a: any) => a.name)
                }
            ]);

            const wallet = accounts.find((a: any) => a.name === walletName);
            if (!wallet) throw new Error('Wallet not found');

            spinner.start('Configuring multisig...');

            // 2. Parse signers
            const signerAddresses = options.signers.split(',').map((s: string) => s.trim());
            const signers: MultiSigSigner[] = signerAddresses.map((addr: string) => ({
                publicKey: addr,
                weight: 1
            }));

            // Add self as signer with weight 1 (master key)
            // Note: Usually removing master key creates true multisig, but for this demo we keep it 
            // or we can set master weight to 1.
            // The MultiSigWallet logic handles this config.
            signers.push({
                publicKey: wallet.publicKey,
                weight: 1
            });

            // 3. Configure thresholds
            const threshold = options.threshold;
            // Validating threshold
            if (typeof threshold !== 'number' || isNaN(threshold)) {
                throw new Error('Threshold must be a number');
            }

            const config: MultiSigConfig = {
                signers,
                threshold: {
                    masterWeight: 1,
                    low: threshold,
                    medium: threshold,
                    high: threshold
                },
                proposalExpirationSeconds: 86400,
                networkPassphrase: options.network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET
            };

            // 4. Initialize MultiSigWallet
            const serverUrl = options.network === 'mainnet' ? 'https://horizon.stellar.org' : 'https://horizon-testnet.stellar.org';
            const server = new Horizon.Server(serverUrl);
            const msWallet = new MultiSigWallet(server, config);

            // 5. Submit transaction
            // WARNING: This assumes wallet.secretKey exists and is valid. 
            // In production, we'd prompt for it securely or use Keytar.
            const txHash = await msWallet.setupOnChain(wallet.secretKey);

            spinner.succeed(chalk.green('Multisig wallet configured successfully!'));
            console.log(chalk.blue('\n📝 Configuration Details:'));
            console.log(chalk.gray(`  Transaction Hash: ${txHash}`));
            console.log(chalk.gray(`  Threshold: ${threshold}`));
            console.log(chalk.gray(`  Signers: ${signers.length}`));
            signers.forEach((s: MultiSigSigner) => console.log(chalk.gray(`    - ${s.publicKey} (w: ${s.weight})`)));

        } catch (error) {
            spinner.fail(chalk.red('Failed to setup multisig wallet'));
            if (error instanceof Error) {
                console.error(chalk.red(error.message));
            }
        }
    });

multisigCommand.command('propose')
    .description('Propose a transaction (creates a proposal ID)')
    .argument('<xdr>', 'Transaction XDR')
    .option('--description <text>', 'Description of proposal')
    .action(async (xdr: string, options: any) => {
        const spinner = ora('Creating proposal...').start();
        try {
            const id = Math.random().toString(36).substring(7);
            const proposal = {
                id,
                transactionXdr: xdr,
                description: options.description || 'No description',
                createdAt: new Date(),
                signatures: [] as any[]
            };

            const proposalsPath = await getProposalsPath();
            let proposals: any = {};
            if (await fs.pathExists(proposalsPath)) {
                proposals = await fs.readJson(proposalsPath);
            }
            proposals[id] = proposal;
            await fs.writeJson(proposalsPath, proposals, { spaces: 2 });

            spinner.succeed(chalk.green(`Proposal created! ID: ${id}`));
            console.log(chalk.blue(`Use 'galaxy wallet multisig sign ${id}' to sign this proposal.`));
        } catch (e) {
            spinner.fail('Failed to create proposal');
            if (e instanceof Error) console.error(chalk.red(e.message));
        }
    });

multisigCommand.command('sign')
    .description('Sign proposed transaction')
    .argument('<transaction-id>', 'Transaction/Proposal ID to sign')
    .option('--network <network>', 'Network (testnet/mainnet)', 'testnet')
    .action(async (transactionId: string, options: any) => {
        const spinner = ora('Signing transaction...').start();

        try {
            // 1. Load proposal from local storage
            const proposalsPath = await getProposalsPath();
            if (!await fs.pathExists(proposalsPath)) {
                spinner.fail('No proposals found');
                return;
            }

            const proposals = await fs.readJson(proposalsPath);
            const proposal = proposals[transactionId];
            if (!proposal) {
                spinner.fail(`Proposal ${transactionId} not found`);
                return;
            }

            // 2. Select wallet to sign with
            spinner.stop();
            const accounts = await getAvailableWallets();
            if (accounts.length === 0) {
                console.error(chalk.red('No wallets available to sign with.'));
                return;
            }

            const { walletName } = await inquirer.prompt([
                {
                    type: 'list',
                    name: 'walletName',
                    message: 'Select wallet to sign with:',
                    choices: accounts.map((a: any) => a.name)
                }
            ]);

            const wallet = accounts.find((a: any) => a.name === walletName);
            if (!wallet) throw new Error('Wallet not found');

            spinner.start('Signing...');

            // 3. Sign
            const kp = Keypair.fromSecret(wallet.secretKey);
            const networkPassphrase = options.network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
            const tx = TransactionBuilder.fromXDR(proposal.transactionXdr, networkPassphrase);

            tx.sign(kp);

            const signedXdr = tx.toXDR();
            const signature = tx.signatures[tx.signatures.length - 1].signature().toString('base64');

            // Update proposal
            proposal.transactionXdr = signedXdr;
            // Add signature record
            if (!proposal.signatures) proposal.signatures = [];
            proposal.signatures.push({
                signerPublicKey: wallet.publicKey,
                signature: signature,
                signedAt: new Date()
            });

            proposals[transactionId] = proposal;
            await fs.writeJson(proposalsPath, proposals, { spaces: 2 });

            spinner.succeed(chalk.green('Transaction signed!'));
            console.log(chalk.gray(`Signed XDR: ${signedXdr}`));
            console.log(chalk.blue(`Signatures collected: ${proposal.signatures.length}`));

        } catch (error) {
            spinner.fail(chalk.red('Failed to sign transaction'));
            if (error instanceof Error) {
                console.error(chalk.red(error.message));
            }
        }
    });

async function getAvailableWallets() {
    const homeDir = os.homedir();
    const walletsDir = path.join(homeDir, '.galaxy', 'wallets');
    if (!await fs.pathExists(walletsDir)) return [];

    const files = await fs.readdir(walletsDir);
    const wallets = [];
    for (const file of files) {
        if (file.endsWith('.json')) {
            try {
                const content = await fs.readJson(path.join(walletsDir, file));
                wallets.push({ ...content, name: path.basename(file, '.json') });
            } catch (e) { }
        }
    }
    return wallets;
}
