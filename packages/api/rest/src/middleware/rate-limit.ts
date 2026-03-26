import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AuditLogger } from '../services/audit-logger';

const auditLogger = new AuditLogger();

// Cache for walletId -> user_id to avoid redundant DB queries on rate-limited requests
const walletIdToUserIdCache = new Map<string, string>();

let supabaseClient: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    const supabaseURL = process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseURL || !supabaseServiceRoleKey) {
      throw new Error(
        "Missing required environment variables: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set"
      );
    }
    supabaseClient = createClient(supabaseURL, supabaseServiceRoleKey);
  }
  return supabaseClient;
}

/**
 * Custom response handler for rate limit breach
 */
const rateLimitHandler = (req: Request, res: Response) => {
  const retryAfter = 60; // 1 minute window
  const userId = (req as any)._rateLimitUserId || null;

  // Log to AuditLogger
  void auditLogger.log({
    user_id: userId,
    action: "rate_limit_exceeded",
    resource: req.originalUrl,
    ip_address: req.ip || null,
    success: false,
    metadata: {
      retryAfter,
      endpoint: req.originalUrl,
    },
  });

  // Add Retry-After header
  res.set('Retry-After', String(retryAfter));

  res.status(429).json({
    error: "Too many transactions. Try again in 60 seconds.",
    retryAfter,
  });
};


/**
 * User-based rate limiter: 10 requests per minute per user ID
 */
export const userSubmitTxLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10,
  legacyHeaders: false,
  standardHeaders: true,
  handler: rateLimitHandler,
  keyGenerator: async (req: Request): Promise<string> => {
    const walletId = req.body?.walletId;
    if (!walletId || typeof walletId !== "string") {
      return req.ip || "unknown"; // Fallback to IP if body invalid
    }

    // Check cache first
    let userId = walletIdToUserIdCache.get(walletId);
    if (userId) {
      // Attach to req for handler logging
      (req as any)._rateLimitUserId = userId;
      return `submit-tx:user:${userId}`;
    }

    // Query DB
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from("smart_wallets")
        .select("user_id")
        .eq("id", walletId)
        .single();

      if (!error && data?.user_id) {
        userId = data.user_id;
        walletIdToUserIdCache.set(walletId, userId!);
        (req as any)._rateLimitUserId = userId;
        return `submit-tx:user:${userId}`;
      }
    } catch (err) {
      // Ignore errors, fallback to walletId
    }

    // Fallback to walletId
    return `submit-tx:wallet:${walletId}`;
  },
});

/**
 * Global rate limiter: 100 total requests per minute
 */
export const globalSubmitTxLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100,
  legacyHeaders: false,
  standardHeaders: true,
  handler: rateLimitHandler,
  keyGenerator: (): string => {
    return "submit-tx:global";
  },
});
