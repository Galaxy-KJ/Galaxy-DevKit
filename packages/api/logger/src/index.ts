import pino from 'pino';

export type Logger = pino.Logger;

const SECRET_KEYS = [
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'secretKey',
  'privateKey',
  'seed',
  'mnemonic',
  'apiKey',
  'signature',
  'encryptedPrivateKey',
];

// pino wildcards match one level only, so each key is listed both nested and top-level
export const REDACT_PATHS: string[] = [
  ...SECRET_KEYS.map((key) => `*.${key}`),
  ...SECRET_KEYS,
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["x-session-token"]',
  'headers.authorization',
  'headers.cookie',
  'headers["x-api-key"]',
  'headers["x-session-token"]',
];

export interface CreateLoggerOptions {
  name?: string;
  level?: string;
  env?: NodeJS.ProcessEnv;
  destination?: pino.DestinationStream;
}

function canResolvePretty(): boolean {
  try {
    require.resolve('pino-pretty');
    return true;
  } catch {
    return false;
  }
}

export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const env = options.env ?? process.env;
  const level =
    options.level ??
    env.LOG_LEVEL ??
    (env.NODE_ENV === 'test' ? 'silent' : 'info');

  const base: pino.LoggerOptions = {
    name: options.name,
    level,
    redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  };

  if (options.destination) {
    return pino(base, options.destination);
  }

  if (env.NODE_ENV === 'development' && canResolvePretty()) {
    return pino({
      ...base,
      transport: { target: 'pino-pretty', options: { colorize: true } },
    });
  }

  return pino(base);
}

export const logger: Logger = createLogger();
