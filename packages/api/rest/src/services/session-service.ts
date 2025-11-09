/**
 * @fileoverview Session service for session management
 * @description Handles session creation, validation, refresh, and revocation
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  Session,
  SessionValidationResult,
  DeviceInfo,
  AuthenticationError,
  AuthErrorCode,
} from '../types/auth-types';
import {
  generateSessionToken,
  generateRefreshToken,
} from '../utils/password-utils';
import { authConfig } from '../config/auth-config';

/**
 * Supabase client instance
 */
let supabaseClient: SupabaseClient | null = null;

/**
 * Initialize Supabase client
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

    // Use service role key for session management (bypasses RLS)
    supabaseClient = createClient(supabaseURL, supabaseServiceRoleKey);
  }
  return supabaseClient;
}

/**
 * Session Service Class
 */
export class SessionService {
  private supabase: SupabaseClient;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.supabase = initializeSupabaseClient();
    this.startCleanupInterval();
  }

  /**
   * Create a new session
   * @param userId - User ID
   * @param deviceInfo - Device information
   * @param ipAddress - IP address
   * @param userAgent - User agent string
   * @returns Promise<Session> - Created session
   */
  async createSession(
    userId: string,
    deviceInfo?: DeviceInfo,
    ipAddress?: string,
    userAgent?: string
  ): Promise<Session> {
    try {
      const sessionToken = generateSessionToken();
      const refreshToken = generateRefreshToken();
      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + authConfig.session.expiry * 1000
      );
      const refreshExpiresAt = new Date(
        now.getTime() + authConfig.session.refreshExpiry * 1000
      );

      const session: Session = {
        id: '',
        userId,
        sessionToken,
        refreshToken,
        deviceInfo,
        ipAddress,
        userAgent,
        expiresAt,
        refreshExpiresAt,
        isActive: true,
        createdAt: now,
        lastAccessedAt: now,
      };

      const { data, error } = await this.supabase
        .from('api_sessions')
        .insert([
          {
            user_id: userId,
            session_token: sessionToken,
            refresh_token: refreshToken,
            device_info: deviceInfo || {},
            ip_address: ipAddress,
            user_agent: userAgent,
            expires_at: expiresAt.toISOString(),
            refresh_expires_at: refreshExpiresAt.toISOString(),
            is_active: true,
            created_at: now.toISOString(),
            last_accessed_at: now.toISOString(),
          },
        ])
        .select()
        .single();

      if (error || !data) {
        throw new AuthenticationError(
          AuthErrorCode.SESSION_INVALID,
          `Failed to create session: ${error?.message || 'Unknown error'}`,
          500
        );
      }

      session.id = data.id;
      return session;
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }

      throw new AuthenticationError(
        AuthErrorCode.SESSION_INVALID,
        `Failed to create session: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }

  /**
   * Validate a session
   * @param sessionToken - Session token
   * @returns Promise<SessionValidationResult> - Validation result
   */
  async validateSession(sessionToken: string): Promise<SessionValidationResult> {
    try {
      if (!sessionToken) {
        return {
          valid: false,
          error: 'Session token is required',
        };
      }

      const { data, error } = await this.supabase
        .from('api_sessions')
        .select('*')
        .eq('session_token', sessionToken)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        return {
          valid: false,
          error: 'Invalid session token',
        };
      }

      // Check if session is expired
      const expiresAt = new Date(data.expires_at);
      if (expiresAt < new Date()) {
        // Mark session as inactive
        await this.supabase
          .from('api_sessions')
          .update({ is_active: false })
          .eq('id', data.id);

        return {
          valid: false,
          error: 'Session expired',
        };
      }

      // Update last accessed time
      await this.supabase
        .from('api_sessions')
        .update({ last_accessed_at: new Date().toISOString() })
        .eq('id', data.id);

      const session = this.mapDatabaseToSession(data);

      return {
        valid: true,
        session,
      };
    } catch (error) {
      console.error('Session validation error:', error);
      return {
        valid: false,
        error: `Session validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Refresh a session
   * @param refreshToken - Refresh token
   * @returns Promise<Session> - Refreshed session
   * @throws AuthenticationError - If refresh token is invalid or expired
   */
  async refreshSession(refreshToken: string): Promise<Session> {
    try {
      if (!refreshToken) {
        throw new AuthenticationError(
          AuthErrorCode.SESSION_INVALID,
          'Refresh token is required',
          401
        );
      }

      const { data, error } = await this.supabase
        .from('api_sessions')
        .select('*')
        .eq('refresh_token', refreshToken)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        throw new AuthenticationError(
          AuthErrorCode.SESSION_INVALID,
          'Invalid refresh token',
          401
        );
      }

      // Check if refresh token is expired
      const refreshExpiresAt = new Date(data.refresh_expires_at);
      if (refreshExpiresAt < new Date()) {
        // Mark session as inactive
        await this.supabase
          .from('api_sessions')
          .update({ is_active: false })
          .eq('id', data.id);

        throw new AuthenticationError(
          AuthErrorCode.SESSION_EXPIRED,
          'Refresh token expired',
          401
        );
      }

      // Generate new session token and update expiry
      const newSessionToken = generateSessionToken();
      const now = new Date();
      const expiresAt = new Date(
        now.getTime() + authConfig.session.expiry * 1000
      );

      const { data: updatedSession, error: updateError } = await this.supabase
        .from('api_sessions')
        .update({
          session_token: newSessionToken,
          expires_at: expiresAt.toISOString(),
          last_accessed_at: now.toISOString(),
        })
        .eq('id', data.id)
        .select()
        .single();

      if (updateError || !updatedSession) {
        throw new AuthenticationError(
          AuthErrorCode.SESSION_INVALID,
          `Failed to refresh session: ${updateError?.message || 'Unknown error'}`,
          500
        );
      }

      return this.mapDatabaseToSession(updatedSession);
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }

      throw new AuthenticationError(
        AuthErrorCode.SESSION_INVALID,
        `Failed to refresh session: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }

  /**
   * Revoke a session
   * @param sessionToken - Session token to revoke
   * @returns Promise<void>
   */
  async revokeSession(sessionToken: string): Promise<void> {
    try {
      await this.supabase
        .from('api_sessions')
        .update({ is_active: false })
        .eq('session_token', sessionToken);
    } catch (error) {
      console.error('Failed to revoke session:', error);
      // Don't throw error, just log it
    }
  }

  /**
   * Revoke all sessions for a user
   * @param userId - User ID
   * @returns Promise<void>
   */
  async revokeAllUserSessions(userId: string): Promise<void> {
    try {
      await this.supabase
        .from('api_sessions')
        .update({ is_active: false })
        .eq('user_id', userId)
        .eq('is_active', true);
    } catch (error) {
      console.error('Failed to revoke user sessions:', error);
      // Don't throw error, just log it
    }
  }

  /**
   * Get all active sessions for a user
   * @param userId - User ID
   * @returns Promise<Session[]> - Array of sessions
   */
  async getUserSessions(userId: string): Promise<Session[]> {
    try {
      const { data, error } = await this.supabase
        .from('api_sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error || !data) {
        return [];
      }

      return data.map((session) => this.mapDatabaseToSession(session));
    } catch (error) {
      console.error('Failed to get user sessions:', error);
      return [];
    }
  }

  /**
   * Cleanup expired sessions
   * @returns Promise<number> - Number of sessions cleaned up
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const now = new Date().toISOString();

      const { data, error } = await this.supabase
        .from('api_sessions')
        .update({ is_active: false })
        .lt('expires_at', now)
        .eq('is_active', true)
        .select();

      if (error) {
        console.error('Failed to cleanup expired sessions:', error);
        return 0;
      }

      return data?.length || 0;
    } catch (error) {
      console.error('Failed to cleanup expired sessions:', error);
      return 0;
    }
  }

  /**
   * Start cleanup interval
   */
  private startCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredSessions().catch((error) => {
        console.error('Session cleanup error:', error);
      });
    }, authConfig.session.cleanupInterval);
  }

  /**
   * Stop cleanup interval
   */
  public stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Map database record to Session object
   * @param data - Database record
   * @returns Session - Session object
   */
  private mapDatabaseToSession(data: any): Session {
    return {
      id: data.id,
      userId: data.user_id,
      sessionToken: data.session_token,
      refreshToken: data.refresh_token,
      deviceInfo: (data.device_info as DeviceInfo) || {},
      ipAddress: data.ip_address,
      userAgent: data.user_agent,
      expiresAt: new Date(data.expires_at),
      refreshExpiresAt: new Date(data.refresh_expires_at),
      isActive: data.is_active,
      createdAt: new Date(data.created_at),
      lastAccessedAt: new Date(data.last_accessed_at),
    };
  }
}

