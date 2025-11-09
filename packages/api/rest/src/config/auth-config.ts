/**
 * @fileoverview Authentication configuration
 * @description Loads and validates authentication-related environment variables
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

/**
 * Authentication configuration interface
 */
export interface AuthConfig {
  /** JWT configuration */
  jwt: {
    /** JWT secret (for custom JWT signing, if needed) */
    secret: string;
    /** JWT token expiry in seconds */
    expiry: number;
    /** JWT refresh token expiry in seconds */
    refreshExpiry: number;
  };

  /** API key configuration */
  apiKey: {
    /** API key length in bytes */
    length: number;
    /** API key prefix length for display */
    prefixLength: number;
  };

  /** Rate limiting configuration */
  rateLimit: {
    /** Rate limit window in milliseconds */
    windowMs: number;
    /** Maximum requests per window for users */
    maxRequests: number;
    /** Maximum requests per window for API keys */
    apiKeyMaxRequests: number;
    /** Maximum requests per window for IP-based */
    ipMaxRequests: number;
  };

  /** Session configuration */
  session: {
    /** Session expiry in seconds */
    expiry: number;
    /** Session refresh expiry in seconds */
    refreshExpiry: number;
    /** Session cleanup interval in milliseconds */
    cleanupInterval: number;
  };

  /** Security configuration */
  security: {
    /** Bcrypt salt rounds */
    bcryptRounds: number;
    /** Minimum password length */
    passwordMinLength: number;
  };
}

/**
 * Load authentication configuration from environment variables
 * @returns AuthConfig - Authentication configuration
 */
function loadAuthConfig(): AuthConfig {
  return {
    jwt: {
      secret: process.env.JWT_SECRET || 'your-jwt-secret-change-in-production',
      expiry: parseInt(process.env.JWT_EXPIRY || '3600', 10), // 1 hour
      refreshExpiry: parseInt(process.env.JWT_REFRESH_EXPIRY || '604800', 10), // 7 days
    },
    apiKey: {
      length: parseInt(process.env.API_KEY_LENGTH || '32', 10),
      prefixLength: parseInt(process.env.API_KEY_PREFIX_LENGTH || '8', 10),
    },
    rateLimit: {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
      apiKeyMaxRequests: parseInt(process.env.RATE_LIMIT_API_KEY_MAX || '1000', 10),
      ipMaxRequests: parseInt(process.env.RATE_LIMIT_IP_MAX || '20', 10),
    },
    session: {
      expiry: parseInt(process.env.SESSION_EXPIRY || '3600', 10), // 1 hour
      refreshExpiry: parseInt(process.env.SESSION_REFRESH_EXPIRY || '604800', 10), // 7 days
      cleanupInterval: parseInt(process.env.SESSION_CLEANUP_INTERVAL || '3600000', 10), // 1 hour
    },
    security: {
      bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '12', 10),
      passwordMinLength: parseInt(process.env.PASSWORD_MIN_LENGTH || '8', 10),
    },
  };
}

/**
 * Authentication configuration singleton
 */
export const authConfig = loadAuthConfig();

/**
 * Validate authentication configuration
 * @throws Error - If configuration is invalid
 */
export function validateAuthConfig(): void {
  // Validate JWT configuration
  if (authConfig.jwt.secret === 'your-jwt-secret-change-in-production' && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production environment');
  }

  // Validate JWT expiry is a finite number
  if (typeof authConfig.jwt.expiry !== 'number' || !Number.isFinite(authConfig.jwt.expiry)) {
    throw new Error('JWT_EXPIRY must be a valid finite number');
  }

  if (authConfig.jwt.expiry < 60) {
    throw new Error('JWT_EXPIRY must be at least 60 seconds');
  }

  // Validate JWT refresh expiry is a finite number
  if (typeof authConfig.jwt.refreshExpiry !== 'number' || !Number.isFinite(authConfig.jwt.refreshExpiry)) {
    throw new Error('JWT_REFRESH_EXPIRY must be a valid finite number');
  }

  if (authConfig.jwt.refreshExpiry < authConfig.jwt.expiry) {
    throw new Error('JWT_REFRESH_EXPIRY must be greater than JWT_EXPIRY');
  }

  // Validate API key configuration
  // Validate API key length is a finite number
  if (typeof authConfig.apiKey.length !== 'number' || !Number.isFinite(authConfig.apiKey.length)) {
    throw new Error('API_KEY_LENGTH must be a valid finite number');
  }

  if (authConfig.apiKey.length < 16) {
    throw new Error('API_KEY_LENGTH must be at least 16 bytes');
  }

  // Validate API key prefix length is a finite number
  if (typeof authConfig.apiKey.prefixLength !== 'number' || !Number.isFinite(authConfig.apiKey.prefixLength)) {
    throw new Error('API_KEY_PREFIX_LENGTH must be a valid finite number');
  }

  if (authConfig.apiKey.prefixLength < 4 || authConfig.apiKey.prefixLength > authConfig.apiKey.length) {
    throw new Error('API_KEY_PREFIX_LENGTH must be between 4 and API_KEY_LENGTH');
  }

  // Validate rate limiting configuration
  // Validate rate limit window is a finite number
  if (typeof authConfig.rateLimit.windowMs !== 'number' || !Number.isFinite(authConfig.rateLimit.windowMs)) {
    throw new Error('RATE_LIMIT_WINDOW_MS must be a valid finite number');
  }

  if (authConfig.rateLimit.windowMs < 60000) {
    throw new Error('RATE_LIMIT_WINDOW_MS must be at least 60000 milliseconds (1 minute)');
  }

  // Validate rate limit max requests is a finite number
  if (typeof authConfig.rateLimit.maxRequests !== 'number' || !Number.isFinite(authConfig.rateLimit.maxRequests)) {
    throw new Error('RATE_LIMIT_MAX_REQUESTS must be a valid finite number');
  }

  if (authConfig.rateLimit.maxRequests < 1) {
    throw new Error('RATE_LIMIT_MAX_REQUESTS must be at least 1');
  }

  // Validate session configuration
  // Validate session expiry is a finite number
  if (typeof authConfig.session.expiry !== 'number' || !Number.isFinite(authConfig.session.expiry)) {
    throw new Error('SESSION_EXPIRY must be a valid finite number');
  }

  if (authConfig.session.expiry < 60) {
    throw new Error('SESSION_EXPIRY must be at least 60 seconds');
  }

  // Validate session refresh expiry is a finite number
  if (typeof authConfig.session.refreshExpiry !== 'number' || !Number.isFinite(authConfig.session.refreshExpiry)) {
    throw new Error('SESSION_REFRESH_EXPIRY must be a valid finite number');
  }

  if (authConfig.session.refreshExpiry < authConfig.session.expiry) {
    throw new Error('SESSION_REFRESH_EXPIRY must be greater than SESSION_EXPIRY');
  }

  // Validate security configuration
  // Validate bcrypt rounds is a finite number
  if (typeof authConfig.security.bcryptRounds !== 'number' || !Number.isFinite(authConfig.security.bcryptRounds)) {
    throw new Error('BCRYPT_ROUNDS must be a valid finite number');
  }

  if (authConfig.security.bcryptRounds < 10 || authConfig.security.bcryptRounds > 15) {
    throw new Error('BCRYPT_ROUNDS must be between 10 and 15');
  }

  // Validate password min length is a finite number
  if (typeof authConfig.security.passwordMinLength !== 'number' || !Number.isFinite(authConfig.security.passwordMinLength)) {
    throw new Error('PASSWORD_MIN_LENGTH must be a valid finite number');
  }

  if (authConfig.security.passwordMinLength < 8) {
    throw new Error('PASSWORD_MIN_LENGTH must be at least 8');
  }
}

