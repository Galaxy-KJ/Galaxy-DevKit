/**
 * k6 shared config. All knobs come from env vars. Never point at mainnet.
 */

const DEFAULT_BASE = 'http://127.0.0.1:3456';

function asInt(name, fallback) {
  const raw = __ENV[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function target() {
  const url = __ENV.BASE_URL || DEFAULT_BASE;
  if (/mainnet/i.test(url)) {
    throw new Error('refusing to load-test a mainnet URL');
  }
  return url.replace(/\/$/, '');
}

export function duration(fallback) {
  return __ENV.DURATION || fallback;
}

export function vus(fallback) {
  return asInt('VUS', fallback);
}

export const endpoints = {
  healthLive: '/health/live',
  health: '/health',
  defiQuote: '/api/v1/defi/aggregator/quote?assetIn=XLM&assetOut=USDC&amount=10',
  swapQuote: '/api/v1/defi/swap/quote?assetIn=XLM&assetOut=USDC&amount=10',
  cacheStats: '/api/v1/monitoring/cache/stats',
  compliance: '/api/v1/compliance/reports',
  submitTx: '/api/v1/wallets/submit-tx',
  metrics: '/metrics',
};
