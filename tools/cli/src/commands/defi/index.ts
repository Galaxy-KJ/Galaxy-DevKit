import { Command } from 'commander';
import { blendCommand } from './blend.js';
import { swapCommand } from './swap.js';
import { poolsCommand } from './pools.js';
import {
  supplyCommand,
  withdrawCommand,
  borrowCommand,
  repayCommand,
} from './lending.js';

export const defiCommand = new Command('defi')
  .description('Interact with DeFi protocols on Stellar (Blend, Soroswap, SDEX)')
  .addHelpText(
    'after',
    `
Examples:
  $ galaxy defi supply USDC 100                  Supply USDC to Blend
  $ galaxy defi withdraw USDC 50                 Withdraw supplied USDC
  $ galaxy defi borrow XLM 50                    Borrow XLM from Blend
  $ galaxy defi repay XLM 25                     Repay borrowed XLM
  $ galaxy defi swap XLM USDC 100                Swap via Soroswap (default)
  $ galaxy defi swap XLM USDC 100 --protocol sdex  Swap via Stellar DEX
  $ galaxy defi pools list                       List liquidity pools with TVL/APY
  $ galaxy defi blend supply USDC 100            Supply via blend subcommand (alias)
`
  );

defiCommand.addCommand(supplyCommand);
defiCommand.addCommand(withdrawCommand);
defiCommand.addCommand(borrowCommand);
defiCommand.addCommand(repayCommand);
defiCommand.addCommand(swapCommand);
defiCommand.addCommand(poolsCommand);
defiCommand.addCommand(blendCommand);
