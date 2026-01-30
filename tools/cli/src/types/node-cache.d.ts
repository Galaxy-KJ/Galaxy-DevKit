/**
 * Type declaration for node-cache (allows tests to run when @types/node-cache is not installed)
 */
declare module 'node-cache' {
  interface NodeCacheOptions {
    stdTTL?: number;
  }
  class NodeCache {
    constructor(options?: NodeCacheOptions);
    set(key: string, value: unknown, ttl?: number): boolean;
    get<T>(key: string): T | undefined;
    flushAll(): void;
  }
  export = NodeCache;
}
