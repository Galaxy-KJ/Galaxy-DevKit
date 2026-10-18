// From a checkout: build the SDK first, then start the existing REST server.
import { GalaxyClient, GalaxyApiError } from '../../../packages/sdk/typescript/dist/esm/index.js';

const client = new GalaxyClient({
  baseUrl: process.env.GALAXY_API_URL ?? 'http://127.0.0.1:3000',
  apiKey: process.env.GALAXY_API_KEY,
  network: 'testnet',
});

if (process.argv.includes('--probe')) {
  // A real route validation probe: no funds, signatures or chain call required.
  try {
    await client.defi.aggregator.getQuote({ assetIn: '', assetOut: '', amountIn: '' });
    throw new Error('Expected the REST validation response');
  } catch (error) {
    if (!(error instanceof GalaxyApiError) || error.status !== 400 || error.code !== 'VALIDATION_ERROR') throw error;
    process.stdout.write('Local REST route and SDK error handling verified.\n');
  }
} else {
  if (!process.env.GALAXY_ASSET_OUT) throw new Error('Set GALAXY_ASSET_OUT to a configured testnet CODE:ISSUER, or use --probe');
  const quote = await client.defi.aggregator.getQuote({
    assetIn: 'XLM', assetOut: process.env.GALAXY_ASSET_OUT, amountIn: '1',
  });
  process.stdout.write(JSON.stringify(quote, null, 2) + '\n');
}
