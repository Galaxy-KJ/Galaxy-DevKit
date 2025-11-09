/**
 * @fileoverview Main authentication service
 * @description Orchestrates authentication, coordinates between JWT and API key auth
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  AuthResult,
  AuthValidationResult,
  ApiKeyValidationResult,
  TokenPair,
  UserInfo,
  ApiKey,
  CreateApiKeyRequest,
  CreateApiKeyResult,
  AuthenticationError,
  AuthErrorCode,
} from '../types/auth-types';
import { validateJWT } from '../utils/jwt-utils';
import {
  generateApiKey,
  hashApiKey,
  getApiKeyPrefix,
  hashPassword,
  verifyPassword,
} from '../utils/password-utils';
import { SessionService } from './session-service';
import { UserService } from './user-service';
import { authConfig } from '../config/auth-config';

/**
 * Supabase client instance (with service role for API key operations)
 */
let supabaseClient: SupabaseClient | null = null;

/**
 * Initialize Supabase client with service role
 */
function initializeSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    const supabaseURL = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseURL || !supabaseServiceRoleKey) {
      throw new Error(
        'Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set'
      );
    }

    // Use service role key for API key operations (bypasses RLS)
    supabaseClient = createClient(supabaseURL, supabaseServiceRoleKey);
  }
  return supabaseClient;
}

/**
 * Authentication Service Class
 */
export class AuthService {
  private supabase: SupabaseClient;
  private sessionService: SessionService;
  private userService: UserService;

  constructor() {
    this.supabase = initializeSupabaseClient();
    this.sessionService = new SessionService();
    this.userService = new UserService();
  }

  /**
   * Authenticate user with email and password
   * @param email - User email
   * @param password - User password
   * @returns Promise<AuthResult> - Authentication result
   */
  async authenticateUser(email: string, password: string): Promise<AuthResult> {
    try {
      // Use Supabase Auth to sign in
      const supabaseAnon = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_ANON_KEY!
      );

      const { data, error } = await supabaseAnon.auth.signInWithPassword({
        email,
        password,
      });

      if (error || !data.user) {
        return {
          success: false,
          error: 'Invalid email or password',
        };
      }

      // Check if email is confirmed
      if (!data.user.email_confirmed_at) {
        return {
          success: false,
          error: 'Email not confirmed. Please confirm your email address.',
        };
      }

      // Get user permissions
      const permissions = await this.userService.getUserPermissions(data.user.id);

      const userInfo: UserInfo = {
        userId: data.user.id,
        email: data.user.email || '',
        permissions,
      };

      // Create session
      const session = await this.sessionService.createSession(
        data.user.id,
        undefined,
        undefined,
        undefined
      );

      return {
        success: true,
        user: userInfo,
        token: data.session?.access_token,
        refreshToken: data.session?.refresh_token,
        sessionToken: session.sessionToken,
      };
    } catch (error) {
      return {
        success: false,
        error: `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Validate authentication token (JWT)
   * @param token - JWT token
   * @returns Promise<AuthValidationResult> - Validation result
   */
  async validateAuthToken(token: string): Promise<AuthValidationResult> {
    try {
      const userInfo = await validateJWT(token);

      return {
        valid: true,
        user: userInfo,
        authMethod: 'jwt',
      };
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return {
          valid: false,
          error: error.message,
          authMethod: 'jwt',
        };
      }

      return {
        valid: false,
        error: `Token validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        authMethod: 'jwt',
      };
    }
  }

  /**
   * Validate API key
   * @param apiKey - API key
   * @returns Promise<ApiKeyValidationResult> - Validation result
   */
  async validateApiKey(apiKey: string): Promise<ApiKeyValidationResult> {
    try {
      if (!apiKey) {
        return {
          valid: false,
          error: 'API key is required',
        };
      }

      const keyHash = hashApiKey(apiKey);

      // Query API key from database
      const { data, error } = await this.supabase
        .from('api_keys')
        .select('*')
        .eq('key_hash', keyHash)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        return {
          valid: false,
          error: 'Invalid API key',
        };
      }

      // Check if API key is expired
      if (data.expires_at) {
        const expiresAt = new Date(data.expires_at);
        if (expiresAt < new Date()) {
          // Mark API key as inactive
          await this.supabase
            .from('api_keys')
            .update({ is_active: false })
            .eq('id', data.id);

          return {
            valid: false,
            error: 'API key expired',
          };
        }
      }

      // Update last used timestamp
      await this.supabase
        .from('api_keys')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', data.id);

      // Get user permissions
      const permissions = await this.userService.getUserPermissions(data.user_id);

      const apiKeyObj: ApiKey = {
        id: data.id,
        userId: data.user_id,
        keyPrefix: data.key_prefix,
        name: data.name,
        scopes: (data.scopes as string[]) || [],
        rateLimit: data.rate_limit || 1000,
        lastUsedAt: data.last_used_at ? new Date(data.last_used_at) : undefined,
        expiresAt: data.expires_at ? new Date(data.expires_at) : undefined,
        isActive: data.is_active,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
        metadata: (data.metadata as Record<string, unknown>) || {},
      };

      const userInfo: UserInfo = {
        userId: data.user_id,
        email: '', // API keys don't need email
        permissions: (data.scopes as string[]) || [],
      };

      return {
        valid: true,
        apiKey: apiKeyObj,
        user: userInfo,
      };
    } catch (error) {
      console.error('API key validation error:', error);
      return {
        valid: false,
        error: `API key validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Create API key
   * @param userId - User ID
   * @param request - API key creation request
   * @returns Promise<CreateApiKeyResult> - Created API key (with plain key returned once)
   */
  async createApiKey(
    userId: string,
    request: CreateApiKeyRequest
  ): Promise<CreateApiKeyResult> {
    try {
      // Generate API key
      const apiKey = generateApiKey();
      const keyHash = hashApiKey(apiKey);
      const keyPrefix = getApiKeyPrefix(apiKey);

      const now = new Date();

      const { data, error } = await this.supabase
        .from('api_keys')
        .insert([
          {
            user_id: userId,
            key_hash: keyHash,
            key_prefix: keyPrefix,
            name: request.name,
            scopes: request.scopes || [],
            rate_limit: request.rateLimit || 1000,
            expires_at: request.expiresAt?.toISOString() || null,
            is_active: true,
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
            metadata: request.metadata || {},
          },
        ])
        .select()
        .single();

      if (error || !data) {
        throw new AuthenticationError(
          AuthErrorCode.INVALID_API_KEY,
          `Failed to create API key: ${error?.message || 'Unknown error'}`,
          500
        );
      }

      const apiKeyObj: ApiKey = {
        id: data.id,
        userId: data.user_id,
        keyPrefix: data.key_prefix,
        name: data.name,
        scopes: (data.scopes as string[]) || [],
        rateLimit: data.rate_limit || 1000,
        expiresAt: data.expires_at ? new Date(data.expires_at) : undefined,
        isActive: data.is_active,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
        metadata: (data.metadata as Record<string, unknown>) || {},
      };

      return {
        apiKey: apiKeyObj,
        key: apiKey, // Return plain key only once
      };
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }

      throw new AuthenticationError(
        AuthErrorCode.INVALID_API_KEY,
        `Failed to create API key: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }

  /**
   * Refresh token
   * @param refreshToken - Refresh token
   * @returns Promise<TokenPair> - New token pair
   */
  async refreshToken(refreshToken: string): Promise<TokenPair> {
    try {
      // Use Supabase Auth to refresh token
      const supabaseAnon = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_ANON_KEY!
      );

      const { data, error } = await supabaseAnon.auth.refreshSession({
        refresh_token: refreshToken,
      });

      if (error || !data.session) {
        throw new AuthenticationError(
          AuthErrorCode.EXPIRED_TOKEN,
          'Failed to refresh token',
          401
        );
      }

      return {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresIn: authConfig.jwt.expiry,
        refreshExpiresIn: authConfig.jwt.refreshExpiry,
      };
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }

      throw new AuthenticationError(
        AuthErrorCode.EXPIRED_TOKEN,
        `Failed to refresh token: ${error instanceof Error ? error.message : 'Unknown error'}`,
        401
      );
    }
  }

  /**
   * Logout (revoke session)
   * @param sessionToken - Session token
   * @returns Promise<void>
   */
  async logout(sessionToken: string): Promise<void> {
    await this.sessionService.revokeSession(sessionToken);
  }

  /**
   * Check if user has permission
   * @param userId - User ID
   * @param permission - Permission to check
   * @returns Promise<boolean> - Whether user has permission
   */
  async checkPermission(userId: string, permission: string): Promise<boolean> {
    return this.userService.hasPermission(userId, permission);
  }

  /**
   * Get user sessions
   * @param userId - User ID
   * @returns Promise<Session[]> - Array of sessions
   */
  async getUserSessions(userId: string) {
    return this.sessionService.getUserSessions(userId);
  }

  /**
   * Revoke all user sessions
   * @param userId - User ID
   * @returns Promise<void>
   */
  async revokeAllUserSessions(userId: string): Promise<void> {
    await this.sessionService.revokeAllUserSessions(userId);
  }
}

