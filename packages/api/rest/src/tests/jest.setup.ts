// Runs before any test file imports. Without this, redis-client.ts sees no
// REDIS_URL, returns null, and rate-limit.ts's fail-closed default denies
// every submit-tx request with 503 instead of exercising the real 429 path
// the existing test asserts on. The value itself is irrelevant since
// jest.config.js's moduleNameMapper swaps `ioredis` for `ioredis-mock`.
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';