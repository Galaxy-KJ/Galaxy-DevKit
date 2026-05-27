import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import Table from 'cli-table3';
import {
  getProtocolInstance,
  listSupportedProtocols,
  selectWallet,
} from '../../utils/protocol-registry.js';
import { outputError } from '../../utils/protocol-formatter.js';
import { PROTOCOL_IDS } from '@galaxy-kj/core-defi-protocols';

interface PoolsOptions {
  network: string;
  json?: boolean;
  wallet?: string;
}

export const poolsCommand = new Command('pools')
  .description('List available liquidity pools with TVL and APY');

const listCmd = new Command('list')
  .description('List all available liquidity pools')
  .option('--network <network>', 'Network (testnet/mainnet)', 'testnet')
  .option('--json', 'Output as JSON')
  .option('-w, --wallet <name>', 'Wallet name (for network context)')
  .action(async (options: PoolsOptions) => {
    const spinner = options.json ? null : ora('Loading liquidity pools...').start();

    try {
      if (!['testnet', 'mainnet'].includes(options.network)) {
        throw new Error('Network must be either "testnet" or "mainnet"');
      }
      const network = options.network as 'testnet' | 'mainnet';

      const protocol = await getProtocolInstance(PROTOCOL_IDS.SOROSWAP, network);
      await protocol.initialize();

      const pools = await protocol.getAllPoolsAnalytics();

      spinner?.stop();

      if (options.json) {
        console.log(
          JSON.stringify(
            {
              network,
              pools: pools.map((p: any) => ({
                pair: `${p.tokenA?.code || '??'}/${p.tokenB?.code || '??'}`,
                reserveA: p.reserveA?.toString() || '0',
                reserveB: p.reserveB?.toString() || '0',
                tvl: p.tvl || p.totalLiquidity || '0',
                apy: p.apy || '0',
                fee: p.fee ?? '0.003',
                address: p.address || '',
              })),
              total: pools.length,
            },
            null,
            2
          )
        );
        return;
      }

      if (pools.length === 0) {
        console.log(chalk.yellow('No liquidity pools found.'));
        return;
      }

      console.log(chalk.blue('\n🌊 Liquidity Pools'));
      console.log(chalk.gray(`   Network: ${network}\n`));

      const table = new Table({
        head: [
          chalk.cyan('Pair'),
          chalk.cyan('Reserve A'),
          chalk.cyan('Reserve B'),
          chalk.cyan('TVL'),
          chalk.cyan('APY'),
          chalk.cyan('Fee'),
        ],
        colWidths: [16, 16, 16, 16, 10, 8],
      });

      for (const p of pools as any[]) {
        const tvl = parseFloat(p.tvl || p.totalLiquidity || '0');
        const apy = parseFloat(p.apy || '0');

        table.push([
          `${p.tokenA?.code || '??'}/${p.tokenB?.code || '??'}`,
          formatAmount(p.reserveA),
          formatAmount(p.reserveB),
          `$${formatAmount(tvl)}`,
          apy > 0 ? `${apy.toFixed(2)}%` : 'N/A',
          p.fee != null ? `${(parseFloat(p.fee) * 100).toFixed(1)}%` : '0.3%',
        ]);
      }

      console.log(table.toString());
      console.log(chalk.gray(`\nTotal: ${pools.length} pool(s)`));
    } catch (error) {
      spinner?.fail('Failed to load pools');
      outputError(error, { json: options.json });
      process.exit(1);
    }
  });

function formatAmount(value: unknown): string {
  if (value == null) return '0';
  const num = typeof value === 'string' ? parseFloat(value) : (value as number);
  if (isNaN(num)) return String(value);
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

poolsCommand.addCommand(listCmd);
