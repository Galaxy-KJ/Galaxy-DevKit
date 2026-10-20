# @galaxy-kj/api-logger

Shared structured logger (pino) for the Galaxy API servers. Private workspace package, not published.

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
