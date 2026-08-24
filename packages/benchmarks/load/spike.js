import http from 'k6/http';
import { check } from 'k6';
import { duration, endpoints, target, vus } from './lib/config.js';

export const options = {
  stages: [
    { duration: '10s', target: vus(5) },
    { duration: duration('10s'), target: vus(80) },
    { duration: '10s', target: vus(5) },
  ],
};

export default function () {
  const base = target();
  check(http.get(`${base}${endpoints.healthLive}`), { live: (r) => r.status === 200 });
}
