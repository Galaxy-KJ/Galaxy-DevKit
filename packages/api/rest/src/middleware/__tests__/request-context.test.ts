import express from 'express';
import request from 'supertest';
import { Writable } from 'stream';
import { createLogger } from '@galaxy-kj/api-logger';
import { requestContext } from '../request-context';

function buildApp() {
  const app = express();
  app.use(requestContext());
  app.get('/id', (req, res) => {
    res.json({ header: req.headers['x-request-id'], hasLog: typeof req.log?.info === 'function' });
  });
  return app;
}

describe('requestContext', () => {
  it('generates an id when none is sent', async () => {
    const res = await request(buildApp()).get('/id');
    expect(res.body.header).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.headers['x-request-id']).toBe(res.body.header);
  });

  it('respects a valid incoming id', async () => {
    const res = await request(buildApp()).get('/id').set('X-Request-Id', 'abc-123.DEF_4');
    expect(res.body.header).toBe('abc-123.DEF_4');
    expect(res.headers['x-request-id']).toBe('abc-123.DEF_4');
  });

  it('rejects an id longer than 128 characters', async () => {
    const long = 'a'.repeat(200);
    const res = await request(buildApp()).get('/id').set('X-Request-Id', long);
    expect(res.body.header).not.toBe(long);
    expect(res.body.header).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('rejects an id with invalid characters', async () => {
    const res = await request(buildApp()).get('/id').set('X-Request-Id', 'x y');
    expect(res.body.header).not.toBe('x y');
    expect(res.headers['x-request-id']).toBe(res.body.header);
  });

  it('rejects an id containing a newline', () => {
    const mw = requestContext();
    const req: any = { headers: { 'x-request-id': 'x\ny' } };
    const res: any = { setHeader: jest.fn(), on: jest.fn(), getHeader: jest.fn() };
    mw(req, res, jest.fn());
    expect(req.headers['x-request-id']).not.toBe('x\ny');
    expect(req.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('exposes a request-scoped logger carrying the request id', async () => {
    const res = await request(buildApp()).get('/id');
    expect(res.body.hasLog).toBe(true);
  });

  it('logs with the request id bound', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _e, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const logger = createLogger({ level: 'info', destination: stream });
    const app = express();
    app.use(requestContext({ logger }));
    app.get('/x', (req, res) => {
      req.log.info('inside handler');
      res.json({});
    });
    await request(app).get('/x').set('X-Request-Id', 'rid-1').set('Authorization', 'Bearer s3cret');
    const handlerLine = lines.map((l) => JSON.parse(l)).find((l) => l.msg === 'inside handler');
    expect(handlerLine.requestId).toBe('rid-1');
    expect(lines.join('')).not.toContain('s3cret');
  });
});
