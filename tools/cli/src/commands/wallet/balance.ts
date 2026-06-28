import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import { Horizon, StrKey } from '@stellar/stellar-sdk';
import { walletStorage } from '../../utils/wallet-storage.js';

interface NormalizedBalance {
    asset: string;
    balance: string;
    limit?: string;
    issuer?: string;
    type: string;
}

function horizonUrl(network: string): string {
    return network === 'mainnet'
        ? 'https://horizon.stellar.org'
        : 'https://horizon-testnet.stellar.org';
}

function normalizeBalance(entry: any): NormalizedBalance {
    if (entry.asset_type === 'native') {
        return { asset: 'XLM', balance: entry.balance, type: 'native' };
    }
    if (entry.asset_type === 'liquidity_pool_shares') {
        return {
            asset: `LP:${entry.liquidity_pool_id?.slice(0, 8) ?? 'unknown'}`,
            balance: entry.balance,
            limit: entry.limit,
            type: entry.asset_type
        };
    }
    return {
        asset: entry.asset_code,
        balance: entry.balance,
        limit: entry.limit,
        issuer: entry.asset_issuer,
        type: entry.asset_type
    };
}

async function resolveAddress(addressOrName: string | undefined, opts: any): Promise<{ address: string; network: string }> {
    if (opts.name) {
        const wallet = await walletStorage.loadWallet(opts.name);
        if (!wallet) throw new Error(`Wallet '${opts.name}' not found`);
        return { address: wallet.publicKey, network: opts.network || wallet.network };
    }
    if (!addressOrName) {
        throw new Error('Provide a public key argument or use --name <wallet>');
    }
    if (!StrKey.isValidEd25519PublicKey(addressOrName)) {
        throw new Error(`Invalid Stellar public key: ${addressOrName}`);
    }
    return { address: addressOrName, network: opts.network || 'testnet' };
}

export const balanceCommand = new Command('balance')
    .description('Show XLM and asset balances for an address')
    .argument('[address]', 'Stellar public key (G...). Optional when --name is used.')
    .option('-n, --name <name>', 'Resolve address from a stored wallet name')
    .option('--network <network>', 'Network to query (testnet|mainnet). Defaults to wallet network or testnet.')
    .option('--json', 'Output as JSON')
    .action(async (address: string | undefined, options: any) => {
        const spinner = ora('Loading balances...').start();
        try {
            const { address: resolvedAddress, network } = await resolveAddress(address, options);
            const server = new Horizon.Server(horizonUrl(network));

            let account: any;
            try {
                account = await server.loadAccount(resolvedAddress);
            } catch (e: any) {
                const notFound = e?.response?.status === 404 || e?.name === 'NotFoundError';
                if (notFound) {
                    if (options.json) {
                        console.log(JSON.stringify({ address: resolvedAddress, network, exists: false, balances: [] }, null, 2));
                    } else {
                        spinner.warn(chalk.yellow(`Account ${resolvedAddress} not found on ${network}.`));
                        if (network === 'testnet') {
                            console.log(chalk.gray('Tip: fund it with `galaxy wallet fund` if it is one of your wallets.'));
                        }
                    }
                    return;
                }
                throw e;
            }

            const balances: NormalizedBalance[] = account.balances.map(normalizeBalance);

            spinner.stop();

            if (options.json) {
                console.log(JSON.stringify({ address: resolvedAddress, network, exists: true, balances }, null, 2));
                return;
            }

            console.log(chalk.blue(`\n💰 Balances for ${resolvedAddress} (${network})\n`));

            const table = new Table({
                head: [chalk.cyan('Asset'), chalk.cyan('Balance'), chalk.cyan('Limit'), chalk.cyan('Issuer')],
                colWidths: [16, 22, 22, 60]
            });

            for (const b of balances) {
                table.push([
                    b.asset,
                    b.balance,
                    b.limit ?? '—',
                    b.issuer ?? '—'
                ]);
            }

            console.log(table.toString());
        } catch (error) {
            if (options.json) {
                console.log(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }));
            } else {
                spinner.fail(chalk.red('Failed to load balances'));
                if (error instanceof Error) console.error(chalk.red(error.message));
            }
            process.exit(1);
        }
    });
