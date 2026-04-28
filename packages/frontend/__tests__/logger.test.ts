/**
 * Tests for the frontend Logger + LoggerView.
 *
 * Run under jsdom (configured in jest.config.cjs), so DOM APIs are
 * available. We assert that:
 *   - level filtering, max-entries cap, and listener semantics work
 *   - Error objects capture stack + cause chain correctly
 *   - the DOM viewer never invokes innerHTML — every payload is rendered
 *     via textContent inside <pre>/<code>, which is the core anti-XSS
 *     guarantee promised by the issue
 *   - copy-to-clipboard and JSON export work end-to-end
 */

import {
  Logger,
  LoggerView,
  copyToClipboard,
  type LogEntry,
} from '../src/utils/logger';

describe('Logger', () => {
  it('records entries with monotonically increasing ids and ISO timestamps', () => {
    const log = new Logger();
    log.info('first');
    log.info('second');
    const entries = log.getEntries();
    expect(entries.map((e) => e.id)).toEqual([1, 2]);
    expect(new Date(entries[0].timestamp).toString()).not.toBe('Invalid Date');
  });

  it('drops entries below the configured minLevel', () => {
    const log = new Logger({ minLevel: 'warn' });
    log.debug('not me');
    log.info('not me');
    log.warn('me');
    log.error('me too');
    expect(log.getEntries().map((e) => e.message)).toEqual(['me', 'me too']);
  });

  it('caps the in-memory buffer at maxEntries (FIFO eviction)', () => {
    const log = new Logger({ maxEntries: 3 });
    for (let i = 0; i < 6; i++) log.info(`m${i}`);
    expect(log.getEntries().map((e) => e.message)).toEqual(['m3', 'm4', 'm5']);
  });

  it('captures stack and cause chain when an Error is passed to error()', () => {
    const cause = new Error('root');
    const err = new Error('outer', { cause });
    const log = new Logger();
    const entry = log.error(err, { scope: 'wallet', txHash: '0xabc' });
    expect(entry).toBeDefined();
    expect(entry!.level).toBe('error');
    expect(entry!.scope).toBe('wallet');
    expect(entry!.txHash).toBe('0xabc');
    expect(entry!.stack).toMatch(/Error: outer/);
    expect(entry!.data).toBeDefined();
    expect((entry!.data as { cause: { message: string } }).cause.message).toBe('root');
  });

  it('subscribers receive each new entry and can unsubscribe', () => {
    const log = new Logger();
    const seen: LogEntry[] = [];
    const unsub = log.subscribe((e) => {
      if (e.id !== -1) seen.push(e);
    });
    log.info('a');
    log.info('b');
    unsub();
    log.info('c');
    expect(seen.map((e) => e.message)).toEqual(['a', 'b']);
  });

  it('a throwing subscriber does not break logging', () => {
    const log = new Logger();
    const seen: LogEntry[] = [];
    log.subscribe(() => {
      throw new Error('bad subscriber');
    });
    log.subscribe((e) => {
      if (e.id !== -1) seen.push(e);
    });
    log.info('keep going');
    expect(seen).toHaveLength(1);
  });

  it('clear() empties the buffer and notifies subscribers', () => {
    const log = new Logger();
    log.info('a');
    log.info('b');
    let cleared = false;
    log.subscribe((e) => {
      if (e.id === -1 && e.message === '__clear__') cleared = true;
    });
    log.clear();
    expect(log.getEntries()).toHaveLength(0);
    expect(cleared).toBe(true);
  });

  it('toJson serialises the buffer to valid JSON', () => {
    const log = new Logger();
    log.info('hi', { scope: 's', data: { k: 1 } });
    const round = JSON.parse(log.toJson());
    expect(round).toHaveLength(1);
    expect(round[0]).toMatchObject({ message: 'hi', scope: 's', data: { k: 1 } });
  });
});

describe('LoggerView (DOM)', () => {
  let host: HTMLElement;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });
  afterEach(() => {
    host.remove();
  });

  it('renders entries that already exist when the view attaches', () => {
    const log = new Logger();
    log.info('pre-existing');
    log.attach(host);
    expect(host.querySelectorAll('.log-panel__row')).toHaveLength(1);
    expect(host.textContent).toMatch(/pre-existing/);
  });

  it('appends new entries as they arrive', () => {
    const log = new Logger();
    log.attach(host);
    log.info('new entry');
    expect(host.querySelectorAll('.log-panel__row')).toHaveLength(1);
  });

  it('renders user-supplied content via textContent (no HTML evaluation)', () => {
    const log = new Logger();
    log.attach(host);
    log.info('<script>alert("xss")</script>', {
      data: { html: '<img src=x onerror=alert(1)>' },
    });
    // No <script> or <img> tags should leak into the DOM.
    expect(host.querySelector('script')).toBeNull();
    expect(host.querySelector('img')).toBeNull();
    // The text *content* of the row still contains the literal string.
    expect(host.textContent).toMatch(/<script>alert/);
  });

  it('renders stack traces inside <details>, collapsed by default', () => {
    const log = new Logger();
    log.attach(host);
    log.error(new Error('boom'));
    const details = host.querySelectorAll('details.log-panel__details');
    expect(details.length).toBeGreaterThanOrEqual(1);
    // Find the details whose summary is "stack trace"
    const stackDetails = Array.from(details).find(
      (d) => d.querySelector('summary')?.textContent === 'stack trace',
    );
    expect(stackDetails).toBeDefined();
    expect((stackDetails as HTMLDetailsElement).open).toBe(false);
    expect(stackDetails!.querySelector('pre')!.textContent).toMatch(/Error: boom/);
  });

  it('hides rows that don’t match the level filter', () => {
    const log = new Logger();
    const view = log.attach(host);
    log.info('keep visible');
    log.error('only this one');

    const select = host.querySelector('select.log-panel__filter') as HTMLSelectElement;
    select.value = 'error';
    select.dispatchEvent(new Event('change'));

    const rows = host.querySelectorAll('.log-panel__row');
    const visible = Array.from(rows).filter((r) => !(r as HTMLElement).hidden);
    expect(visible).toHaveLength(1);
    expect(visible[0].textContent).toMatch(/only this one/);
    view.destroy();
  });

  it('removes all rows when clear() is called', () => {
    const log = new Logger();
    log.attach(host);
    log.info('a');
    log.info('b');
    log.clear();
    expect(host.querySelectorAll('.log-panel__row')).toHaveLength(0);
  });

  it('renders a copy button next to the tx hash', () => {
    const log = new Logger();
    log.attach(host);
    log.info('settled', { txHash: '0xdeadbeef' });
    const code = host.querySelector('.log-panel__tx code') as HTMLElement;
    const btn = host.querySelector('button.log-panel__copy') as HTMLButtonElement;
    expect(code.textContent).toBe('0xdeadbeef');
    expect(btn).not.toBeNull();
    expect(btn.getAttribute('aria-label')).toMatch(/0xdeadbeef/);
  });
});

describe('copyToClipboard', () => {
  it('returns true when navigator.clipboard.writeText resolves', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { clipboard: { writeText } },
    });
    await expect(copyToClipboard('hello')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('returns false when clipboard.writeText rejects', async () => {
    const writeText = jest.fn().mockRejectedValue(new Error('denied'));
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { clipboard: { writeText } },
    });
    await expect(copyToClipboard('hi')).resolves.toBe(false);
  });

  it('returns false when no clipboard API is available', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {},
    });
    await expect(copyToClipboard('hi')).resolves.toBe(false);
  });
});
