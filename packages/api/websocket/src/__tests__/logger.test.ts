import { Writable } from 'stream';
import { createLogger } from '@galaxy-kj/api-logger';
import { socketLogger } from '../logger';
import type { ExtendedSocket } from '../types/websocket-types';

function setup() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _enc, cb) {
      lines.push(chunk.toString());
      cb();
    },
  });
  const base = createLogger({ level: 'info', destination: stream });
  return { base, last: () => JSON.parse(lines[lines.length - 1]) };
}

describe('socketLogger', () => {
  it('binds the socket id and no userId before authentication', () => {
    const { base, last } = setup();
    const socket = { id: 's1' } as ExtendedSocket;
    socketLogger(socket, base).info('connected');
    expect(last().socketId).toBe('s1');
    expect(last()).not.toHaveProperty('userId');
  });

  it('includes the userId once the socket is authenticated', () => {
    const { base, last } = setup();
    const socket = { id: 's1' } as ExtendedSocket;
    socket.userId = 'u1';
    socketLogger(socket, base).info('authenticated');
    expect(last().socketId).toBe('s1');
    expect(last().userId).toBe('u1');
  });
});
