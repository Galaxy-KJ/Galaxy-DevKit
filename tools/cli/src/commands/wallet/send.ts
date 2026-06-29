import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import {
    Asset,
    BASE_FEE,
    Horizon,
    Keypair,
    Memo,
    Networks,
    Operation,
    StrKey,
    TransactionBuilder
} from '@stellar/stellar-sdk';
import { walletStorage } from '../../utils/wallet-storage.js';

function horizonUrl(network: 'testnet' | 'mainnet'): string {
    return network === 'mainnet'
        ? 'https://horizon.stellar.org'
        : 'https://horizon-testnet.stellar.org';
}

function networkPassphrase(network: 'testnet' | 'mainnet'): string {
    return network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
}

function parseAsset(input: string): Asset {
    const trimmed = input.trim();
    if (trimmed.toUpperCase() === 'XLM' || trimmed.toLowerCase() === 'native') {
        return Asset.native();
    }
    const parts = trimmed.split(':');
    if (parts.length !== 2) {
        throw new Error(`Invalid asset '${input}'. Use 'XLM' or 'CODE:ISSUER'.`);
    }
    const [code, issuer] = parts;
    if (!code || code.length < 1 || code.length > 12) {
        throw new Error(`Invalid asset code '${code}'. Must be 1-12 characters.`);
    }
    if (!StrKey.isValidEd25519PublicKey(issuer)) {
        throw new Error(`Invalid issuer public key '${issuer}'.`);
    }
    return new Asset(code, issuer);
}

function buildMemo(input: string | undefined): Memo | undefined {
    if (!input) return undefined;
    if (Buffer.byteLength(input, 'utf8') > 28) {
        throw new Error('Memo text must be 28 bytes or fewer (UTF-8).');
    }
    return Memo.text(input);
}

export const sendCommand = new Command('send')
    .description('Transfer XLM or an issued asset from a stored wallet to another address')
    .argument('<from>', 'Source wallet name (must be stored locally)')
    .argument('<to>', 'Destination Stellar public key (G...)')
    .argument('<amount>', 'Amount to send (as a decimal string, e.g. "1.5")')
    .argument('<asset>', "Asset to send: 'XLM' or 'CODE:ISSUER'")
    .option('--memo <text>', 'Optional memo text (max 28 bytes UTF-8)')
    .option('--password <password>', 'Password to decrypt the source wallet (if encrypted)')
    .option('--network <network>', 'Override the network (testnet|mainnet); defaults to wallet network')
    .option('--json', 'Output as JSON')
    .action(async (from: string, to: string, amount: string, assetInput: string, options: any) => {
        const spinner = ora('Preparing transaction...').start();

        try {
            if (!StrKey.isValidEd25519PublicKey(to)) {
                throw new Error(`Invalid destination address '${to}'.`);
            }
            if (!/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0) {
                throw new Error(`Invalid amount '${amount}'. Use a positive decimal string.`);
            }
            const asset = parseAsset(assetInput);
            const memo = buildMemo(options.memo);

            // 1. Resolve source wallet (handle encrypted via password).
            if (!await walletStorage.walletExists(from)) {
                throw new Error(`Source wallet '${from}' not found`);
            }

            let password: string | undefined = options.password;
            if (await walletStorage.isWalletEncrypted(from) && !password) {
                if (options.json) {
                    throw new Error('--password is required for encrypted wallets in --json mode');
                }
                spinner.stop();
                const answers = await inquirer.prompt([
                    {
                        type: 'password',
                        name: 'password',
                        message: `Enter password for '${from}':`,
                        mask: '*'
                    }
                ]);
                password = answers.password;
                spinner.start('Preparing transaction...');
            }

            const wallet = await walletStorage.loadWalletDecrypted(from, password);
            if (!wallet) {
                throw new Error(`Source wallet '${from}' could not be loaded`);
            }

            const network = (options.network || wallet.network || 'testnet') as 'testnet' | 'mainnet';
            const server = new Horizon.Server(horizonUrl(network));

            // 2. Load source account from Horizon.
            spinner.text = 'Loading source account...';
            const source = await server.loadAccount(wallet.publicKey);

            // 3. Trustline check for non-native assets (skip if destination is the issuer itself).
            if (!asset.isNative() && asset.getIssuer() !== to) {
                spinner.text = 'Verifying destination trustline...';
                try {
                    const dest = await server.loadAccount(to);
                    const hasTrustline = dest.balances.some((b: any) =>
                        b.asset_type !== 'native' &&
                        b.asset_code === asset.getCode() &&
                        b.asset_issuer === asset.getIssuer()
                    );
                    if (!hasTrustline) {
                        throw new Error(
                            `Destination ${to} does not have a trustline for ${asset.getCode()}:${asset.getIssuer()}`
                        );
                    }
                } catch (e: any) {
                    const notFound = e?.response?.status === 404 || e?.name === 'NotFoundError';
                    if (notFound) {
                        throw new Error(`Destination ${to} does not exist on ${network}. Fund it first.`);
                    }
                    throw e;
                }
            }

            // 4. Build transaction.
            spinner.text = 'Building transaction...';
            const builder = new TransactionBuilder(source, {
                fee: BASE_FEE,
                networkPassphrase: networkPassphrase(network)
            }).addOperation(Operation.payment({
                destination: to,
                asset,
                amount
            }));

            if (memo) builder.addMemo(memo);

            const tx = builder.setTimeout(180).build();
            tx.sign(Keypair.fromSecret(wallet.secretKey));

            // 5. Submit.
            spinner.text = 'Submitting to Horizon...';
            const result = await server.submitTransaction(tx);

            spinner.succeed(chalk.green('Payment submitted!'));

            if (options.json) {
                console.log(JSON.stringify({
                    success: true,
                    from: wallet.publicKey,
                    fromWallet: from,
                    to,
                    amount,
                    asset: asset.isNative() ? 'XLM' : `${asset.getCode()}:${asset.getIssuer()}`,
                    memo: options.memo || null,
                    network,
                    hash: (result as any).hash,
                    ledger: (result as any).ledger
                }, null, 2));
            } else {
                console.log(chalk.blue('\n📋 Transaction Details:'));
                console.log(chalk.gray('  From:    ') + `${from} (${wallet.publicKey})`);
                console.log(chalk.gray('  To:      ') + to);
                console.log(chalk.gray('  Amount:  ') + chalk.cyan(`${amount} ${asset.isNative() ? 'XLM' : asset.getCode()}`));
                if (!asset.isNative()) {
                    console.log(chalk.gray('  Issuer:  ') + asset.getIssuer());
                }
                if (options.memo) console.log(chalk.gray('  Memo:    ') + options.memo);
                console.log(chalk.gray('  Network: ') + network);
                console.log(chalk.gray('  Hash:    ') + (result as any).hash);
                console.log();
            }
        } catch (error: any) {
            // Surface Horizon validation errors (e.g. op_underfunded, op_no_trust) when present.
            const horizonErr = error?.response?.data?.extras?.result_codes;
            const detail = horizonErr
                ? `${error.message} — ${JSON.stringify(horizonErr)}`
                : (error instanceof Error ? error.message : 'Unknown error');

            if (options.json) {
                console.log(JSON.stringify({ error: detail }));
            } else {
                spinner.fail(chalk.red('Failed to send payment'));
                console.error(chalk.red(detail));
            }
            process.exit(1);
        }
    });
