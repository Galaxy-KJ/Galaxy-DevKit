/**
 * @fileoverview Frontend activity logger
 *
 * A small in-memory logger + DOM viewer pair purpose-built for the Galaxy
 * playground. Designed around four properties from the issue spec:
 *
 *   1. **Safe rendering** — every string written to the DOM goes through
 *      textContent, never innerHTML. Stack traces and TX hashes are wrapped
 *      in `<details>` / `<code>` so user-supplied content can never
 *      smuggle in script tags or attribute injections.
 *   2. **Bounded memory** — the log buffer is capped at `maxEntries`
 *      (default 500). Older entries are evicted FIFO so long-running test
 *      sessions can't pin RAM.
 *   3. **Structured errors** — `logger.error()` accepts native `Error`
 *      objects, captures their stack and any cause chain, and renders the
 *      stack inside a collapsible `<details>` element.
 *   4. **Developer affordances** — TX-hash copy buttons, JSON export
 *      ("Download log"), severity filters, and a clear button.
 *
 * The class is decoupled from the DOM: `Logger.attach(element)` is optional
 * and entirely additive, so services can build the singleton (`logger`) and
 * start emitting before the panel mounts.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  /** Monotonically-increasing id, unique within a Logger instance. */
  id: number;
  level: LogLevel;
  message: string;
  /** ISO-8601 timestamp of when the entry was recorded. */
  timestamp: string;
  /** Optional category, e.g. "soroswap", "blend", "wallet". */
  scope?: string;
  /** Free-form structured payload — anything JSON-serialisable. */
  data?: Record<string, unknown>;
  /** Stack trace from an Error, if one was supplied. */
  stack?: string;
  /** Transaction hash for this entry, if any (rendered with a copy button). */
  txHash?: string;
}

export interface LoggerOptions {
  /** Cap on the number of entries kept in memory. Default: 500. */
  maxEntries?: number;
  /** Minimum level to record. Anything below this is silently dropped. */
  minLevel?: LogLevel;
  /** When true, also forwards entries to console.* (handy in dev). */
  mirrorToConsole?: boolean;
}

export interface LogInputBase {
  scope?: string;
  data?: Record<string, unknown>;
  txHash?: string;
}

export type LoggerListener = (entry: LogEntry) => void;

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

/**
 * Tiny structured logger. Designed to be a singleton (`logger`) but
 * instantiable for tests.
 */
export class Logger {
  private readonly entries: LogEntry[] = [];
  private readonly listeners = new Set<LoggerListener>();
  private readonly maxEntries: number;
  private readonly mirrorToConsole: boolean;
  private minLevel: LogLevel;
  private nextId = 1;

  constructor(options: LoggerOptions = {}) {
    this.maxEntries = Math.max(1, options.maxEntries ?? 500);
    this.minLevel = options.minLevel ?? 'debug';
    this.mirrorToConsole = options.mirrorToConsole ?? false;
  }

  // ── Public API ───────────────────────────────────────────────────────────

  debug(message: string, input?: LogInputBase): LogEntry | undefined {
    return this.record('debug', message, input);
  }
  info(message: string, input?: LogInputBase): LogEntry | undefined {
    return this.record('info', message, input);
  }
  warn(message: string, input?: LogInputBase): LogEntry | undefined {
    return this.record('warn', message, input);
  }

  /**
   * Record an error. Accepts either a string message + optional payload, or
   * an `Error` instance whose stack/cause chain is captured automatically.
   */
  error(messageOrError: string | Error, input?: LogInputBase): LogEntry | undefined {
    if (messageOrError instanceof Error) {
      const cause = (messageOrError as Error & { cause?: unknown }).cause;
      return this.record('error', messageOrError.message || String(messageOrError), {
        ...input,
        stack: messageOrError.stack,
        data: {
          ...(input?.data ?? {}),
          ...(cause !== undefined ? { cause: serialiseCause(cause) } : {}),
        },
      });
    }
    return this.record('error', messageOrError, input);
  }

  /** Subscribe to new entries. Returns an unsubscribe function. */
  subscribe(listener: LoggerListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getEntries(): readonly LogEntry[] {
    return this.entries;
  }

  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  clear(): void {
    this.entries.length = 0;
    this.notifyClear();
  }

  /** Serialise the current buffer as a downloadable JSON blob string. */
  toJson(): string {
    return JSON.stringify(this.entries, null, 2);
  }

  /**
   * Mount a panel into the supplied DOM element. The element is *replaced*
   * with the new panel content. Subsequent log entries are rendered into the
   * panel automatically. Returns a teardown function.
   */
  attach(host: HTMLElement, document_: Document = host.ownerDocument!): LoggerView {
    return new LoggerView(this, host, document_);
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  private record(
    level: LogLevel,
    rawMessage: string,
    input?: LogInputBase & { stack?: string },
  ): LogEntry | undefined {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minLevel]) return undefined;

    const entry: LogEntry = {
      id: this.nextId++,
      level,
      message: String(rawMessage ?? ''),
      timestamp: new Date().toISOString(),
      scope: input?.scope,
      data: input?.data,
      stack: input?.stack,
      txHash: input?.txHash,
    };

    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries);
    }

    if (this.mirrorToConsole) {
      const sink = console[level === 'debug' ? 'log' : level] as (...args: unknown[]) => void;
      sink.call(console, `[${entry.scope ?? 'galaxy'}] ${entry.message}`, entry.data ?? '');
    }

    for (const l of this.listeners) {
      try {
        l(entry);
      } catch {
        // listeners are isolated — a bad subscriber must not break logging.
      }
    }
    return entry;
  }

  private notifyClear(): void {
    for (const l of this.listeners) {
      try {
        // signal a clear by emitting a sentinel entry; viewers handle level === '__clear__'
        l({
          id: -1,
          level: 'info',
          message: '__clear__',
          timestamp: new Date().toISOString(),
        });
      } catch {
        /* swallow */
      }
    }
  }
}

/**
 * DOM viewer that subscribes to a Logger and renders entries into a host
 * element. Kept as a separate class so headless environments (tests, SSR)
 * can use Logger without pulling in DOM code paths.
 */
export class LoggerView {
  private readonly logger: Logger;
  private readonly host: HTMLElement;
  private readonly doc: Document;
  private readonly list: HTMLOListElement;
  private readonly filterSelect: HTMLSelectElement;
  private readonly unsubscribe: () => void;
  /** Map id → row element so we can remove on clear and stay O(1). */
  private readonly rows = new Map<number, HTMLLIElement>();
  private currentFilter: LogLevel | 'all' = 'all';

  constructor(logger: Logger, host: HTMLElement, doc: Document) {
    this.logger = logger;
    this.host = host;
    this.doc = doc;

    this.host.classList.add('log-panel');
    this.host.replaceChildren();

    const header = doc.createElement('header');
    header.className = 'log-panel__header';

    const title = doc.createElement('h3');
    title.textContent = 'Activity log';
    header.appendChild(title);

    this.filterSelect = doc.createElement('select');
    this.filterSelect.className = 'log-panel__filter';
    this.filterSelect.setAttribute('aria-label', 'Filter log level');
    for (const lvl of ['all', 'debug', 'info', 'warn', 'error'] as const) {
      const o = doc.createElement('option');
      o.value = lvl;
      o.textContent = lvl;
      this.filterSelect.appendChild(o);
    }
    this.filterSelect.addEventListener('change', () => {
      this.currentFilter = this.filterSelect.value as LogLevel | 'all';
      this.applyFilter();
    });

    const exportBtn = this.makeButton('Download log', () => this.exportJson());
    const clearBtn = this.makeButton('Clear', () => this.logger.clear());

    header.append(this.filterSelect, exportBtn, clearBtn);

    this.list = doc.createElement('ol');
    this.list.className = 'log-panel__list';
    this.list.setAttribute('aria-live', 'polite');
    this.list.setAttribute('aria-label', 'Activity log entries');

    this.host.append(header, this.list);

    // Render the existing buffer first, then subscribe.
    for (const e of logger.getEntries()) this.renderEntry(e);
    this.unsubscribe = logger.subscribe((e) => {
      if (e.id === -1 && e.message === '__clear__') {
        this.list.replaceChildren();
        this.rows.clear();
        return;
      }
      this.renderEntry(e);
    });
  }

  destroy(): void {
    this.unsubscribe();
  }

  // ── Rendering ────────────────────────────────────────────────────────────

  private makeButton(label: string, onClick: () => void): HTMLButtonElement {
    const b = this.doc.createElement('button');
    b.type = 'button';
    b.className = 'log-panel__btn';
    b.textContent = label;
    b.addEventListener('click', onClick);
    return b;
  }

  private renderEntry(entry: LogEntry): void {
    const row = this.doc.createElement('li');
    row.className = `log-panel__row log-panel__row--${entry.level}`;
    row.dataset['level'] = entry.level;
    if (this.currentFilter !== 'all' && this.currentFilter !== entry.level) {
      row.hidden = true;
    }

    const timeEl = this.doc.createElement('time');
    timeEl.dateTime = entry.timestamp;
    timeEl.textContent = formatTimestamp(entry.timestamp);
    row.appendChild(timeEl);

    const levelBadge = this.doc.createElement('span');
    levelBadge.className = `log-panel__level log-panel__level--${entry.level}`;
    levelBadge.textContent = entry.level.toUpperCase();
    row.appendChild(levelBadge);

    if (entry.scope) {
      const scope = this.doc.createElement('span');
      scope.className = 'log-panel__scope';
      scope.textContent = entry.scope;
      row.appendChild(scope);
    }

    const message = this.doc.createElement('span');
    message.className = 'log-panel__message';
    message.textContent = entry.message; // textContent — never innerHTML
    row.appendChild(message);

    if (entry.txHash) {
      row.appendChild(this.renderTxHash(entry.txHash));
    }

    if (entry.data && Object.keys(entry.data).length > 0) {
      row.appendChild(this.renderDetails('data', JSON.stringify(entry.data, null, 2)));
    }

    if (entry.stack) {
      row.appendChild(this.renderDetails('stack trace', entry.stack));
    }

    this.list.appendChild(row);
    this.rows.set(entry.id, row);
  }

  private renderTxHash(hash: string): HTMLElement {
    const wrap = this.doc.createElement('span');
    wrap.className = 'log-panel__tx';

    const code = this.doc.createElement('code');
    code.textContent = hash;
    wrap.appendChild(code);

    const btn = this.doc.createElement('button');
    btn.type = 'button';
    btn.className = 'log-panel__copy';
    btn.textContent = 'Copy';
    btn.setAttribute('aria-label', `Copy transaction hash ${hash}`);
    btn.addEventListener('click', async () => {
      const result = await copyToClipboard(hash);
      btn.textContent = result ? 'Copied!' : 'Copy failed';
      setTimeout(() => (btn.textContent = 'Copy'), 1500);
    });
    wrap.appendChild(btn);
    return wrap;
  }

  private renderDetails(label: string, body: string): HTMLDetailsElement {
    const details = this.doc.createElement('details');
    details.className = 'log-panel__details';
    const summary = this.doc.createElement('summary');
    summary.textContent = label;
    details.appendChild(summary);
    const pre = this.doc.createElement('pre');
    pre.textContent = body; // textContent on <pre> — no HTML evaluation
    details.appendChild(pre);
    return details;
  }

  private applyFilter(): void {
    for (const row of this.rows.values()) {
      const level = row.dataset['level'] as LogLevel;
      row.hidden = this.currentFilter !== 'all' && this.currentFilter !== level;
    }
  }

  private exportJson(): void {
    const json = this.logger.toJson();
    const win = this.doc.defaultView;
    if (!win) return;
    const blob = new Blob([json], { type: 'application/json' });
    const url = win.URL.createObjectURL(blob);
    const a = this.doc.createElement('a');
    a.href = url;
    a.download = `galaxy-log-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    this.doc.body.appendChild(a);
    a.click();
    a.remove();
    win.URL.revokeObjectURL(url);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  // toLocaleTimeString produces "12:34:56 PM" — readable and locale-aware,
  // and falls back to the raw ISO if Date parsing fails.
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString();
}

function serialiseCause(cause: unknown): unknown {
  if (cause instanceof Error) {
    return { name: cause.name, message: cause.message, stack: cause.stack };
  }
  return cause;
}

/**
 * Copy text to clipboard with a `navigator.clipboard` first, falling back to
 * a no-op-and-return-false branch in browsers/environments that don't expose
 * the Clipboard API. Exposed for tests and panels.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  const nav = (globalThis as { navigator?: Navigator }).navigator;
  if (nav?.clipboard?.writeText) {
    try {
      await nav.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/** Default singleton used across the playground services. */
export const logger = new Logger({ maxEntries: 500, mirrorToConsole: false });
