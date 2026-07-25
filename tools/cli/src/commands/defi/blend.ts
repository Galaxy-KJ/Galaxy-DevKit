import { Command } from 'commander';
import { createLendingCommand } from './lending.js';

export const blendCommand = new Command('blend')
  .description('Blend Protocol lending operations (supply, borrow aliases)');

blendCommand.addCommand(createLendingCommand('supply'));
blendCommand.addCommand(createLendingCommand('borrow'));
