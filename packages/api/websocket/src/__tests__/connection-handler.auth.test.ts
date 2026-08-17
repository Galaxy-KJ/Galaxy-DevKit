import * as fs from 'fs';
import * as path from 'path';
import { ConnectionHandler } from '../handlers/connection-handler';
import { EventBroadcaster } from '../services/event-broadcaster';
import { authMiddleware, validateCredential } from '../middleware/auth';
import { ExtendedSocket } from '../types/websocket-types';

jest.mock('../middleware/auth', () => {
  const actual = jest.requireActual('../middleware/auth');
  return {
    ...actual,
    validateCredential: jest.fn()
  };
});

const mockedValidateCredential = validateCredential as jest.MockedFunction<typeof validateCredential>;

type ListenerMap = Map<string, (...args: unknown[]) => unknown>;

function createSocket(id = 'sock-1') {
  const listeners: ListenerMap = new Map();
  const rooms = new Set<string>([id]);
  const emitted: Array<{ event: string; payload: unknown }> = [];

  const socket = {
    id,
    connected: true,
    rooms,
    handshake: {
      address: '127.0.0.1',
      headers: { 'user-agent': 'jest' }
    },
    emit: jest.fn((event: string, payload?: unknown) => {
      emitted.push({ event, payload });
    }),
    join: jest.fn(async (room: string) => {
      rooms.add(room);
    }),
    leave: jest.fn(async (room: string) => {
      rooms.delete(room);
    }),
    disconnect: jest.fn(() => {
      socket.connected = false;
      const onDisconnect = listeners.get('disconnect');
      if (onDisconnect) {
        onDisconnect('io server disconnect');
      }
    }),
    on: jest.fn((event: string, cb: (...args: unknown[]) => unknown) => {
      listeners.set(event, cb);
    }),
    onAny: jest.fn(),
    listeners,
    emitted
  };

  return socket as unknown as ExtendedSocket & {
    listeners: ListenerMap;
    emitted: Array<{ event: string; payload: unknown }>;
    connected: boolean;
  };
}

function createRoomManager() {
  return {
    joinRoom: jest.fn(async (socket: ExtendedSocket, room: string) => {
      socket.connectionState?.rooms.add(room);
    }),
    leaveRoom: jest.fn(async (socket: ExtendedSocket, room: string) => {
      socket.connectionState?.rooms.delete(room);
      await socket.leave(room);
    }),
    cleanupUserRooms: jest.fn()
  };
}

function createHandler() {
  const connectionListeners: Array<(socket: ExtendedSocket) => void> = [];
  const sockets = new Map<string, ExtendedSocket>();
  const server = {
    on: jest.fn((event: string, cb: (socket: ExtendedSocket) => void) => {
      if (event === 'connection') {
        connectionListeners.push(cb);
      }
    }),
    sockets: { sockets }
  };
  const roomManager = createRoomManager();
  const eventBroadcaster = { destroy: jest.fn() };
  const handler = new ConnectionHandler(
    server as never,
    roomManager as never,
    eventBroadcaster as never
  );

  return { handler, connectionListeners, sockets, roomManager, server };
}

async function connectAndAuthenticate(
  token: string | undefined,
  authResult?: Awaited<ReturnType<typeof validateCredential>>
) {
  const ctx = createHandler();
  const socket = createSocket();
  ctx.sockets.set(socket.id, socket);
  ctx.connectionListeners[0](socket);

  if (authResult) {
    mockedValidateCredential.mockResolvedValueOnce(authResult);
  }

  const authenticate = socket.listeners.get('authenticate');
  await authenticate?.(token === undefined ? undefined : { token });

  return { ...ctx, socket };
}

describe('ConnectionHandler authentication', () => {
  beforeEach(() => {
    mockedValidateCredential.mockReset();
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('authenticates a valid token and sets userId from the token subject', async () => {
    const { handler, socket, roomManager } = await connectAndAuthenticate('valid.jwt.token', {
      success: true,
      userId: '11111111-1111-1111-1111-111111111111'
    });

    expect(socket.isAuthenticated).toBe(true);
    expect(socket.userId).toBe('11111111-1111-1111-1111-111111111111');
    expect(roomManager.joinRoom).toHaveBeenCalledWith(
      socket,
      'user:11111111-1111-1111-1111-111111111111'
    );
    expect(socket.emitted.filter((item) => item.event === 'authenticated')).toHaveLength(1);
    expect(socket.emitted.find((item) => item.event === 'authenticated')?.payload).toEqual(
      expect.objectContaining({ userId: '11111111-1111-1111-1111-111111111111' })
    );
    expect(socket.disconnect).not.toHaveBeenCalled();

    handler.cleanup();
  });

  it('rejects an invalid signature without marking the socket authenticated', async () => {
    const { handler, socket, roomManager } = await connectAndAuthenticate('bad.sig.token', {
      success: false,
      error: 'Token validation failed: invalid signature'
    });

    expect(socket.isAuthenticated).toBeFalsy();
    expect(socket.userId).toBeUndefined();
    expect(roomManager.joinRoom).not.toHaveBeenCalled();
    expect(socket.emitted.some((item) => item.event === 'auth_error')).toBe(true);
    expect(socket.disconnect).toHaveBeenCalledWith(true);
    expect(Array.from(socket.rooms).some((room) => room.startsWith('user:'))).toBe(false);

    handler.cleanup();
  });

  it('rejects an expired token and disconnects', async () => {
    const { handler, socket } = await connectAndAuthenticate('expired.jwt.token', {
      success: false,
      error: 'Token validation failed: token expired'
    });

    expect(socket.isAuthenticated).toBeFalsy();
    expect(socket.emitted.some((item) => item.event === 'auth_error')).toBe(true);
    expect(socket.disconnect).toHaveBeenCalledWith(true);

    handler.cleanup();
  });

  it('rejects a missing token and disconnects', async () => {
    const { handler, socket, roomManager } = await connectAndAuthenticate(undefined);

    expect(mockedValidateCredential).not.toHaveBeenCalled();
    expect(socket.isAuthenticated).toBeFalsy();
    expect(roomManager.joinRoom).not.toHaveBeenCalled();
    expect(socket.emitted.some((item) => item.event === 'auth_error')).toBe(true);
    expect(socket.disconnect).toHaveBeenCalledWith(true);

    handler.cleanup();
  });

  it('rejects a re-auth attempt and keeps the original userId', async () => {
    const { handler, socket } = await connectAndAuthenticate('valid.jwt.token', {
      success: true,
      userId: 'user-original'
    });

    mockedValidateCredential.mockResolvedValueOnce({
      success: true,
      userId: 'user-attacker'
    });

    const authenticate = socket.listeners.get('authenticate');
    await authenticate?.({ token: 'other.jwt.token' });

    expect(socket.userId).toBe('user-original');
    expect(socket.isAuthenticated).toBe(true);
    expect(socket.emitted.filter((item) => item.event === 'authenticated')).toHaveLength(1);
    expect(socket.emitted.some((item) => item.event === 'auth_error')).toBe(true);
    expect(socket.disconnect).not.toHaveBeenCalled();

    handler.cleanup();
  });

  it('lets broadcastToUser reach the socket that owns the verified userId', async () => {
    const { handler, socket, server } = await connectAndAuthenticate('valid.jwt.token', {
      success: true,
      userId: 'user-real'
    });

    const broadcaster = new EventBroadcaster(server as never);
    await broadcaster.broadcastToUser('user-real', {
      id: 'evt-1',
      type: 'wallet:balance_updated',
      timestamp: Date.now(),
      source: 'galaxy-websocket',
      data: {
        walletId: 'w1',
        userId: 'user-real',
        asset: 'XLM',
        balance: '1'
      }
    } as never);

    expect(socket.emit).toHaveBeenCalledWith(
      'wallet:balance_updated',
      expect.objectContaining({
        type: 'wallet:balance_updated'
      })
    );

    broadcaster.destroy();
    handler.cleanup();
  });

  it('does not treat a garbage authenticate as success and still times out if needed', async () => {
    const { handler, socket } = await connectAndAuthenticate('garbage-token', {
      success: false,
      error: 'Invalid token: No user found'
    });

    expect(socket.isAuthenticated).toBeFalsy();
    expect(socket.userId).toBeUndefined();
    expect(socket.emitted.some((item) => item.event === 'authenticated')).toBe(false);
    expect(socket.disconnect).toHaveBeenCalledWith(true);

    handler.cleanup();
  });

  it('emits a single authenticated event per authenticate (no dual listener)', async () => {
    const { handler, socket } = await connectAndAuthenticate('valid.jwt.token', {
      success: true,
      userId: 'user-one'
    });

    expect(socket.emitted.filter((item) => item.event === 'authenticated')).toHaveLength(1);

    const next = jest.fn();
    const middlewareSocket = createSocket('sock-middleware');
    authMiddleware(middlewareSocket, next);
    const authenticateRegs = (middlewareSocket.on as jest.Mock).mock.calls.filter(
      ([event]: [string]) => event === 'authenticate'
    );
    expect(authenticateRegs).toHaveLength(0);
    expect(next).toHaveBeenCalled();

    handler.cleanup();
  });

  it('does not forge identity with Math.random', () => {
    const handlerSource = fs.readFileSync(
      path.join(__dirname, '../handlers/connection-handler.ts'),
      'utf8'
    );
    const authSource = fs.readFileSync(path.join(__dirname, '../middleware/auth.ts'), 'utf8');

    expect(handlerSource).not.toMatch(/Math\.random/);
    expect(authSource).not.toMatch(/Math\.random/);
    expect(handlerSource).not.toMatch(/user-' \+/);
  });

  it('disconnects unauthenticated sockets when the connection timeout fires', () => {
    jest.useFakeTimers();
    const { handler, connectionListeners } = createHandler();
    const socket = createSocket('sock-timeout');
    connectionListeners[0](socket);

    expect(socket.disconnect).not.toHaveBeenCalled();
    jest.advanceTimersByTime(30000);
    expect(socket.emitted.some((item) => item.event === 'timeout')).toBe(true);
    expect(socket.disconnect).toHaveBeenCalledWith(true);

    handler.cleanup();
    jest.useRealTimers();
  });
});
