import { Writable } from 'stream';
import { createLogger, REDACT_PATHS } from '../index';

function memoryDestination() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  return { stream, lines, last: () => JSON.parse(lines[lines.length - 1]) };
}

describe('createLogger', () => {
  it('emits parseable JSON with level, msg and time in production', () => {
    const dest = memoryDestination();
    const log = createLogger({
      env: { NODE_ENV: 'production' },
      destination: dest.stream,
    });
    log.info('hello');
    const entry = dest.last();
    expect(entry.level).toBe(30);
    expect(entry.msg).toBe('hello');
    expect(typeof entry.time).toBe('number');
  });

  it('redacts secret fields', () => {
    const dest = memoryDestination();
    const log = createLogger({
      env: { NODE_ENV: 'production' },
      destination: dest.stream,
    });
    log.info({ wallet: { privateKey: 'SABC' } }, 'x');
    expect(dest.last().wallet.privateKey).toBe('[REDACTED]');
  });

  it('redacts top-level secret fields', () => {
    const dest = memoryDestination();
    const log = createLogger({
      env: { NODE_ENV: 'production' },
      destination: dest.stream,
    });
    log.info({ privateKey: 'SABC', token: 't' }, 'x');
    expect(dest.last().privateKey).toBe('[REDACTED]');
    expect(dest.last().token).toBe('[REDACTED]');
  });

  it('redacts the authorization header', () => {
    const dest = memoryDestination();
    const log = createLogger({
      env: { NODE_ENV: 'production' },
      destination: dest.stream,
    });
    log.info({ req: { headers: { authorization: 'Bearer x' } } }, 'x');
    expect(dest.last().req.headers.authorization).toBe('[REDACTED]');
  });

  it('exposes the redaction list', () => {
    expect(REDACT_PATHS).toEqual(
      expect.arrayContaining(['*.password', 'req.headers["x-api-key"]', '*.privateKey'])
    );
  });

  it('is silent under NODE_ENV=test without LOG_LEVEL', () => {
    const log = createLogger({ env: { NODE_ENV: 'test' } });
    expect(log.level).toBe('silent');
  });

  it('is info by default outside test', () => {
    const log = createLogger({ env: { NODE_ENV: 'production' } });
    expect(log.level).toBe('info');
  });

  it('respects LOG_LEVEL', () => {
    const log = createLogger({ env: { NODE_ENV: 'test', LOG_LEVEL: 'debug' } });
    expect(log.level).toBe('debug');
  });

  it('prefers an explicit level option', () => {
    const log = createLogger({ env: { LOG_LEVEL: 'debug' }, level: 'warn' });
    expect(log.level).toBe('warn');
  });

  it('falls back to info and warns once on an invalid LOG_LEVEL', () => {
    const dest = memoryDestination();
    const log = createLogger({
      env: { NODE_ENV: 'production', LOG_LEVEL: 'verbose' },
      destination: dest.stream,
    });
    expect(log.level).toBe('info');
    expect(dest.lines).toHaveLength(1);
    expect(dest.last().msg).toMatch(/Invalid log level/);
  });

  it('rejects prototype property names as log levels', () => {
    const dest = memoryDestination();
    const log = createLogger({
      env: { NODE_ENV: 'production', LOG_LEVEL: 'constructor' },
      destination: dest.stream,
    });
    expect(log.level).toBe('info');
  });

  it('redacts session tokens in headers', () => {
    const dest = memoryDestination();
    const log = createLogger({
      env: { NODE_ENV: 'production' },
      destination: dest.stream,
    });
    log.info({ req: { headers: { 'x-session-token': 'sess' } } }, 'x');
    expect(dest.last().req.headers['x-session-token']).toBe('[REDACTED]');
  });

  it('includes child bindings', () => {
    const dest = memoryDestination();
    const log = createLogger({
      env: { NODE_ENV: 'production' },
      destination: dest.stream,
    });
    log.child({ requestId: 'r1' }).info('x');
    expect(dest.last().requestId).toBe('r1');
  });

  it('includes the logger name', () => {
    const dest = memoryDestination();
    const log = createLogger({
      name: 'svc',
      env: { NODE_ENV: 'production' },
      destination: dest.stream,
    });
    log.info('x');
    expect(dest.last().name).toBe('svc');
  });
});
