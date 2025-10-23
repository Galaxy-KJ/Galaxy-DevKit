/**
 * Galaxy WebSocket API Server
 * 
 * This is the main entry point for the Galaxy WebSocket API server.
 * It initializes Express, Socket.IO, and all handlers for real-time communication.
 */

import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { config, validateConfig, isProductionReady } from './config';
import { RoomManager } from './services/room-manager';
import { EventBroadcaster } from './services/event-broadcaster';
import { ConnectionHandler } from './handlers/connection-handler';
import { MarketHandler } from './handlers/market-handler';
import { TransactionHandler } from './handlers/transaction-handler';
import { AutomationHandler } from './handlers/automation-handler';
import { authMiddleware } from './middleware/auth';

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
  private isShuttingDown = false;

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
    this.app.get('/metrics', (req, res) => {
      const stats = this.getServerStats();
      res.json(stats);
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
      console.error('Express error:', err);
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
      console.log(`Client connected: ${socket.id}`);
    });

    // Error handling
    this.io.on('error', (error) => {
      console.error('Socket.IO error:', error);
    });
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
    this.marketHandler = new MarketHandler(this.io, this.roomManager, this.eventBroadcaster);
    this.transactionHandler = new TransactionHandler(this.io, this.roomManager, this.eventBroadcaster);
    this.automationHandler = new AutomationHandler(this.io, this.roomManager, this.eventBroadcaster);

    console.log('All handlers initialized');
  }

  /**
   * Setup graceful shutdown
   */
  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) {
        console.log('Shutdown already in progress');
        return;
      }

      this.isShuttingDown = true;
      console.log(`Received ${signal}, starting graceful shutdown...`);

      try {
        // Stop accepting new connections
        this.io.close();

        // Cleanup handlers
        this.connectionHandler.cleanup();
        this.roomManager.destroy();
        this.eventBroadcaster.destroy();
        this.transactionHandler.cleanup();
        this.automationHandler.cleanup();

        // Close HTTP server
        this.httpServer.close(() => {
          console.log('HTTP server closed');
          process.exit(0);
        });

        // Force exit after 30 seconds
        setTimeout(() => {
          console.error('Forced shutdown after timeout');
          process.exit(1);
        }, 30000);

      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // For nodemon

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('Uncaught exception:', error);
      shutdown('uncaughtException');
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled rejection at:', promise, 'reason:', reason);
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

      console.log(`🚀 Galaxy WebSocket API Server started`);
      console.log(`📡 Server running on ${config.server.host}:${config.server.port}`);
      console.log(`🌍 Environment: ${config.server.environment}`);
      console.log(`🔗 WebSocket endpoint: ws://${config.server.host}:${config.server.port}/socket.io/`);
      console.log(`❤️  Health check: http://${config.server.host}:${config.server.port}/health`);
      console.log(`📊 Metrics: http://${config.server.host}:${config.server.port}/metrics`);

      // Log configuration summary
      this.logConfigurationSummary();

    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  /**
   * Get server statistics
   */
  public getServerStats(): any {
    const connectionStats = this.connectionHandler.getConnectionStats();
    const roomStats = this.roomManager.getAllRoomStats();
    const queueStats = this.eventBroadcaster.getQueueStats();
    const automationStats = this.automationHandler.getAutomationStats();
    const transactionStats = this.transactionHandler.getTransactionStats();

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
    console.log('\n📋 Configuration Summary:');
    console.log(`   Port: ${config.server.port}`);
    console.log(`   Host: ${config.server.host}`);
    console.log(`   Environment: ${config.server.environment}`);
    console.log(`   CORS Origins: ${config.cors.allowedOrigins.join(', ')}`);
    console.log(`   Connection Timeout: ${config.connection.timeout}ms`);
    console.log(`   Max Connections per User: ${config.connection.maxConnectionsPerUser}`);
    console.log(`   Heartbeat Interval: ${config.connection.heartbeatInterval}ms`);
    console.log(`   Log Level: ${config.logging.level}`);
    console.log(`   Supabase URL: ${config.supabase.url}`);
    console.log(`   Stellar Network: ${config.stellar.network}`);
    console.log('');
  }

  /**
   * Stop the server
   */
  public async stop(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;
    console.log('Stopping server...');

    try {
      // Close Socket.IO
      this.io.close();

      // Cleanup handlers
      this.connectionHandler.cleanup();
      this.roomManager.destroy();
      this.eventBroadcaster.destroy();
      this.transactionHandler.cleanup();
      this.automationHandler.cleanup();

      // Close HTTP server
      await new Promise<void>((resolve) => {
        this.httpServer.close(() => {
          console.log('Server stopped');
          resolve();
        });
      });

    } catch (error) {
      console.error('Error stopping server:', error);
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
      console.log('\nReceived SIGINT, shutting down gracefully...');
      await server.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error('Failed to start Galaxy WebSocket API Server:', error);
    process.exit(1);
  }
}

// Start server if this file is run directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error in main:', error);
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
export * from './handlers/transaction-handler';
export * from './handlers/automation-handler';
export * from './middleware/auth';
