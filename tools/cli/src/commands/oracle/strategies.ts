/**
 * @fileoverview Oracle strategies command
 * @description List available aggregation strategies
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2026-01-26
 */

import { Command } from 'commander';
import { outputStrategies } from '../../utils/oracle-formatter.js';

const STRATEGIES = [
  {
    name: 'median',
    description: 'Median of source prices (default).',
  },
  {
    name: 'mean',
    description: 'Simple arithmetic average of source prices.',
  },
  {
    name: 'twap',
    description: 'Time-weighted average based on price recency.',
  },
  {
    name: 'weighted',
    description: 'Weighted average using configured source weights.',
  },
];

export const strategiesCommand = new Command('strategies')
  .description('List available aggregation strategies')
  .option('--json', 'Output machine-readable JSON')
  .action((options: any) => {
    outputStrategies(STRATEGIES, Boolean(options.json));
  });
