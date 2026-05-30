import { Command } from 'commander';
import { blendCommand } from './blend.js';
import { swapCommand } from './swap.js';
import { poolsCommand } from './pools.js';

export const defiCommand = new Command('defi')
  .description('Interact with DeFi protocols on Stellar')
  .addHelpText(
    'after',
    `
Examples:
  $ galaxy defi blend supply USDC 100            Supply USDC to Blend
  $ galaxy defi blend borrow XLM 50              Borrow XLM from Blend
  $ galaxy defi swap XLM USDC 100                Get quote and execute swap
  $ galaxy defi pools list                       List liquidity pools with TVL/APY
  $ galaxy defi pools list --json                Output as JSON for scripting
`
  );

defiCommand.addCommand(blendCommand);
defiCommand.addCommand(swapCommand);
defiCommand.addCommand(poolsCommand);
