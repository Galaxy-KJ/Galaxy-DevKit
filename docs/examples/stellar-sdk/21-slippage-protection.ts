/**
 * Example: Slippage protection for path payments
 *
 * This example demonstrates:
 * - Minimum destination amount (strict send)
 * - Maximum send amount (strict receive)
 * - Max slippage percentage
 * - Price impact warning
 * - Validation before execution
 */

import {
  PathPaymentManager,
  Asset,
  NetworkConfig,
  Horizon,
  Networks,
  HIGH_PRICE_IMPACT_THRESHOLD,
} from '@galaxy/core-stellar-sdk';

const networkConfig: NetworkConfig = {
  network: 'testnet',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  passphrase: Networks.TESTNET,
};

async function slippageProtection() {
  const server = new Horizon.Server(networkConfig.horizonUrl);
  const pathManager = new PathPaymentManager(server, networkConfig.passphrase);

  const xlm = Asset.native();
  const usdc = new Asset(
    'USDC',
    'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5'
  );

  console.log('\n=== Slippage Protection (Strict Send) ===\n');
  console.log('Send 100 XLM, require at least 94 USDC (6% slippage tolerance).\n');

  const estimate = await pathManager.estimateSwap({
    sendAsset: xlm,
    destAsset: usdc,
    amount: '100.0000000',
    type: 'strict_send',
    maxSlippage: 6,
    minDestinationAmount: '94.0000000',
  });

  console.log('Estimate:');
  console.log('  Output:', estimate.outputAmount);
  console.log('  Minimum received (6% slippage):', estimate.minimumReceived);
  console.log('  Min destination check: 94.0 <= minimumReceived?', parseFloat(estimate.minimumReceived ?? '0') >= 94);
  console.log('  Price impact:', estimate.priceImpact, '%');
  console.log('  High impact (>= ' + HIGH_PRICE_IMPACT_THRESHOLD + '%):', estimate.highImpact);

  if (estimate.highImpact) {
    console.log('\n  Warning: High price impact. Consider splitting the trade or using a limit order.');
  }

  console.log('\n=== Slippage Protection (Strict Receive) ===\n');
  console.log('Receive exactly 50 USDC, cap send at 55 XLM (10% slippage).\n');

  const estimateReceive = await pathManager.estimateSwap({
    sendAsset: xlm,
    destAsset: usdc,
    amount: '50.0000000',
    type: 'strict_receive',
    maxSlippage: 10,
    maxSendAmount: '55.0000000',
  });

  console.log('Estimate:');
  console.log('  Max cost (10% slippage):', estimateReceive.maximumCost);
  console.log('  Max send check: maximumCost <= 55?', parseFloat(estimateReceive.maximumCost ?? '0') <= 55);
  console.log('  Price impact:', estimateReceive.priceImpact, '%');

  console.log('\nWhen calling executeSwap, pass minDestinationAmount / maxSendAmount to enforce slippage.');
  console.log('If validation fails, executeSwap throws before submitting the transaction.');
}

slippageProtection().catch(console.error);
