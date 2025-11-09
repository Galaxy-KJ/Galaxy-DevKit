/**
 * @fileoverview JWT token utilities for authentication
 * @description Provides JWT token validation and user information extraction using Supabase
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { JWTPayload, UserInfo, AuthenticationError, AuthErrorCode } from '../types/auth-types';

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
    const supabaseANON = process.env.SUPABASE_ANON_KEY;

    if (!supabaseURL || !supabaseANON) {
      throw new Error(
        'Missing required environment variables: SUPABASE_URL and SUPABASE_ANON_KEY must be set'
      );
    }

    supabaseClient = createClient(supabaseURL, supabaseANON);
  }
  return supabaseClient;
}

/**
 * Validate JWT token and extract user information
 * @param token - JWT token to validate
 * @returns Promise<UserInfo> - User information from token
 * @throws AuthenticationError - If token is invalid or expired
 */
export async function validateJWT(token: string): Promise<UserInfo> {
  if (!token) {
    throw new AuthenticationError(
      AuthErrorCode.MISSING_TOKEN,
      'JWT token is required',
      401
    );
  }

  try {
    const supabase = initializeSupabaseClient();

    // Verify the JWT token using Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error) {
      throw new AuthenticationError(
        AuthErrorCode.INVALID_TOKEN,
        `Token validation failed: ${error.message}`,
        401
      );
    }

    if (!user) {
      throw new AuthenticationError(
        AuthErrorCode.INVALID_TOKEN,
        'Invalid token: No user found',
        401
      );
    }

    // Check if user email is confirmed
    if (user.email_confirmed_at === null) {
      throw new AuthenticationError(
        AuthErrorCode.EMAIL_NOT_CONFIRMED,
        'Email not confirmed. Please confirm your email address.',
        403
      );
    }

    // Get user permissions from database
    const permissions = await getUserPermissions(user.id);

    return {
      userId: user.id,
      email: user.email || '',
      permissions,
    };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      throw error;
    }

    throw new AuthenticationError(
      AuthErrorCode.INVALID_TOKEN,
      `Token validation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      401
    );
  }
}

/**
 * Extract user information from JWT token
 * @param token - JWT token
 * @returns Promise<UserInfo> - User information
 * @throws AuthenticationError - If token is invalid
 */
export async function extractUserFromToken(token: string): Promise<UserInfo> {
  return validateJWT(token);
}

/**
 * Get user permissions from database
 * @param userId - User ID
 * @returns Promise<string[]> - Array of permission strings
 */
async function getUserPermissions(userId: string): Promise<string[]> {
  try {
    const supabase = initializeSupabaseClient();

    // Query user permissions from database
    const { data, error } = await supabase
      .from('users')
      .select('profile_data')
      .eq('id', userId)
      .single();

    if (error || !data) {
      // Return default permission if user not found in public.users
      return ['user'];
    }

    // Extract permissions from profile data
    const profileData = data.profile_data as Record<string, unknown>;
    const permissions = (profileData.permissions as string[]) || ['user'];

    return permissions;
  } catch (error) {
    console.warn('Failed to get user permissions:', error);
    // Return default permission on error
    return ['user'];
  }
}

/**
 * Verify token expiration (client-side check)
 * Note: This is a basic check. Full validation should use validateJWT
 * @param token - JWT token
 * @returns boolean - Whether token is expired
 */
export function verifyTokenExpiry(token: string): boolean {
  try {
    // Decode token without verification (just to check expiry)
    const parts = token.split('.');
    if (parts.length !== 3) {
      return true; // Invalid token format
    }

    const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString()) as JWTPayload;

    if (!payload.exp) {
      return false; // No expiration claim
    }

    // Check if token is expired (with 60 second buffer)
    // Tokens are considered expired slightly before actual expiry for timely refresh
    const now = Math.floor(Date.now() / 1000);
    return payload.exp < now + 60;
  } catch (error) {
    // If we can't parse the token, consider it expired
    return true;
  }
}

/**
 * Get Supabase client instance
 * @returns SupabaseClient - Supabase client
 */
export function getSupabaseClient(): SupabaseClient {
  return initializeSupabaseClient();
}

