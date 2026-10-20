import { createLogger, type Logger } from '@galaxy-kj/api-logger';
import type { ExtendedSocket } from './types/websocket-types';

export const logger: Logger = createLogger({ name: 'api-websocket' });

/**
 * Builds a child logger bound to the socket. Call it per event so the
 * userId assigned after authentication is included.
 */
export function socketLogger(socket: ExtendedSocket, base: Logger = logger): Logger {
  return base.child({ socketId: socket.id, userId: socket.userId });
}
