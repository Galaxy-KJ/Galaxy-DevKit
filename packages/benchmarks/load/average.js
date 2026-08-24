import http from 'k6/http';
import { check, sleep } from 'k6';
import { duration, endpoints, target, vus } from './lib/config.js';

export const options = {
  vus: vus(10),
  duration: duration('1m'),
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<1200'],
  },
};

export default function () {
  const base = target();
  check(http.get(`${base}${endpoints.healthLive}`), { live: (r) => r.status === 200 });
  check(http.get(`${base}${endpoints.defiQuote}`), { quote: (r) => r.status < 500 });
  check(http.get(`${base}${endpoints.swapQuote}`), { swap: (r) => r.status < 500 });
  sleep(0.2);
}
