/**
 * Authentication Middleware Tests
 * 
 * This module tests the authentication middleware functionality
 * including JWT validation, rate limiting, and user permissions.
 */

import { validateToken, checkRateLimit, hasPermission } from '../../middleware/auth';
import { MockSupabaseClient, TestDataGenerator, mockEnvironment, setupJestMocks, cleanup } from '../utils/test-helpers';

// Mock Supabase
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => new MockSupabaseClient())
}));

describe('Authentication Middleware', () => {
  let mockSupabase: MockSupabaseClient;

  beforeEach(() => {
    setupJestMocks();
    mockEnvironment();
    mockSupabase = new MockSupabaseClient();
  });

  afterEach(() => {
    cleanup();
  });

  describe('validateToken', () => {
    it('should validate a valid JWT token', async () => {
      const user = TestDataGenerator.generateUser();
      mockSupabase.setAuthUser(user);

      const result = await validateToken('valid-token');

      expect(result.success).toBe(true);
      expect(result.userId).toBe(user.id);
      expect(result.userEmail).toBe(user.email);
    });

    it('should reject an invalid JWT token', async () => {
      mockSupabase.setAuthUser(null);

      const result = await validateToken('invalid-token');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Token validation failed');
    });

    it('should reject token for unconfirmed email', async () => {
      const user = TestDataGenerator.generateUser({ email_confirmed_at: null });
      mockSupabase.setAuthUser(user);

      const result = await validateToken('unconfirmed-token');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Email not confirmed');
    });

    it('should handle authentication errors gracefully', async () => {
      // Mock Supabase to throw an error
      jest.spyOn(mockSupabase.auth, 'getUser').mockRejectedValue(new Error('Network error'));

      const result = await validateToken('error-token');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Authentication error');
    });
  });

  describe('checkRateLimit', () => {
    it('should allow requests within rate limit', () => {
      const identifier = 'test-identifier';
      
      // First few requests should be allowed
      expect(checkRateLimit(identifier)).toBe(true);
      expect(checkRateLimit(identifier)).toBe(true);
      expect(checkRateLimit(identifier)).toBe(true);
    });

    it('should block requests that exceed rate limit', () => {
      const identifier = 'test-identifier';
      
      // Make many requests to exceed rate limit
      for (let i = 0; i < 15; i++) {
        checkRateLimit(identifier);
      }

      // Next request should be blocked
      expect(checkRateLimit(identifier)).toBe(false);
    });

    it('should allow requests after rate limit window resets', () => {
      const identifier = 'test-identifier';
      
      // Exceed rate limit
      for (let i = 0; i < 15; i++) {
        checkRateLimit(identifier);
      }

      // Fast forward time to reset window
      jest.advanceTimersByTime(60000); // 1 minute

      // Should be allowed again
      expect(checkRateLimit(identifier)).toBe(true);
    });

    it('should handle different identifiers independently', () => {
      const identifier1 = 'test-identifier-1';
      const identifier2 = 'test-identifier-2';
      
      // Exceed rate limit for first identifier
      for (let i = 0; i < 15; i++) {
        checkRateLimit(identifier1);
      }

      // Second identifier should still be allowed
      expect(checkRateLimit(identifier2)).toBe(true);
    });
  });

  describe('hasPermission', () => {
    it('should return true for users with required permission', () => {
      const permissions = ['user', 'trader', 'admin'];
      const requiredPermission = 'trader';

      expect(hasPermission(permissions, requiredPermission)).toBe(true);
    });

    it('should return true for admin users regardless of specific permission', () => {
      const permissions = ['user', 'admin'];
      const requiredPermission = 'trader';

      expect(hasPermission(permissions, requiredPermission)).toBe(true);
    });

    it('should return false for users without required permission', () => {
      const permissions = ['user'];
      const requiredPermission = 'trader';

      expect(hasPermission(permissions, requiredPermission)).toBe(false);
    });

    it('should return false for empty permissions array', () => {
      const permissions: string[] = [];
      const requiredPermission = 'user';

      expect(hasPermission(permissions, requiredPermission)).toBe(false);
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete authentication flow', async () => {
      const user = TestDataGenerator.generateUser();
      mockSupabase.setAuthUser(user);

      // Validate token
      const authResult = await validateToken('valid-token');
      expect(authResult.success).toBe(true);

      // Check permissions
      const hasUserPermission = hasPermission(authResult.permissions || [], 'user');
      expect(hasUserPermission).toBe(true);

      // Check rate limiting
      const identifier = `user-${user.id}`;
      expect(checkRateLimit(identifier)).toBe(true);
    });

    it('should handle authentication with rate limiting', async () => {
      const user = TestDataGenerator.generateUser();
      mockSupabase.setAuthUser(user);

      const identifier = `user-${user.id}`;

      // Make many authentication attempts
      for (let i = 0; i < 15; i++) {
        const authResult = await validateToken(`token-${i}`);
        expect(authResult.success).toBe(true);
      }

      // Rate limit should kick in
      expect(checkRateLimit(identifier)).toBe(false);
    });

    it('should handle concurrent authentication requests', async () => {
      const user = TestDataGenerator.generateUser();
      mockSupabase.setAuthUser(user);

      // Simulate concurrent requests
      const promises = Array.from({ length: 5 }, (_, i) => 
        validateToken(`concurrent-token-${i}`)
      );

      const results = await Promise.all(promises);

      // All should succeed
      results.forEach(result => {
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      jest.spyOn(mockSupabase.auth, 'getUser').mockRejectedValue(new Error('Network timeout'));

      const result = await validateToken('network-error-token');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Authentication error');
    });

    it('should handle malformed tokens', async () => {
      const result = await validateToken('malformed-token');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle empty tokens', async () => {
      const result = await validateToken('');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Performance Tests', () => {
    it('should handle high volume of authentication requests', async () => {
      const user = TestDataGenerator.generateUser();
      mockSupabase.setAuthUser(user);

      const startTime = Date.now();
      const promises = Array.from({ length: 100 }, (_, i) => 
        validateToken(`perf-token-${i}`)
      );

      const results = await Promise.all(promises);
      const endTime = Date.now();

      // All should succeed
      results.forEach(result => {
        expect(result.success).toBe(true);
      });

      // Should complete within reasonable time
      expect(endTime - startTime).toBeLessThan(1000); // 1 second
    });

    it('should handle rate limiting efficiently', () => {
      const startTime = Date.now();
      
      // Make many rate limit checks
      for (let i = 0; i < 1000; i++) {
        checkRateLimit(`perf-identifier-${i}`);
      }

      const endTime = Date.now();

      // Should complete quickly
      expect(endTime - startTime).toBeLessThan(100); // 100ms
    });
  });
});
