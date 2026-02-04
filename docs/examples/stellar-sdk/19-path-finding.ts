/**
 * Example: Path finding (strict send and strict receive)
 *
 * This example demonstrates:
 * - Strict send path finding (fixed source amount)
 * - Strict receive path finding (fixed destination amount)
 * - Path ranking by price
 * - Multi-hop path discovery
 */

import {
  PathPaymentManager,
  Asset,
  NetworkConfig,
  Horizon,
  Networks,
} from '../../../packages/core/stellar-sdk';

const networkConfig: NetworkConfig = {
  network: 'testnet',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  passphrase: Networks.TESTNET,
};

async function pathFinding() {
  const server = new Horizon.Server(networkConfig.horizonUrl);
  const pathManager = new PathPaymentManager(server, networkConfig.passphrase, {
    pathCacheTtlMs: 60_000,
  });

  const xlm = Asset.native();
  const usdc = new Asset(
    'USDC',
    'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
  );

  console.log('\n=== Strict Send Path Finding ===\n');
  console.log('Fixed: send 50 XLM. Discover how much USDC you receive.\n');

  const strictSendPaths = await pathManager.findPaths({
    sourceAsset: xlm,
    destAsset: usdc,
    amount: '50.0000000',
    type: 'strict_send',
    limit: 15,
  });

  console.log('Paths found:', strictSendPaths.length);
  strictSendPaths.slice(0, 5).forEach((p, i) => {
    console.log(
      `  ${i + 1}. Receive ${p.destination_amount} USDC (path depth: ${p.pathDepth}, liquidity: ${p.liquidityDepth ?? 'n/a'})`
    );
  });

  const bestSend = await pathManager.getBestPath(strictSendPaths, 'strict_send');
  if (bestSend) {
    console.log('\nBest path (max receive):', bestSend.destination_amount, 'USDC');
    console.log('Price:', bestSend.price);
  }

  console.log('\n=== Strict Receive Path Finding ===\n');
  console.log('Fixed: receive 25 USDC. Discover how much XLM to send.\n');

  const strictReceivePaths = await pathManager.findPaths({
    sourceAsset: xlm,
    destAsset: usdc,
    amount: '25.0000000',
    type: 'strict_receive',
    limit: 15,
  });

  console.log('Paths found:', strictReceivePaths.length);
  strictReceivePaths.slice(0, 5).forEach((p, i) => {
    console.log(
      `  ${i + 1}. Send ${p.source_amount} XLM (path depth: ${p.pathDepth})`
    );
  });

  const bestReceive = await pathManager.getBestPath(
    strictReceivePaths,
    'strict_receive'
  );
  if (bestReceive) {
    console.log('\nBest path (min send):', bestReceive.source_amount, 'XLM');
    console.log('Price:', bestReceive.price);
  }
}

pathFinding().catch(console.error);
