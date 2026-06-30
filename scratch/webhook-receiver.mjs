// Tiny webhook receiver for the monitoring smoke test.
// Listens on :4000, prints every POST, and verifies the HMAC-SHA256 signature
// against a shared secret.
//
//   PORT=4000 SECRET=sixteen-bytes-secret node scratch/webhook-receiver.mjs

import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT ?? 4000);
const SECRET = process.env.SECRET ?? 'sixteen-bytes-secret';

function verify(req, body) {
  const ts = req.headers['x-galaxy-timestamp'];
  const sig = req.headers['x-galaxy-signature'];
  if (!ts || !sig) return { ok: false, reason: 'missing signature headers' };

  const expected = 'sha256=' + crypto.createHmac('sha256', SECRET).update(`${ts}.${body}`).digest('hex');
  try {
    const ok = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
    return ok ? { ok: true } : { ok: false, reason: 'signature mismatch', expected };
  } catch {
    return { ok: false, reason: 'signature length mismatch', expected };
  }
}

const server = http.createServer((req, res) => {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.end('method not allowed');
    return;
  }

  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    const result = verify(req, body);
    console.log('\n=== webhook received ===');
    console.log('event:    ', req.headers['x-galaxy-event']);
    console.log('event-id: ', req.headers['x-galaxy-event-id']);
    console.log('timestamp:', req.headers['x-galaxy-timestamp']);
    console.log('signature:', result.ok ? 'valid' : `INVALID (${result.reason})`);
    try {
      console.log('payload:  ', JSON.stringify(JSON.parse(body), null, 2));
    } catch {
      console.log('payload:  ', body);
    }

    res.statusCode = result.ok ? 200 : 401;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ok: result.ok }));
  });
});

server.listen(PORT, () => {
  console.log(`[receiver] listening on http://127.0.0.1:${PORT} (secret length=${SECRET.length})`);
});
