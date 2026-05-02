/**
 * @fileoverview Smart Router usage example
 * @description Example of using the SmartRouter for optimal path finding
 */

import { SmartRouter, SmartRoute } from '../src/services/smart-router.js';
import {
  ProtocolConfig,
  NetworkConfig,
  Asset,
} from '../src/types/defi-types.js';

const networkConfig: NetworkConfig = {
  network: 'testnet',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
  passphrase: 'Test SDF Network ; September 2015',
};

const config: ProtocolConfig = {
  protocolId: 'smart-router',
  name: 'Smart Router',
  network: networkConfig,
  contractAddresses: {},
  metadata: {},
};

async function main() {
  const router = new SmartRouter(config, {
    maxHops: 3,
    enabledVenues: ['soroswap', 'sdex'],
    gasCosts: { soroswap: '1000', sdex: '500' },
  });

  await router.initialize();

  const tokenIn: Asset = { code: 'XLM', type: 'native' };
  const tokenOut: Asset = {
    code: 'USDC',
    issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    type: 'credit_alphanum12',
  };

  const optimalRoute = await router.findOptimalRoute(
    tokenIn,
    tokenOut,
    '10000000'
  );

  console.log('Optimal Route:');
  console.log(`  Path: ${optimalRoute.path.join(' -> ')}`);
  console.log(`  Venues: ${optimalRoute.venues.join(', ')}`);
  console.log(`  Amount In: ${optimalRoute.amountIn}`);
  console.log(`  Amount Out: ${optimalRoute.amountOut}`);
  console.log(`  Net Amount Out (after gas): ${optimalRoute.netAmountOut}`);
  console.log(`  Gas Cost: ${optimalRoute.gasCost}`);
  console.log(`  Hops: ${optimalRoute.hops}`);

  const allRoutes = await router.findAllRoutes(tokenIn, tokenOut, '10000000');
  console.log(`\nFound ${allRoutes.length} possible routes`);
}

main().catch(console.error);
