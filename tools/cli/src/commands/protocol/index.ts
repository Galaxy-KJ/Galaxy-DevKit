/**
 * @fileoverview Protocol command group
 * @description Main entry point for protocol interaction commands
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-01-30
 */

import { Command } from 'commander';
import { listCommand } from './list.js';
import { infoCommand } from './info.js';
import { connectCommand } from './connect.js';
import { blendCommand } from './blend.js';
import { swapCommand } from './swap.js';
import { liquidityCommand } from './liquidity.js';

export const protocolCommand = new Command('protocol')
  .description('Interact with DeFi protocols (Blend, Soroswap)')
  .addHelpText(
    'after',
    `
Examples:
  $ galaxy protocol list                           List available protocols
  $ galaxy protocol info blend                     Show Blend Protocol details
  $ galaxy protocol connect soroswap              Test Soroswap connection
  $ galaxy protocol blend supply USDC 100         Supply USDC to Blend
  $ galaxy protocol blend position                 View your lending position
  $ galaxy protocol swap quote XLM USDC 100       Get swap quote
  $ galaxy protocol swap execute XLM USDC 100     Execute swap
  $ galaxy protocol liquidity add XLM USDC 100 50 Add liquidity
  $ galaxy protocol liquidity pools               List liquidity pools
`
  );

// Register subcommands
protocolCommand.addCommand(listCommand);
protocolCommand.addCommand(infoCommand);
protocolCommand.addCommand(connectCommand);
protocolCommand.addCommand(blendCommand);
protocolCommand.addCommand(swapCommand);
protocolCommand.addCommand(liquidityCommand);
