/**
 * @fileoverview User service for user management
 * @description Handles user CRUD operations, profile management, and permissions
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { User, UserProfile, AuthenticationError, AuthErrorCode } from '../types/auth-types';

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

    // Use service role key on the server to bypass RLS for internal user reads
    supabaseClient = createClient(supabaseURL, supabaseServiceRoleKey);
  }
  return supabaseClient;
}

/**
 * User Service Class
 */
export class UserService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = initializeSupabaseClient();
  }

  /**
   * Get user by ID
   * @param userId - User ID
   * @returns Promise<User | null> - User object or null if not found
   */
  async getUserById(userId: string): Promise<User | null> {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error || !data) {
        return null;
      }

      return this.mapDatabaseToUser(data);
    } catch (error) {
      console.error('Failed to get user by ID:', error);
      return null;
    }
  }

  /**
   * Get user by email
   * @param email - User email
   * @returns Promise<User | null> - User object or null if not found
   */
  async getUserByEmail(email: string): Promise<User | null> {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

      if (error || !data) {
        return null;
      }

      return this.mapDatabaseToUser(data);
    } catch (error) {
      console.error('Failed to get user by email:', error);
      return null;
    }
  }

  /**
   * Update user profile
   * @param userId - User ID
   * @param data - Profile data to update
   * @returns Promise<User> - Updated user object
   * @throws AuthenticationError - If user not found or update fails
   */
  async updateUserProfile(userId: string, data: Partial<UserProfile>): Promise<User> {
    try {
      const updateData: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      // Update profile_data if provided
      if (data.profileData !== undefined) {
        // Get existing profile data and merge
        const user = await this.getUserById(userId);
        if (!user) {
          throw new AuthenticationError(
            AuthErrorCode.USER_NOT_FOUND,
            'User not found',
            404
          );
        }

        updateData.profile_data = {
          ...user.profileData,
          ...data.profileData,
        };
      }

      const { data: updatedUser, error } = await this.supabase
        .from('users')
        .update(updateData)
        .eq('id', userId)
        .select()
        .single();

      if (error || !updatedUser) {
        throw new AuthenticationError(
          AuthErrorCode.USER_NOT_FOUND,
          `Failed to update user profile: ${error?.message || 'Unknown error'}`,
          500
        );
      }

      return this.mapDatabaseToUser(updatedUser);
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }

      throw new AuthenticationError(
        AuthErrorCode.USER_NOT_FOUND,
        `Failed to update user profile: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }

  /**
   * Update user permissions
   * @param userId - User ID
   * @param permissions - Array of permission strings
   * @returns Promise<void>
   * @throws AuthenticationError - If user not found or update fails
   */
  async updateUserPermissions(userId: string, permissions: string[]): Promise<void> {
    try {
      const user = await this.getUserById(userId);
      if (!user) {
        throw new AuthenticationError(
          AuthErrorCode.USER_NOT_FOUND,
          'User not found',
          404
        );
      }

      const profileData = {
        ...user.profileData,
        permissions,
      };

      const { error } = await this.supabase
        .from('users')
        .update({
          profile_data: profileData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) {
        throw new AuthenticationError(
          AuthErrorCode.USER_NOT_FOUND,
          `Failed to update user permissions: ${error.message}`,
          500
        );
      }
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }

      throw new AuthenticationError(
        AuthErrorCode.USER_NOT_FOUND,
        `Failed to update user permissions: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }

  /**
   * Deactivate user
   * @param userId - User ID
   * @returns Promise<void>
   * @throws AuthenticationError - If user not found or deactivation fails
   */
  async deactivateUser(userId: string): Promise<void> {
    try {
      // First fetch the current profile_data
      const { data: userData, error: selectError } = await this.supabase
        .from('users')
        .select('profile_data')
        .eq('id', userId)
        .single();

      if (selectError) {
        throw new AuthenticationError(
          AuthErrorCode.USER_NOT_FOUND,
          `Failed to fetch user profile: ${selectError.message}`,
          500
        );
      }

      if (!userData) {
        throw new AuthenticationError(
          AuthErrorCode.USER_NOT_FOUND,
          'User not found',
          404
        );
      }

      // Merge new fields into existing profile_data
      // Handle null/undefined profile_data as empty object
      const currentProfileData = (userData.profile_data as Record<string, unknown>) || {};
      const mergedProfileData = {
        ...currentProfileData,
        status: 'inactive',
        deactivated_at: new Date().toISOString(),
      };

      // Update with merged profile_data
      const { error: updateError } = await this.supabase
        .from('users')
        .update({
          profile_data: mergedProfileData,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (updateError) {
        throw new AuthenticationError(
          AuthErrorCode.USER_NOT_FOUND,
          `Failed to deactivate user: ${updateError.message}`,
          500
        );
      }
    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }

      throw new AuthenticationError(
        AuthErrorCode.USER_NOT_FOUND,
        `Failed to deactivate user: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }

  /**
   * Get user permissions
   * @param userId - User ID
   * @returns Promise<string[]> - Array of permission strings
   */
  async getUserPermissions(userId: string): Promise<string[]> {
    try {
      const user = await this.getUserById(userId);
      if (!user) {
        return ['user']; // Default permission
      }

      const profileData = user.profileData as Record<string, unknown>;
      const permissions = (profileData.permissions as string[]) || ['user'];

      return permissions;
    } catch (error) {
      console.error('Failed to get user permissions:', error);
      return ['user']; // Default permission
    }
  }

  /**
   * Check if user has permission
   * @param userId - User ID
   * @param permission - Permission to check
   * @returns Promise<boolean> - Whether user has permission
   */
  async hasPermission(userId: string, permission: string): Promise<boolean> {
    try {
      const permissions = await this.getUserPermissions(userId);
      return permissions.includes(permission) || permissions.includes('admin');
    } catch (error) {
      console.error('Failed to check user permission:', error);
      return false;
    }
  }

  /**
   * Map database record to User object
   * @param data - Database record
   * @returns User - User object
   */
  private mapDatabaseToUser(data: any): User {
    const profileData = (data.profile_data as Record<string, unknown>) || {};
    const permissions = (profileData.permissions as string[]) || ['user'];

    return {
      id: data.id,
      email: data.email,
      permissions,
      profileData,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    };
  }
}

