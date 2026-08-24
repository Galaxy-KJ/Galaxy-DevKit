import { sleep } from 'k6';
import ws from 'k6/ws';
import { check } from 'k6';
import { duration, target, vus } from './lib/config.js';

export const options = {
  vus: vus(10),
  duration: duration('30s'),
};

export default function () {
  const url = (__ENV.WS_URL || target().replace('http', 'ws') + '/socket.io/?EIO=4&transport=websocket');
  if (/mainnet/i.test(url)) {
    throw new Error('refusing to load-test a mainnet URL');
  }

  const res = ws.connect(url, {}, function (socket) {
    socket.on('open', function () {
      socket.send('2probe');
    });
    socket.on('error', function () {});
    socket.setTimeout(function () {
      socket.close();
    }, 2000);
  });

  check(res, { connected: (r) => r && r.status === 101 });
  sleep(0.5);
}
