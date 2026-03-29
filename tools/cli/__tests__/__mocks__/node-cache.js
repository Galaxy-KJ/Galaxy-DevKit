/**
 * Mock for node-cache used in session.ts (avoids requiring the real dependency in tests)
 */
class MockNodeCache {
  constructor() {
    this._store = new Map();
  }
  set(key, value) {
    this._store.set(key, value);
    return true;
  }
  get(key) {
    return this._store.get(key);
  }
  flushAll() {
    this._store.clear();
  }
}

module.exports = MockNodeCache;
