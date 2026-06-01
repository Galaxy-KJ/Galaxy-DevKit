/**
 * Galaxy CLI wallet management commands.
 */

import { Command } from 'commander';
import inquirer from 'inquirer';
import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { defaultWalletStore, WalletStore } from '../wallet-store.js';

export interface WalletCommandDeps {
  store?: WalletStore;
  /** Optional stdout writer (defaults to console.log). */
  output?: (message: string) => void;
  /** Optional stderr writer (defaults to console.error). */
  error?: (message: string) => void;
  exit?: (code: number) => never;
}

function getDeps(deps?: WalletCommandDeps) {
  return {
    store: deps?.store ?? defaultWalletStore,
    output: deps?.output ?? ((msg: string) => console.log(msg)),
    error: deps?.error ?? ((msg: string) => console.error(msg)),
    exit: deps?.exit ?? ((code: number) => process.exit(code)),
  };
}

function horizonUrl(network: 'testnet' | 'mainnet'): string {
  return network === 'mainnet'
    ? 'https://horizon.stellar.org'
    : 'https://horizon-testnet.stellar.org';
}

function networkPassphrase(network: 'testnet' | 'mainnet'): string {
  return network === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET;
}

export function parseAsset(asset: string): Asset {
  if (asset.toUpperCase() === 'XLM' || asset.toUpperCase() === 'NATIVE') {
    return Asset.native();
  }
  const parts = asset.split(':');
  if (parts.length !== 2) {
    throw new Error(
      'Asset must be XLM or CODE:ISSUER (e.g. USDC:GBBD47IF6LWK7P7MDEVSC6777KQEFHZFHH6LPAUKNUIYBNHZXLF5SWD2)'
    );
  }
  return new Asset(parts[0], parts[1]);
}

export function createWalletCommands(deps?: WalletCommandDeps): Command {
  const { store, output, error, exit } = getDeps(deps);

  const createWalletCmd = new Command('create')
    .description('Generate a new Stellar keypair and save it locally')
    .option('-n, --name <name>', 'Wallet name')
    .option('--testnet', 'Use Stellar testnet (default)')
    .option('--mainnet', 'Use Stellar mainnet')
    .option('--json', 'Output result as JSON')
    .action(async (options: {
      name?: string;
      testnet?: boolean;
      mainnet?: boolean;
      json?: boolean;
    }) => {
      try {
        const pair = Keypair.random();
        const secret = pair.secret();
        const publicKey = pair.publicKey();

        let walletName = options.name;
        if (!walletName) {
          if (options.json) {
            error(JSON.stringify({ error: 'Wallet name is required (use --name)' }));
            exit(1);
          }
          const answers = await inquirer.prompt<{ name: string }>([
            {
              type: 'input',
              name: 'name',
              message: 'Enter wallet name:',
              default: 'default',
              validate: (input: string) =>
                input.trim() !== '' ? true : 'Name is required',
            },
          ]);
          walletName = answers.name;
        }

        if (await store.walletExists(walletName)) {
          const payload = { error: `Wallet '${walletName}' already exists` };
          if (options.json) {
            output(JSON.stringify(payload));
          } else {
            error(payload.error);
          }
          exit(1);
        }

        const network = options.mainnet ? 'mainnet' : 'testnet';
        const createdAt = new Date().toISOString();

        await store.saveWallet(walletName, secret, {
          publicKey,
          network,
          createdAt,
        });

        const result = {
          success: true,
          name: walletName,
          publicKey,
          secretKey: secret,
          network,
          createdAt,
          path: store.getWalletPath(walletName),
        };

        if (options.json) {
          output(JSON.stringify(result, null, 2));
        } else {
          output(`Wallet '${walletName}' created successfully.`);
          output(`  Public key: ${publicKey}`);
          output(`  Network:    ${network}`);
          output(`  Saved to:   ${store.getWalletPath(walletName)}`);
          output('  WARNING: Back up your secret key. It is encrypted on disk.');
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (options.json) {
          output(JSON.stringify({ error: message }));
        } else {
          error(`Failed to create wallet: ${message}`);
        }
        exit(1);
      }
    });

  const importWalletCmd = new Command('import')
    .description('Import a wallet from a secret key')
    .requiredOption('--secret <key>', 'Stellar secret key (S…)')
    .option('-n, --name <name>', 'Wallet name')
    .option('--testnet', 'Use Stellar testnet (default)')
    .option('--mainnet', 'Use Stellar mainnet')
    .option('--json', 'Output result as JSON')
    .action(async (options: {
      secret: string;
      name?: string;
      testnet?: boolean;
      mainnet?: boolean;
      json?: boolean;
    }) => {
      try {
        let pair: Keypair;
        try {
          pair = Keypair.fromSecret(options.secret);
        } catch {
          const payload = { error: 'Invalid secret key format' };
          if (options.json) {
            output(JSON.stringify(payload));
          } else {
            error(payload.error);
          }
          return exit(1);
        }

        const publicKey = pair.publicKey();
        let walletName = options.name;
        if (!walletName) {
          if (options.json) {
            error(JSON.stringify({ error: 'Wallet name is required (use --name)' }));
            exit(1);
          }
          const answers = await inquirer.prompt<{ name: string }>([
            {
              type: 'input',
              name: 'name',
              message: 'Enter wallet name:',
              default: 'imported-wallet',
              validate: (input: string) =>
                input.trim() !== '' ? true : 'Name is required',
            },
          ]);
          walletName = answers.name;
        }

        if (await store.walletExists(walletName)) {
          const payload = { error: `Wallet '${walletName}' already exists` };
          if (options.json) {
            output(JSON.stringify(payload));
          } else {
            error(payload.error);
          }
          exit(1);
        }

        const network = options.mainnet ? 'mainnet' : 'testnet';
        const importedAt = new Date().toISOString();

        await store.saveWallet(walletName, options.secret, {
          publicKey,
          network,
          createdAt: importedAt,
          importedAt,
        });

        const result = {
          success: true,
          name: walletName,
          publicKey,
          network,
          importedAt,
          path: store.getWalletPath(walletName),
        };

        if (options.json) {
          output(JSON.stringify(result, null, 2));
        } else {
          output(`Wallet '${walletName}' imported successfully.`);
          output(`  Public key: ${publicKey}`);
          output(`  Network:    ${network}`);
          output(`  Saved to:   ${store.getWalletPath(walletName)}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (options.json) {
          output(JSON.stringify({ error: message }));
        } else {
          error(`Failed to import wallet: ${message}`);
        }
        exit(1);
      }
    });

  const listWalletsCmd = new Command('list')
    .description('List all managed wallets')
    .option('--json', 'Output result as JSON')
    .action(async (options: { json?: boolean }) => {
      try {
        const wallets = await store.listWallets();
        if (options.json) {
          output(JSON.stringify({ wallets }, null, 2));
          return;
        }
        if (wallets.length === 0) {
          output('No wallets found. Create one with: galaxy wallet create');
          return;
        }
        output(`Found ${wallets.length} wallet(s):\n`);
        for (const w of wallets) {
          output(`  ${w.name}`);
          output(`    Public key: ${w.publicKey}`);
          output(`    Network:    ${w.network}\n`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (options.json) {
          output(JSON.stringify({ error: message }));
        } else {
          error(`Failed to list wallets: ${message}`);
        }
        exit(1);
      }
    });

  const balanceCmd = new Command('balance')
    .description('Show XLM and asset balances for an address')
    .argument('<address>', 'Stellar public key (G…)')
    .option('--mainnet', 'Query mainnet (default: testnet)')
    .option('--json', 'Output result as JSON')
    .action(async (address: string, options: { mainnet?: boolean; json?: boolean }) => {
      try {
        if (!address.startsWith('G') || address.length !== 56) {
          throw new Error('Invalid Stellar address (expected G…, 56 characters)');
        }

        const network = options.mainnet ? 'mainnet' : 'testnet';
        const server = new Horizon.Server(horizonUrl(network));

        let account;
        try {
          account = await server.loadAccount(address);
        } catch {
          throw new Error(`Account not found on ${network}: ${address}`);
        }

        const balances = account.balances.map((b: Horizon.HorizonApi.BalanceLine) => {
          if (b.asset_type === 'native') {
            return { asset: 'XLM', balance: b.balance };
          }
          return {
            asset: `${(b as { asset_code: string }).asset_code}:${(b as { asset_issuer: string }).asset_issuer}`,
            balance: b.balance,
          };
        });

        const result = { address, network, balances };

        if (options.json) {
          output(JSON.stringify(result, null, 2));
        } else {
          output(`Balances for ${address} (${network}):\n`);
          for (const b of balances) {
            output(`  ${b.asset}: ${b.balance}`);
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        if (options.json) {
          output(JSON.stringify({ error: message }));
        } else {
          error(`Failed to fetch balance: ${message}`);
        }
        exit(1);
      }
    });

  const sendCmd = new Command('send')
    .description('Transfer assets from a managed wallet')
    .argument('<from>', 'Source wallet name or public key (G…)')
    .argument('<to>', 'Destination public key (G…)')
    .argument('<amount>', 'Amount to send')
    .argument('<asset>', 'Asset: XLM or CODE:ISSUER')
    .option('--mainnet', 'Use mainnet (default: testnet)')
    .option('--json', 'Output result as JSON')
    .action(
      async (
        from: string,
        to: string,
        amount: string,
        assetArg: string,
        options: { mainnet?: boolean; json?: boolean }
      ) => {
        try {
          if (!to.startsWith('G') || to.length !== 56) {
            throw new Error('Invalid destination address (expected G…, 56 characters)');
          }

          const amountNum = parseFloat(amount);
          if (Number.isNaN(amountNum) || amountNum <= 0) {
            throw new Error('Amount must be a positive number');
          }

          const asset = parseAsset(assetArg);

          const source = await store.resolveFromWallet(from);
          if (!source) {
            throw new Error(
              `Could not resolve source wallet '${from}'. Use a saved wallet name or a managed public key.`
            );
          }

          const network = options.mainnet ? 'mainnet' : source.network;
          const server = new Horizon.Server(horizonUrl(network));
          const sourceAccount = await server.loadAccount(source.publicKey);
          const keypair = Keypair.fromSecret(source.secretKey);

          const tx = new TransactionBuilder(sourceAccount, {
            fee: BASE_FEE,
            networkPassphrase: networkPassphrase(network),
          })
            .addOperation(
              Operation.payment({
                destination: to,
                asset,
                amount: amount,
              })
            )
            .setTimeout(180)
            .build();

          tx.sign(keypair);
          const result = await server.submitTransaction(tx);

          const payload = {
            success: true,
            hash: result.hash,
            from: source.publicKey,
            to,
            amount,
            asset: assetArg,
            network,
          };

          if (options.json) {
            output(JSON.stringify(payload, null, 2));
          } else {
            output('Payment submitted successfully.');
            output(`  Hash:   ${result.hash}`);
            output(`  From:   ${source.publicKey}`);
            output(`  To:     ${to}`);
            output(`  Amount: ${amount} ${assetArg}`);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          if (options.json) {
            output(JSON.stringify({ error: message }));
          } else {
            error(`Failed to send payment: ${message}`);
          }
          exit(1);
        }
      }
    );

  return new Command('wallet')
    .description('Manage Stellar wallets')
    .addCommand(createWalletCmd)
    .addCommand(importWalletCmd)
    .addCommand(listWalletsCmd)
    .addCommand(balanceCmd)
    .addCommand(sendCmd);
}

export const walletCommand = createWalletCommands();
