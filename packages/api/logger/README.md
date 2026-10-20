# @galaxy-kj/api-logger

Shared structured logger (pino) for the Galaxy API servers. Published like the core packages (public access, `dist` only).

## Usage

```ts
import { logger, createLogger } from '@galaxy-kj/api-logger';

const log = logger.child({ module: 'session-service' });
log.error({ err }, 'failed to refresh session');

const wsLogger = createLogger({ name: 'api-websocket', level: 'debug' });
```

## Behaviour

- Level: `LOG_LEVEL`, or `silent` when `NODE_ENV=test` and `info` otherwise.
- Format: JSON by default. With `NODE_ENV=development` and `pino-pretty` installed, output is pretty printed.
- Redaction: values under `password`, `token`, `accessToken`, `refreshToken`, `secret`, `secretKey`, `privateKey`, `seed`, `mnemonic`, `apiKey`, `signature` and `encryptedPrivateKey` (top-level and one level nested), plus `req.headers.authorization`, `req.headers.cookie`, `req.headers["x-api-key"]` and `headers.authorization`, are replaced with `[REDACTED]`.

## Building

`main` and `types` point to `dist`, so the logger must be built before `api-rest` and `api-websocket` are type-checked, built or started. Both packages run `npm run build -w @galaxy-kj/api-logger` in `prebuild`, `pretype-check` and `prestart` (REST also `preworker` and `preworker:dev`), so a clean checkout works without a manual step. Jest maps `@galaxy-kj/api-logger` to `src` and needs no build. The root `npm run build` also builds this package.

An invalid `LOG_LEVEL` falls back to `info` and logs one warning.
