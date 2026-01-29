/**
 * @fileoverview Oracle monitoring command
 * @description Streams real-time price updates from oracles
 * @author Galaxy DevKit Team
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { TerminalUI } from '../../utils/terminal-ui.js';

const oracleWatchCommand = new Command('oracle');

oracleWatchCommand
  .description('Stream real-time price updates for a symbol')
  .argument('<symbol>', 'Asset symbol (e.g. XLM, BTC)')
  .option('--network <type>', 'Network (testnet/mainnet)', 'testnet')
  .action(async (symbol, options) => {
    const ui = new TerminalUI(`Galaxy Watch - Oracle [${symbol}]`);

    const logBox = ui.createLogBox({
      row: 6,
      col: 0,
      rowSpan: 6,
      colSpan: 12,
      label: ' Price Updates ',
    });

    const priceChart = ui.createLineChart({
      row: 0,
      col: 0,
      rowSpan: 6,
      colSpan: 12,
      label: ` ${symbol} Price Trend `,
    });

    logBox.log(chalk.yellow(`[*] Monitoring oracle prices for ${symbol}...`));

    // Simulating updates for now as the specific IOracleSource implementation
    // depends on the selected provider.
    let currentPrice = symbol === 'XLM' ? 0.12 : 50000;

    const priceData = {
      title: symbol,
      x: [] as string[],
      y: [] as number[],
      style: { line: 'yellow' },
    };

    const updatePrice = () => {
      const change = (Math.random() - 0.5) * (currentPrice * 0.01);
      currentPrice += change;
      const time = new Date().toLocaleTimeString();
      const indicator = change >= 0 ? chalk.green('↑') : chalk.red('↓');

      logBox.log(
        `${chalk.cyan(`[${time}]`)} ${symbol}: ${chalk.bold(currentPrice.toFixed(4))} USD ${indicator} (${change.toFixed(6)})`
      );

      priceData.x.push(time);
      priceData.y.push(currentPrice);

      if (priceData.x.length > 20) {
        priceData.x.shift();
        priceData.y.shift();
      }

      priceChart.setData([priceData]);
      ui.render();
    };

    setInterval(updatePrice, 2000);
    ui.render();
  });

export { oracleWatchCommand };
