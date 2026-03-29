/**
 * Example: Simple token swap (path payment)
 * - Basic strict send swap (fixed amount in, variable amount out)
 * - Estimate before execution
 * - Execute swap with PathPaymentManager
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

async function simpleSwap() {
  const server = new Horizon.Server(networkConfig.horizonUrl);
  const pathManager = new PathPaymentManager(server, networkConfig.passphrase);

  const sourceAsset = Asset.native();
  const destAsset = new Asset(
    'USDC',
    'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
  );

  console.log('\n=== Simple Swap (Strict Send) ===\n');

  const paths = await pathManager.findPaths({
    sourceAsset,
    destAsset,
    amount: '100.0000000',
    type: 'strict_send',
    limit: 10,
  });

  if (paths.length === 0) {
    console.log('No paths found.');
    return;
  }

  const best = await pathManager.getBestPath(paths, 'strict_send');
  if (best) {
    console.log('Best path:', best.destination_amount, 'dest, price:', best.price);
  }

  const estimate = await pathManager.estimateSwap({
    sendAsset: sourceAsset,
    destAsset,
    amount: '100.0000000',
    type: 'strict_send',
    maxSlippage: 1,
  });

  console.log('Estimate output:', estimate.outputAmount, 'price impact:', estimate.priceImpact, '%');
  console.log('To execute: pathManager.executeSwap(wallet, params, password, wallet.publicKey)');
}

simpleSwap().catch(console.error);
