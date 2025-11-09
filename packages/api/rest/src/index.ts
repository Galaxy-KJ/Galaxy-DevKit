/**
 * @fileoverview REST API Server
 * @description Main entry point for Galaxy REST API server
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

// Load environment variables from .env.local (if exists)
import { config } from 'dotenv';
import { resolve } from 'path';

// Try to load .env.local from project root
try {
  config({ path: resolve(__dirname, '../../../../.env.local') });
} catch (error) {
  // Ignore if .env.local doesn't exist
}

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { rateLimiterMiddleware } from './middleware/rate-limiter';
import { validateAuthConfig } from './config/auth-config';
import { authenticate } from './middleware/auth';
import { AuthService } from './services/auth-service';
import { UserService } from './services/user-service';

/**
 * REST API Server Class
 */
class RestApiServer {
  private app: express.Application;
  private port: number;
  private host: string;

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.PORT || '3000', 10);
    this.host = process.env.HOST || '0.0.0.0';

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Setup middleware
   */
  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet());

    // CORS middleware
    this.app.use(
      cors({
        origin: process.env.CORS_ORIGIN?.split(',') || '*',
        credentials: true,
      })
    );

    // Compression middleware
    this.app.use(compression());

    // Body parsing middleware
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Logging middleware
    if (process.env.NODE_ENV !== 'test') {
      this.app.use(morgan('combined'));
    }

    // Rate limiting middleware (applied to all routes)
    this.app.use(rateLimiterMiddleware());

    // Request ID middleware (for tracing)
    this.app.use((req, res, next) => {
      req.headers['x-request-id'] =
        req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      next();
    });
  }

  /**
   * Setup routes
   */
  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
      });
    });

    // API info endpoint
    this.app.get('/', (req, res) => {
      res.json({
        name: 'Galaxy REST API',
        version: process.env.npm_package_version || '1.0.0',
        description: 'REST API for Galaxy DevKit',
        endpoints: {
          health: '/health',
          api: '/api/v1',
        },
      });
    });

    // API v1 routes
    this.app.use('/api/v1', this.setupApiRoutes());
  }

  /**
   * Setup API routes
   */
  private setupApiRoutes(): express.Router {
    const router = express.Router();

    // Authentication routes
    router.use('/auth', this.setupAuthRoutes());

    // API key routes
    router.use('/api-keys', this.setupApiKeyRoutes());

    // User routes
    router.use('/users', this.setupUserRoutes());

    // Add more routes here as needed

    return router;
  }

  /**
   * Setup authentication routes
   */
  private setupAuthRoutes(): express.Router {
    const router = express.Router();
    const authService = new AuthService();

    // Login endpoint
    router.post('/login', async (req, res, next) => {
      try {
        const { email, password } = req.body;

        if (!email || !password) {
          res.status(400).json({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Email and password are required',
              details: {},
            },
          });
          return;
        }

        const result = await authService.authenticateUser(email, password);

        if (!result.success) {
          res.status(401).json({
            error: {
              code: 'AUTH_ERROR',
              message: result.error || 'Authentication failed',
              details: {},
            },
          });
          return;
        }

        res.json({
          user: result.user,
          token: result.token,
          refreshToken: result.refreshToken,
          sessionToken: result.sessionToken,
        });
      } catch (error) {
        next(error);
      }
    });

    // Refresh token endpoint
    router.post('/refresh', async (req, res, next) => {
      try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
          res.status(400).json({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Refresh token is required',
              details: {},
            },
          });
          return;
        }

        const tokenPair = await authService.refreshToken(refreshToken);

        res.json(tokenPair);
      } catch (error) {
        next(error);
      }
    });

    // Logout endpoint
    router.post('/logout', authenticate(), async (req, res, next) => {
      try {
        const sessionToken = req.headers['x-session-token'] as string;

        if (sessionToken) {
          await authService.logout(sessionToken);
        }

        res.json({
          message: 'Logged out successfully',
        });
      } catch (error) {
        next(error);
      }
    });

    return router;
  }

  /**
   * Setup API key routes
   */
  private setupApiKeyRoutes(): express.Router {
    const router = express.Router();
    const authService = new AuthService();

    // All API key routes require authentication
    router.use(authenticate());

    // Create API key
    router.post('/', async (req, res, next) => {
      try {
        if (!req.user) {
          res.status(401).json({
            error: {
              code: 'AUTH_ERROR',
              message: 'Authentication required',
              details: {},
            },
          });
          return;
        }

        const { name, scopes, rateLimit, expiresAt, metadata } = req.body;

        if (!name) {
          res.status(400).json({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'API key name is required',
              details: {},
            },
          });
          return;
        }

        const result = await authService.createApiKey(req.user.userId, {
          name,
          scopes,
          rateLimit,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined,
          metadata,
        });

        res.status(201).json({
          apiKey: {
            id: result.apiKey.id,
            name: result.apiKey.name,
            keyPrefix: result.apiKey.keyPrefix,
            scopes: result.apiKey.scopes,
            rateLimit: result.apiKey.rateLimit,
            expiresAt: result.apiKey.expiresAt,
            createdAt: result.apiKey.createdAt,
          },
          key: result.key, // Only returned once
        });
      } catch (error) {
        next(error);
      }
    });

    // List API keys
    router.get('/', async (req, res, next) => {
      try {
        // This would require additional service method to list API keys
        // For now, return a placeholder
        res.json({
          message: 'List API keys endpoint - to be implemented',
        });
      } catch (error) {
        next(error);
      }
    });

    return router;
  }

  /**
   * Setup user routes
   */
  private setupUserRoutes(): express.Router {
    const router = express.Router();
    const userService = new UserService();

    // Get current user profile
    router.get('/me', authenticate(), async (req, res, next) => {
      try {
        if (!req.user) {
          res.status(401).json({
            error: {
              code: 'AUTH_ERROR',
              message: 'Authentication required',
              details: {},
            },
          });
          return;
        }

        const user = await userService.getUserById(req.user.userId);

        if (!user) {
          res.status(404).json({
            error: {
              code: 'USER_NOT_FOUND',
              message: 'User not found',
              details: {},
            },
          });
          return;
        }

        res.json(user);
      } catch (error) {
        next(error);
      }
    });

    // Update user profile
    router.put('/me', authenticate(), async (req, res, next) => {
      try {
        if (!req.user) {
          res.status(401).json({
            error: {
              code: 'AUTH_ERROR',
              message: 'Authentication required',
              details: {},
            },
          });
          return;
        }

        const { profileData } = req.body;

        const user = await userService.updateUserProfile(
          req.user.userId,
          { profileData }
        );

        res.json(user);
      } catch (error) {
        next(error);
      }
    });

    return router;
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    // 404 handler
    this.app.use(notFoundHandler);

    // Error handler
    this.app.use(errorHandler);
  }

  /**
   * Start server
   */
  public async start(): Promise<void> {
    try {
      // Validate configuration
      validateAuthConfig();

      // Start server
      this.app.listen(this.port, this.host, () => {
        console.log(`🚀 Galaxy REST API Server started`);
        console.log(`📡 Server running on ${this.host}:${this.port}`);
        console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`❤️  Health check: http://${this.host}:${this.port}/health`);
      });
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  /**
   * Stop server
   */
  public async stop(): Promise<void> {
    console.log('Stopping server...');
    process.exit(0);
  }
}

/**
 * Main function
 */
async function main(): Promise<void> {
  try {
    const server = new RestApiServer();
    await server.start();

    // Handle shutdown signals
    process.on('SIGTERM', async () => {
      console.log('\nReceived SIGTERM, shutting down gracefully...');
      await server.stop();
    });

    process.on('SIGINT', async () => {
      console.log('\nReceived SIGINT, shutting down gracefully...');
      await server.stop();
    });
  } catch (error) {
    console.error('Failed to start Galaxy REST API Server:', error);
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

export { RestApiServer };
export * from './middleware/auth';
export * from './middleware/api-key';
export * from './middleware/rate-limiter';
export * from './services/auth-service';
export * from './services/user-service';
export * from './services/session-service';
export * from './types/auth-types';

