import http from 'k6/http';
import { check, sleep } from 'k6';
import { duration, endpoints, target, vus } from './lib/config.js';

export const options = {
  vus: vus(5),
  duration: duration('10m'),
};

export default function () {
  const base = target();
  check(http.get(`${base}${endpoints.healthLive}`), { live: (r) => r.status === 200 });
  http.get(`${base}${endpoints.metrics}`);
  sleep(1);
}
