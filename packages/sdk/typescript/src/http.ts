import type { GalaxyClientOptions, RequestOptions } from './types.js';

/** HTTP failure, without retaining request URLs, credentials or request bodies. */
export class GalaxyApiError extends Error {
  readonly name = 'GalaxyApiError';
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
  }
}

/** Transport timeout or a non-JSON successful response. */
export class GalaxyTransportError extends Error {
  readonly name = 'GalaxyTransportError';
  constructor(public readonly code: 'TIMEOUT' | 'INVALID_RESPONSE', message: string) { super(message); }
}

export class HttpClient {
  private readonly baseUrl: URL;
  private readonly fetcher: typeof fetch;
  private readonly timeoutMs: number;
  private readonly apiKey?: string;

  constructor(options: GalaxyClientOptions) {
    let url: URL;
    try { url = new URL(options.baseUrl); } catch { throw new TypeError('baseUrl must be an absolute HTTP(S) URL'); }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new TypeError('baseUrl must use HTTP(S) without credentials, query or fragment');
    }
    url.pathname = url.pathname.replace(/\/+$/, '') + '/';
    this.baseUrl = url;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs <= 0 || this.timeoutMs > 2_147_483_647) {
      throw new TypeError('timeoutMs must be a positive 32-bit integer');
    }
    if (options.apiKey !== undefined && (!options.apiKey.trim() || /[\r\n]/.test(options.apiKey))) {
      throw new TypeError('apiKey must be nonempty and contain no line breaks');
    }
    this.apiKey = options.apiKey;
    const fetcher = options.fetch ?? globalThis.fetch;
    if (typeof fetcher !== 'function') throw new TypeError('A fetch implementation is required');
    this.fetcher = fetcher.bind(globalThis);
  }

  async request<T>(method: 'GET' | 'POST', path: string, query: Record<string, string | undefined> = {}, body?: unknown, options: RequestOptions = {}): Promise<T> {
    const url = new URL(`api/v1/defi/${path}`, this.baseUrl);
    for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, value);
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (this.apiKey) headers['x-api-key'] = this.apiKey;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const controller = new AbortController();
    const cancel = () => controller.abort(options.signal?.reason);
    if (options.signal?.aborted) cancel();
    else options.signal?.addEventListener('abort', cancel, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, this.timeoutMs);
    try {
      controller.signal.throwIfAborted();
      const response = await this.fetcher(url.toString(), {
        method, headers, body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal, redirect: 'error', credentials: 'omit',
      });
      const text = await response.text();
      let data: unknown;
      try { data = JSON.parse(text); } catch {
        if (!response.ok) throw new GalaxyApiError(response.status, 'HTTP_ERROR', `Galaxy API request failed (${response.status})`);
        throw new GalaxyTransportError('INVALID_RESPONSE', 'Galaxy API returned a non-JSON response');
      }
      if (!response.ok) {
        const error = data && typeof data === 'object' && 'error' in data ? data.error : undefined;
        const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : 'HTTP_ERROR';
        const message = error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : `Galaxy API request failed (${response.status})`;
        throw new GalaxyApiError(response.status, code, message);
      }
      return data as T;
    } catch (error) {
      if (timedOut) throw new GalaxyTransportError('TIMEOUT', 'Galaxy API request timed out');
      throw error;
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancel);
    }
  }
}
