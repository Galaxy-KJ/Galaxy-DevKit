/**
 * Minimal HTTP stand-in for k6 smoke when the real REST API is not running.
 * Mirrors /health/live and a cached quote GET. Never used against mainnet.
 */
import http from 'node:http';

const port = Number(process.env.PORT || 3456);
const cache = new Map();
let hits = 0;
let misses = 0;

const server = http.createServer((req, res) => {
  const url = req.url || '/';
  res.setHeader('content-type', 'application/json');

  if (url === '/health/live' || url === '/health') {
    res.end(JSON.stringify({ status: 'up', timestamp: new Date().toISOString() }));
    return;
  }

  if (url.startsWith('/api/v1/defi/')) {
    const cached = cache.get(url);
    if (cached) {
      hits += 1;
      res.end(cached);
      return;
    }
    misses += 1;
    const body = JSON.stringify({
      assetIn: 'XLM',
      assetOut: 'USDC',
      amountIn: '10',
      totalAmountOut: '9.97',
      cached: false,
    });
    cache.set(url, body);
    res.end(body);
    return;
  }

  if (url === '/api/v1/monitoring/cache/stats') {
    const total = hits + misses;
    res.end(JSON.stringify({ hits, misses, hitRate: total === 0 ? 0 : hits / total }));
    return;
  }

  if (url === '/metrics') {
    res.setHeader('content-type', 'text/plain');
    res.end(`process_resident_memory_bytes ${process.memoryUsage().rss}\n`);
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(port, '127.0.0.1', () => {
  console.log(`fixture listening on http://127.0.0.1:${port}`);
});
