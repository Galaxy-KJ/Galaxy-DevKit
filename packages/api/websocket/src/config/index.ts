/**
 * WebSocket Server Configuration
 * 
 * This module loads and validates environment variables,
 * providing a typed configuration object for the WebSocket server.
 */

/**
 * WebSocket Server Configuration Interface
 */
export interface WebSocketConfig {
  /** Server configuration */
  server: {
    /** Server port */
    port: number;
    /** Server host */
    host: string;
    /** Environment */
    environment: 'development' | 'staging' | 'production';
  };
  
  /** Supabase configuration */
  supabase: {
    /** Supabase URL */
    url: string;
    /** Supabase anonymous key */
    anonKey: string;
    /** Supabase service role key */
    serviceRoleKey: string;
  };
  
  /** Stellar configuration */
  stellar: {
    /** Stellar network */
    network: 'testnet' | 'mainnet';
    /** Stellar Horizon URL */
    horizonUrl: string;
  };
  
  /** CORS configuration */
  cors: {
    /** Allowed origins */
    allowedOrigins: string[];
    /** Whether credentials are allowed */
    credentials: boolean;
  };
  
  /** Connection configuration */
  connection: {
    /** Connection timeout in milliseconds */
    timeout: number;
    /** Maximum connections per user */
    maxConnectionsPerUser: number;
    /** Heartbeat interval in milliseconds */
    heartbeatInterval: number;
    /** Room cleanup interval in milliseconds */
    roomCleanupInterval: number;
  };
  
  /** Logging configuration */
  logging: {
    /** Log level */
    level: 'debug' | 'info' | 'warn' | 'error';
    /** Whether to log to console */
    console: boolean;
    /** Whether to log to file */
    file: boolean;
    /** Log file path */
    filePath?: string;
  };
}

/**
 * Load and validate environment variables
 */
function loadConfig(): WebSocketConfig {
  const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY'
  ];

  // Check for required environment variables
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required environment variable: ${envVar}`);
    }
  }

  // Parse allowed origins
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://localhost:3000',
    'https://localhost:3001'
  ];

  // Parse CORS credentials
  const corsCredentials = process.env.CORS_CREDENTIALS === 'true';

  // Parse connection limits
  const maxConnectionsPerUser = parseInt(process.env.MAX_CONNECTIONS_PER_USER || '5', 10);
  const connectionTimeout = parseInt(process.env.CONNECTION_TIMEOUT || '30000', 10);
  const heartbeatInterval = parseInt(process.env.HEARTBEAT_INTERVAL || '30000', 10);
  const roomCleanupInterval = parseInt(process.env.ROOM_CLEANUP_INTERVAL || '300000', 10);

  // Parse logging configuration
  const logLevel = (process.env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error';
  const logToConsole = process.env.LOG_CONSOLE !== 'false';
  const logToFile = process.env.LOG_FILE === 'true';
  const logFilePath = process.env.LOG_FILE_PATH;

  return {
    server: {
      port: parseInt(process.env.WEBSOCKET_PORT || '3001', 10),
      host: process.env.WEBSOCKET_HOST || '0.0.0.0',
      environment: (process.env.NODE_ENV || 'development') as 'development' | 'staging' | 'production'
    },
    supabase: {
      url: process.env.SUPABASE_URL!,
      anonKey: process.env.SUPABASE_ANON_KEY!,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!
    },
    stellar: {
      network: (process.env.STELLAR_NETWORK || 'testnet') as 'testnet' | 'mainnet',
      horizonUrl: process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org'
    },
    cors: {
      allowedOrigins,
      credentials: corsCredentials
    },
    connection: {
      timeout: connectionTimeout,
      maxConnectionsPerUser,
      heartbeatInterval,
      roomCleanupInterval
    },
    logging: {
      level: logLevel,
      console: logToConsole,
      file: logToFile,
      filePath: logFilePath
    }
  };
}

/**
 * Configuration singleton
 */
export const config = loadConfig();

/**
 * Validate configuration
 */
export function validateConfig(): void {
  // Validate port
  if (config.server.port < 1 || config.server.port > 65535) {
    throw new Error('Invalid port number. Must be between 1 and 65535.');
  }

  // Validate Supabase URL
  try {
    new URL(config.supabase.url);
  } catch {
    throw new Error('Invalid Supabase URL');
  }

  // Validate connection limits
  if (config.connection.maxConnectionsPerUser < 1) {
    throw new Error('maxConnectionsPerUser must be at least 1');
  }

  if (config.connection.timeout < 1000) {
    throw new Error('Connection timeout must be at least 1000ms');
  }

  // Validate heartbeat interval
  if (config.connection.heartbeatInterval < 5000) {
    throw new Error('Heartbeat interval must be at least 5000ms');
  }

  // Validate room cleanup interval
  if (config.connection.roomCleanupInterval < 60000) {
    throw new Error('Room cleanup interval must be at least 60000ms');
  }
}

/**
 * Get configuration for a specific environment
 */
export function getConfigForEnvironment(environment: string): Partial<WebSocketConfig> {
  const baseConfig = {
    development: {
      logging: {
        level: 'debug' as const,
        console: true,
        file: false
      },
      connection: {
        timeout: 30000,
        maxConnectionsPerUser: 10,
        heartbeatInterval: 30000,
        roomCleanupInterval: 300000
      }
    },
    staging: {
      logging: {
        level: 'info' as const,
        console: true,
        file: true
      },
      connection: {
        timeout: 20000,
        maxConnectionsPerUser: 5,
        heartbeatInterval: 25000,
        roomCleanupInterval: 300000
      }
    },
    production: {
      logging: {
        level: 'warn' as const,
        console: false,
        file: true
      },
      connection: {
        timeout: 15000,
        maxConnectionsPerUser: 3,
        heartbeatInterval: 20000,
        roomCleanupInterval: 300000
      }
    }
  };

  return baseConfig[environment as keyof typeof baseConfig] || baseConfig.development;
}

/**
 * Check if configuration is valid for production
 */
export function isProductionReady(): boolean {
  try {
    validateConfig();
    
    // Additional production checks
    if (config.server.environment === 'production') {
      if (config.cors.allowedOrigins.includes('*')) {
        throw new Error('Wildcard CORS origins not allowed in production');
      }
      
      if (config.connection.maxConnectionsPerUser > 10) {
        throw new Error('Too many connections per user for production');
      }
      
      if (config.logging.level === 'debug') {
        throw new Error('Debug logging not allowed in production');
      }
    }
    
    return true;
  } catch {
    return false;
  }
}
