/**
 * WebSocket Authentication Middleware
 * 
 * This module provides JWT token validation and user authentication
 * for WebSocket connections using Supabase.
 */

import { Socket } from 'socket.io';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';
import { AuthenticationResult, AuthenticationError, ExtendedSocket } from '../types/websocket-types';

/**
 * Rate limiting configuration
 */
interface RateLimitConfig {
  /** Maximum requests per window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Block duration in milliseconds */
  blockDurationMs: number;
}

/**
 * Rate limiting store
 */
class RateLimitStore {
  private requests = new Map<string, { count: number; resetTime: number; blockedUntil?: number }>();
  private readonly config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
  }

  /**
   * Check if request is allowed
   */
  isAllowed(identifier: string): boolean {
    const now = Date.now();
    const record = this.requests.get(identifier);

    // Check if currently blocked
    if (record?.blockedUntil && now < record.blockedUntil) {
      return false;
    }

    // Reset if window has passed
    if (!record || now >= record.resetTime) {
      this.requests.set(identifier, {
        count: 1,
        resetTime: now + this.config.windowMs
      });
      return true;
    }

    // Check if limit exceeded
    if (record.count >= this.config.maxRequests) {
      // Block the identifier
      record.blockedUntil = now + this.config.blockDurationMs;
      return false;
    }

    // Increment count
    record.count++;
    return true;
  }

  /**
   * Clear expired records
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, record] of this.requests.entries()) {
      if (now >= record.resetTime && (!record.blockedUntil || now >= record.blockedUntil)) {
        this.requests.delete(key);
      }
    }
  }
}

/**
 * Rate limiting store instance
 */
const rateLimitStore = new RateLimitStore({
  maxRequests: 10, // 10 requests
  windowMs: 60000, // per minute
  blockDurationMs: 300000 // block for 5 minutes
});

/**
 * Supabase client instance
 */
let supabaseClient: SupabaseClient | null = null;

/**
 * Initialize Supabase client
 */
function initializeSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(config.supabase.url, config.supabase.anonKey);
  }
  return supabaseClient;
}

/**
 * Validate JWT token and extract user information
 * 
 * @param token - JWT token to validate
 * @returns Promise<AuthenticationResult> - Authentication result
 */
export async function validateToken(token: string): Promise<AuthenticationResult> {
  try {
    const supabase = initializeSupabaseClient();
    
    // Verify the JWT token
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error) {
      return {
        success: false,
        error: `Token validation failed: ${error.message}`
      };
    }

    if (!user) {
      return {
        success: false,
        error: 'Invalid token: No user found'
      };
    }

    // Check if user is active
    if (user.email_confirmed_at === null) {
      return {
        success: false,
        error: 'Email not confirmed'
      };
    }

    // Get user permissions (if any)
    const permissions = await getUserPermissions(user.id);

    return {
      success: true,
      userId: user.id,
      userEmail: user.email,
      permissions
    };
  } catch (error) {
    return {
      success: false,
      error: `Authentication error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Get user permissions from database
 * 
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
      return ['user']; // Default permission
    }

    // Extract permissions from profile data
    const profileData = data.profile_data as Record<string, unknown>;
    const permissions = profileData.permissions as string[] || ['user'];
    
    return permissions;
  } catch {
    return ['user']; // Default permission
  }
}

/**
 * Check if user has specific permission
 * 
 * @param permissions - User permissions
 * @param requiredPermission - Required permission
 * @returns boolean - Whether user has permission
 */
export function hasPermission(permissions: string[], requiredPermission: string): boolean {
  return permissions.includes(requiredPermission) || permissions.includes('admin');
}

/**
 * Rate limiting middleware
 * 
 * @param identifier - Unique identifier for rate limiting
 * @returns boolean - Whether request is allowed
 */
export function checkRateLimit(identifier: string): boolean {
  return rateLimitStore.isAllowed(identifier);
}

/**
 * Authentication middleware for Socket.IO
 * 
 * @param socket - Socket.IO socket instance
 * @param next - Next middleware function
 */
export function authMiddleware(socket: ExtendedSocket, next: (err?: Error) => void): void {
  // Extract client IP for rate limiting
  const clientIP = socket.handshake.address;
  const userAgent = socket.handshake.headers['user-agent'] || 'unknown';
  const identifier = `${clientIP}:${userAgent}`;

  // Check rate limiting
  if (!checkRateLimit(identifier)) {
    return next(new AuthenticationError('Rate limit exceeded. Please try again later.'));
  }

  // Initialize connection state
  socket.connectionState = {
    socketId: socket.id,
    isAuthenticated: false,
    connectedAt: Date.now(),
    lastActivity: Date.now(),
    rooms: new Set(),
    metadata: {
      clientIP,
      userAgent,
      identifier
    }
  };

  // Set up authentication handler
  socket.on('authenticate', async (data: { token: string }) => {
    try {
      // Validate token
      const authResult = await validateToken(data.token);
      
      if (!authResult.success) {
        socket.emit('auth_error', { error: authResult.error });
        return;
      }

      // Update connection state
      socket.userId = authResult.userId;
      socket.isAuthenticated = true;
      socket.connectionState!.isAuthenticated = true;
      socket.connectionState!.lastActivity = Date.now();

      // Join user-specific room
      if (authResult.userId) {
        await socket.join(`user:${authResult.userId}`);
        socket.connectionState!.rooms.add(`user:${authResult.userId}`);
      }

      // Emit authentication success
      socket.emit('authenticated', {
        userId: authResult.userId,
        userEmail: authResult.userEmail,
        permissions: authResult.permissions
      });

      // Log successful authentication
      console.log(`User ${authResult.userId} authenticated successfully`);
    } catch (error) {
      console.error('Authentication error:', error);
      socket.emit('auth_error', { 
        error: 'Authentication failed. Please try again.' 
      });
    }
  });

  // Set up activity tracking
  socket.onAny(() => {
    if (socket.connectionState) {
      socket.connectionState.lastActivity = Date.now();
    }
  });

  // Set up disconnect handler
  socket.on('disconnect', () => {
    if (socket.connectionState) {
      console.log(`User ${socket.userId || 'anonymous'} disconnected`);
    }
  });

  // Continue to next middleware
  next();
}

/**
 * Require authentication for specific events
 * 
 * @param socket - Socket instance
 * @param event - Event name
 * @param handler - Event handler
 */
export function requireAuth(
  socket: ExtendedSocket,
  event: string,
  handler: (socket: ExtendedSocket, ...args: unknown[]) => void
): void {
  socket.on(event, (...args: unknown[]) => {
    if (!socket.isAuthenticated || !socket.userId) {
      socket.emit('auth_required', { 
        event,
        error: 'Authentication required for this action' 
      });
      return;
    }

    // Update activity
    if (socket.connectionState) {
      socket.connectionState.lastActivity = Date.now();
    }

    handler(socket, ...args);
  });
}

/**
 * Check if user can access specific room
 * 
 * @param socket - Socket instance
 * @param roomName - Room name
 * @returns boolean - Whether access is allowed
 */
export function canAccessRoom(socket: ExtendedSocket, roomName: string): boolean {
  if (!socket.isAuthenticated || !socket.userId) {
    return false;
  }

  // Public rooms don't require authentication
  if (roomName.startsWith('market:') || roomName.startsWith('system:')) {
    return true;
  }

  // User-specific rooms
  if (roomName.startsWith('user:') && roomName === `user:${socket.userId}`) {
    return true;
  }

  // Wallet-specific rooms (user must own the wallet)
  if (roomName.startsWith('wallet:')) {
    const walletId = roomName.replace('wallet:', '');
    // TODO: Check if user owns the wallet
    return true; // Placeholder
  }

  // Automation-specific rooms (user must own the automation)
  if (roomName.startsWith('automation:')) {
    const automationId = roomName.replace('automation:', '');
    // TODO: Check if user owns the automation
    return true; // Placeholder
  }

  return false;
}

/**
 * Cleanup rate limiting store
 */
export function cleanupRateLimit(): void {
  rateLimitStore.cleanup();
}

/**
 * Get authentication status
 * 
 * @param socket - Socket instance
 * @returns Authentication status
 */
export function getAuthStatus(socket: ExtendedSocket): {
  isAuthenticated: boolean;
  userId?: string;
  permissions?: string[];
} {
  return {
    isAuthenticated: socket.isAuthenticated || false,
    userId: socket.userId,
    permissions: socket.connectionState?.metadata?.permissions as string[]
  };
}
