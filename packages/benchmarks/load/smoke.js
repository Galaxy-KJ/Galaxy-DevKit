import http from 'k6/http';
import { check, sleep } from 'k6';
import { duration, endpoints, target, vus } from './lib/config.js';

export const options = {
  vus: vus(1),
  duration: duration('10s'),
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<800'],
  },
};

export default function () {
  const base = target();
  const live = http.get(`${base}${endpoints.healthLive}`);
  check(live, { 'health live 200': (r) => r.status === 200 });

  const quote = http.get(`${base}${endpoints.defiQuote}`);
  check(quote, { 'quote not 5xx': (r) => r.status < 500 });

  sleep(0.3);
}
