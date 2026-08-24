import http from 'k6/http';
import { check } from 'k6';
import { duration, endpoints, target, vus } from './lib/config.js';

export const options = {
  stages: [
    { duration: duration('30s'), target: vus(20) },
    { duration: duration('30s'), target: vus(50) },
    { duration: duration('20s'), target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.2'],
  },
};

export default function () {
  const base = target();
  check(http.get(`${base}${endpoints.healthLive}`), { live: (r) => r.status === 200 });
  http.get(`${base}${endpoints.defiQuote}`);
}
