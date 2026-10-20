/**
 * Galaxy WebSocket API Server
 * 
 * This is the main entry point for the Galaxy WebSocket API server.
 * It initializes Express, Socket.IO, and all handlers for real-time communication.
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import cors from 'cors';
import { config, validateConfig, isProductionReady } from './config';
import { RoomManager } from './services/room-manager';
import { EventBroadcaster } from './services/event-broadcaster';
import { ConnectionHandler } from './handlers/connection-handler';
import { MarketHandler } from './handlers/market-handler';
import { TransactionHandler } from './handlers/transaction-handler';
import { AutomationHandler } from './handlers/automation-handler';
import { TransactionMonitoringHandler } from './handlers/transaction-monitoring-handler';
import { authMiddleware } from './middleware/auth';
import { logger, socketLogger } from './logger';

const log = logger.child({ module: 'server' });

/**
 * WebSocket Server Class
 */
class WebSocketServer {
  private app: express.Application;
  private httpServer: any;
  private io!: Server;
  private roomManager!: RoomManager;
  private eventBroadcaster!: EventBroadcaster;
  private connectionHandler!: ConnectionHandler;
  private marketHandler!: MarketHandler;
  private transactionHandler!: TransactionHandler;
  private automationHandler!: AutomationHandler;
  private transactionMonitoringHandler!: TransactionMonitoringHandler;
  private isShuttingDown = false;
  private redisClients: Redis[] = [];

  constructor() {
    this.app = express();
    this.setupExpress();
    this.setupHttpServer();
    this.setupSocketIO();
    this.setupHandlers();
    this.setupGracefulShutdown();
  }

  /**
   * Setup Express application
   */
  private setupExpress(): void {
    // CORS middleware
    this.app.use(cors({
      origin: config.cors.allowedOrigins,
      credentials: config.cors.credentials
    }));

    // JSON parsing middleware
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: Date.now(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        environment: config.server.environment
      });
    });

    // Metrics endpoint
    this.app.get('/metrics', async (req, res) => {
      try {
        res.json(await this.getServerStats());
      } catch (error) {
        log.error({ err: error }, 'Failed to collect server metrics');
        res.status(503).json({ error: 'Server metrics are temporarily unavailable' });
      }
    });

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        name: 'Galaxy WebSocket API',
        version: process.env.npm_package_version || '1.0.0',
        description: 'Real-time WebSocket API for Galaxy DevKit',
        endpoints: {
          health: '/health',
          metrics: '/metrics',
          websocket: '/socket.io/'
        }
      });
    });

    // Error handling middleware
    this.app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      log.error({ err }, 'Express error');
      res.status(500).json({
        error: 'Internal server error',
        timestamp: Date.now()
      });
    });
  }

  /**
   * Setup HTTP server
   */
  private setupHttpServer(): void {
    this.httpServer = createServer(this.app);
  }

  /**
   * Setup Socket.IO server
   */
  private setupSocketIO(): void {
    this.io = new Server(this.httpServer, {
      cors: {
        origin: config.cors.allowedOrigins,
        credentials: config.cors.credentials,
        methods: ['GET', 'POST']
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
      maxHttpBufferSize: 1e6, // 1MB
      allowEIO3: true
    });

    // Apply authentication middleware
    this.io.use(authMiddleware);

    // Connection event logging
    this.io.on('connection', (socket) => {
      socketLogger(socket).info('Client connected');
    });

    // Error handling
    this.io.on('error', (error) => {
      log.error({ err: error }, 'Socket.IO error');
    });
  }

  /** Attach the cross-instance adapter when Redis is configured. */
  private async configureSharedAdapter(): Promise<void> {
    if (!config.redis.url) {
      log.warn('REDIS_URL is not configured; using the single-instance Socket.IO adapter');
      return;
    }
    const publisher = new Redis(config.redis.url, { lazyConnect: true, maxRetriesPerRequest: 3 });
    const subscriber = publisher.duplicate();
    try {
      await Promise.all([publisher.connect(), subscriber.connect()]);
      this.io.adapter(createAdapter(publisher, subscriber));
      this.redisClients = [publisher, subscriber];
      log.info('Socket.IO Redis adapter enabled for cross-instance rooms and broadcasts');
    } catch (error) {
      await Promise.allSettled([publisher.quit(), subscriber.quit()]);
      throw new Error(`Redis adapter initialization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Setup all handlers
   */
  private setupHandlers(): void {
    // Initialize services
    this.roomManager = new RoomManager(this.io);
    this.eventBroadcaster = new EventBroadcaster(this.io);

    // Initialize handlers
    this.connectionHandler = new ConnectionHandler(this.io, this.roomManager, this.eventBroadcaster);
    this.marketHandler = new MarketHandler(this.io, this.roomManager, this.eventBroadcaster, {
      horizonUrl: config.stellar.horizonUrl,
      network: config.stellar.network,
      maxStalenessMs: config.market.maxStalenessMs,
      pricePollIntervalMs: config.market.pricePollIntervalMs,
      orderbookPollIntervalMs: config.market.orderbookPollIntervalMs,
      tradePollIntervalMs: config.market.tradePollIntervalMs,
    });
    this.transactionHandler = new TransactionHandler(this.io, this.roomManager, this.eventBroadcaster);
    this.automationHandler = new AutomationHandler(this.io, this.roomManager, this.eventBroadcaster);
    this.transactionMonitoringHandler = new TransactionMonitoringHandler(this.io);

    log.info('All handlers initialized');
  }

  /**
   * Setup graceful shutdown
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) {
        log.info('Shutdown already in progress');
        return;
      }

      this.isShuttingDown = true;
      log.info({ signal }, 'Received signal, starting graceful shutdown');

      try {
        // Stop accepting new connections
        this.io.close();

        // Cleanup handlers
        this.connectionHandler.cleanup();
        this.marketHandler.shutdown();
        this.roomManager.destroy();
        this.eventBroadcaster.destroy();
        this.transactionHandler.cleanup();
        this.automationHandler.cleanup();
        await Promise.allSettled(this.redisClients.map((client) => client.quit()));
        this.redisClients = [];

        // Close HTTP server
        this.httpServer.close(() => {
          log.info('HTTP server closed');
          process.exit(0);
        });

        // Force exit after 30 seconds
        setTimeout(() => {
          log.error('Forced shutdown after timeout');
          process.exit(1);
        }, 30000);

      } catch (error) {
        log.error({ err: error }, 'Error during shutdown');
        process.exit(1);
      }
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // For nodemon

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      log.error({ err: error }, 'Uncaught exception');
      shutdown('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason) => {
      log.error({ err: reason }, 'Unhandled rejection');
      shutdown('unhandledRejection');
    });
  }

  /**
   * Start the server
   */
  public async start(): Promise<void> {
    try {
      // Validate configuration
      validateConfig();

      // Check production readiness
      if (config.server.environment === 'production' && !isProductionReady()) {
        throw new Error('Configuration is not production-ready');
      }

      await this.configureSharedAdapter();

      // Start HTTP server
      await new Promise<void>((resolve, reject) => {
        this.httpServer.listen(config.server.port, config.server.host, (error?: Error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      const baseUrl = `${config.server.host}:${config.server.port}`;
      log.info(
        {
          host: config.server.host,
          port: config.server.port,
          environment: config.server.environment,
          websocketEndpoint: `ws://${baseUrl}/socket.io/`,
          healthCheck: `http://${baseUrl}/health`,
          metrics: `http://${baseUrl}/metrics`,
        },
        'Galaxy WebSocket API Server started'
      );

      // Log configuration summary
      this.logConfigurationSummary();

    } catch (error) {
      log.error({ err: error }, 'Failed to start server');
      process.exit(1);
    }
  }

  /**
   * Get server statistics
   */
  public async getServerStats(): Promise<any> {
    const connectionStats = this.connectionHandler.getConnectionStats();
    const roomStats = this.roomManager.getAllRoomStats();
    const queueStats = this.eventBroadcaster.getQueueStats();
    const [automationStats, transactionStats] = await Promise.all([
      this.automationHandler.getAutomationStats(),
      this.transactionHandler.getTransactionStats(),
    ]);

    return {
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        environment: config.server.environment,
        version: process.env.npm_package_version || '1.0.0'
      },
      connections: {
        total: connectionStats.totalConnections,
        authenticated: connectionStats.authenticatedConnections,
        timeouts: connectionStats.connectionTimeouts,
        heartbeats: connectionStats.heartbeats
      },
      rooms: {
        total: roomStats.length,
        stats: roomStats
      },
      events: {
        queueSize: queueStats.queueSize,
        maxQueueSize: queueStats.maxQueueSize,
        oldestItem: queueStats.oldestItem
      },
      automations: automationStats,
      transactions: transactionStats,
      timestamp: Date.now()
    };
  }

  /**
   * Log configuration summary
   */
  private logConfigurationSummary(): void {
    log.info(
      {
        port: config.server.port,
        host: config.server.host,
        environment: config.server.environment,
        corsOrigins: config.cors.allowedOrigins,
        connectionTimeoutMs: config.connection.timeout,
        maxConnectionsPerUser: config.connection.maxConnectionsPerUser,
        heartbeatIntervalMs: config.connection.heartbeatInterval,
        logLevel: config.logging.level,
        supabaseUrl: config.supabase.url,
        stellarNetwork: config.stellar.network,
      },
      'Configuration summary'
    );
  }

  /**
   * Stop the server
   */
  public async stop(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    log.info('Stopping server...');

    try {
      // Close Socket.IO
      this.io.close();

      // Cleanup handlers
      this.connectionHandler.cleanup();
      this.marketHandler.shutdown();
      this.roomManager.destroy();
      this.eventBroadcaster.destroy();
      this.transactionHandler.cleanup();
      this.automationHandler.cleanup();

      // Close HTTP server
      await new Promise<void>((resolve) => {
        this.httpServer.close(() => {
          log.info('Server stopped');
          resolve();
        });
      });

    } catch (error) {
      log.error({ err: error }, 'Error stopping server');
      throw error;
    }
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  try {
    // Create and start server
    const server = new WebSocketServer();
    await server.start();

    // Keep process alive
    process.on('SIGINT', async () => {
      log.info('Received SIGINT, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });

  } catch (error) {
    log.error({ err: error }, 'Failed to start Galaxy WebSocket API Server');
    process.exit(1);
  }
}

// Start server if this file is run directly
if (require.main === module) {
  main().catch((error) => {
    log.error({ err: error }, 'Unhandled error in main');
    process.exit(1);
  });
}

export { WebSocketServer };
export * from './types/websocket-types';
export * from './config';
export * from './services/room-manager';
export * from './services/event-broadcaster';
export * from './handlers/connection-handler';
export * from './handlers/market-handler';
export * from './services/market-data-source';
export * from './handlers/transaction-handler';
export * from './handlers/automation-handler';
export * from './middleware/auth';
