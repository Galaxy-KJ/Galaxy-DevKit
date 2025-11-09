/**
 * @fileoverview Type definitions for REST API authentication system
 * @description Contains all interfaces and types related to authentication functionality
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

/**
 * Password strength levels
 */
export enum PasswordStrength {
  WEAK = 'weak',
  MEDIUM = 'medium',
  STRONG = 'strong',
  VERY_STRONG = 'very_strong',
}

/**
 * Authentication method types
 */
export type AuthMethod = 'jwt' | 'api_key';

/**
 * JWT payload structure
 */
export interface JWTPayload {
  userId: string;
  email: string;
  permissions: string[];
  iat?: number;
  exp?: number;
}

/**
 * User information from token
 */
export interface UserInfo {
  userId: string;
  email: string;
  permissions: string[];
}

/**
 * Authentication result
 */
export interface AuthResult {
  success: boolean;
  user?: UserInfo;
  token?: string;
  refreshToken?: string;
  sessionToken?: string;
  error?: string;
}

/**
 * Authentication validation result
 */
export interface AuthValidationResult {
  valid: boolean;
  user?: UserInfo;
  error?: string;
  authMethod?: AuthMethod;
}

/**
 * API key validation result
 */
export interface ApiKeyValidationResult {
  valid: boolean;
  apiKey?: ApiKey;
  user?: UserInfo;
  error?: string;
}

/**
 * API key structure
 */
export interface ApiKey {
  id: string;
  userId: string;
  keyPrefix: string;
  name: string;
  scopes: string[];
  rateLimit: number;
  lastUsedAt?: Date;
  expiresAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  metadata: Record<string, unknown>;
}

/**
 * API key creation request
 */
export interface CreateApiKeyRequest {
  name: string;
  scopes?: string[];
  rateLimit?: number;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * API key creation result
 */
export interface CreateApiKeyResult {
  apiKey: ApiKey;
  key: string; // Only returned once during creation
}

/**
 * Session structure
 */
export interface Session {
  id: string;
  userId: string;
  sessionToken: string;
  refreshToken: string;
  deviceInfo?: DeviceInfo;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: Date;
  refreshExpiresAt: Date;
  isActive: boolean;
  createdAt: Date;
  lastAccessedAt: Date;
}

/**
 * Session validation result
 */
export interface SessionValidationResult {
  valid: boolean;
  session?: Session;
  user?: UserInfo;
  error?: string;
}

/**
 * Device information
 */
export interface DeviceInfo {
  deviceId?: string;
  deviceName?: string;
  platform?: string;
  browser?: string;
  ipAddress?: string;
}

/**
 * Token pair (access and refresh tokens)
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
}

/**
 * User profile
 */
export interface UserProfile {
  id: string;
  email: string;
  permissions: string[];
  profileData?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User structure
 */
export interface User {
  id: string;
  email: string;
  permissions: string[];
  profileData: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Rate limit options
 */
export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
  message?: string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: Express.Request) => string;
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining?: number;
  resetTime?: Date;
  error?: string;
}

/**
 * Authentication error codes
 */
export enum AuthErrorCode {
  INVALID_TOKEN = 'INVALID_TOKEN',
  EXPIRED_TOKEN = 'EXPIRED_TOKEN',
  MISSING_TOKEN = 'MISSING_TOKEN',
  INVALID_API_KEY = 'INVALID_API_KEY',
  EXPIRED_API_KEY = 'EXPIRED_API_KEY',
  REVOKED_API_KEY = 'REVOKED_API_KEY',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  EMAIL_NOT_CONFIRMED = 'EMAIL_NOT_CONFIRMED',
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  SESSION_INVALID = 'SESSION_INVALID',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * Authentication error
 */
export class AuthenticationError extends Error {
  constructor(
    public code: AuthErrorCode,
    message: string,
    public statusCode: number = 401
  ) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

/**
 * Permission error
 */
export class PermissionError extends Error {
  constructor(
    public code: AuthErrorCode,
    message: string,
    public statusCode: number = 403
  ) {
    super(message);
    this.name = 'PermissionError';
  }
}

/**
 * Rate limit error
 */
export class RateLimitError extends Error {
  constructor(
    public code: AuthErrorCode,
    message: string,
    public resetTime?: Date,
    public statusCode: number = 429
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/**
 * Extended Express Request with authentication
 */
export interface AuthenticatedRequest extends Express.Request {
  user?: UserInfo;
  apiKey?: ApiKey;
  authMethod?: AuthMethod;
  permissions?: string[];
  session?: Session;
}

