/**
 * Example: Multi-hop swap (path payment with intermediate assets)
 * - Paths with multiple hops (e.g. XLM -> EURC -> USDC)
 * - Path depth and liquidity depth
 * - Path analytics
 */

import {
  PathPaymentManager,
  Asset,
  NetworkConfig,
  Horizon,
  Networks,
} from '@galaxy/core-stellar-sdk';

const networkConfig: NetworkConfig = {
  network: 'testnet',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  passphrase: Networks.TESTNET,
};

async function multiHopSwap() {
  const server = new Horizon.Server(networkConfig.horizonUrl);
  const pathManager = new PathPaymentManager(server, networkConfig.passphrase);

  const xlm = Asset.native();
  const usdc = new Asset(
    'USDC',
    'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
  );

  console.log('\n=== Multi-Hop Path Discovery ===\n');

  const paths = await pathManager.findPaths({
    sourceAsset: xlm,
    destAsset: usdc,
    amount: '100.0000000',
    type: 'strict_send',
    limit: 20,
  });

  const multiHop = paths.filter((p: { path?: unknown[] }) => (p.path?.length ?? 0) > 0);
  console.log('Direct paths:', paths.length - multiHop.length);
  console.log('Multi-hop paths:', multiHop.length);

  const best = await pathManager.getBestPath(paths, 'strict_send');
  if (best) {
    console.log('Best path destination amount:', best.destination_amount, 'depth:', best.pathDepth);
  }

  const analytics = pathManager.getSwapAnalytics();
  console.log('Swap history count:', analytics.history.length);
}

multiHopSwap().catch(console.error);
