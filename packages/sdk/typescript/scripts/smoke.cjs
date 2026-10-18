/** Built package entry-point checks, including native browser ESM with no bundler. */
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('@playwright/test');

async function main() {
  const commonjs = require('@galaxy-kj/sdk-typescript');
  const esm = await import('@galaxy-kj/sdk-typescript');
  for (const { GalaxyClient } of [commonjs, esm]) {
    const client = new GalaxyClient({ baseUrl: 'http://127.0.0.1' });
    assert.equal(client.wallets.available, false);
    assert.equal(typeof client.defi.blend.getPosition, 'function');
  }
  const root = path.resolve(__dirname, '..');
  const server = createServer((req, res) => {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname.startsWith('/dist/esm/') && pathname.endsWith('.js')) {
      const file = path.resolve(root, '.' + pathname);
      if (!file.startsWith(path.join(root, 'dist', 'esm') + path.sep)) { res.writeHead(404).end(); return; }
      res.setHeader('Content-Type', 'text/javascript');
      res.end(readFileSync(file));
    } else if (pathname === '/api/v1/defi/aggregator/quote') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ totalAmountOut: 'browser-http-fixture', keyReceived: req.headers['x-api-key'] === 'browser-test' }));
    } else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>SDK smoke fixture</title>'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    const result = await page.evaluate(async () => {
      const { GalaxyClient } = await import('/dist/esm/index.js');
      const client = new GalaxyClient({ baseUrl: location.origin, apiKey: 'browser-test' });
      return client.defi.aggregator.getQuote({ assetIn: 'XLM', assetOut: 'USD:ISSUER', amountIn: '1' });
    });
    assert.deepEqual(result, { totalAmountOut: 'browser-http-fixture', keyReceived: true });
    process.stdout.write('CJS, ESM package imports and Chromium native ESM/fetch passed.\n');
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}
main().catch(error => { process.stderr.write(String(error) + '\n'); process.exitCode = 1; });
