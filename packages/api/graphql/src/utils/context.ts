import { createClient } from '@supabase/supabase-js';

/**
 * GraphQL Context Factory
 * Creates request context with database connections, data sources, and utilities
 */

interface ContextConfig {
  userId?: string;
  token?: string;
  network?: string;
  supabaseUrl: string;
  supabaseKey: string;
}

interface DataSources {
  walletService: any;
  contractService: any;
  transactionService: any;
  marketService: any;
  automationService: any;
}

export interface GraphQLContext {
  userId?: string;
  token?: string;
  network: string;
  db: any;
  dataSources: DataSources;
  subscriptionManager: any;
  cache?: Map<string, any>;
}

/**
 * Creates the GraphQL context for each request
 */
export const createContext = async (
  config: ContextConfig,
  dataSources: DataSources,
  subscriptionManager: any
): Promise<GraphQLContext> => {
  // Initialize Supabase client
  const supabase = createClient(config.supabaseUrl, config.supabaseKey);

  // Create request cache
  const cache = new Map<string, any>();

  // Extract user from token if provided
  let userId: string | undefined;
  if (config.token) {
    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser(config.token);
      if (error) {
        console.warn('Failed to get user from token:', error);
      } else {
        userId = user?.id;
      }
    } catch (error) {
      console.warn('Error extracting user from token:', error);
    }
  }

  return {
    userId: userId || config.userId,
    token: config.token,
    network: config.network || 'testnet',
    db: supabase,
    dataSources,
    subscriptionManager,
    cache,
  };
};

/**
 * Context middleware for Express + Apollo Server
 */
export const contextMiddleware = (
  dataSources: DataSources,
  subscriptionManager: any,
  supabaseUrl: string,
  supabaseKey: string
) => {
  return async ({ req }: { req: any }) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const network = req.headers['x-network'] || 'testnet';

    return createContext(
      {
        token,
        network,
        supabaseUrl,
        supabaseKey,
      },
      dataSources,
      subscriptionManager
    );
  };
};

/**
 * Utility function to verify user authentication
 */
export const requireAuth = (context: GraphQLContext): string => {
  if (!context.userId && !context.token) {
    throw new Error('Authentication required');
  }
  return context.userId || '';
};

/**
 * Utility function to verify user authorization for a specific network
 */
export const requireNetwork = (context: GraphQLContext, network: string): void => {
  if (context.network !== network) {
    throw new Error(`This operation is only available on the ${network} network`);
  }
};

/**
 * Caching utility for resolvers
 */
export const getCachedOrFetch = async <T>(
  context: GraphQLContext,
  key: string,
  fetchFn: () => Promise<T>,
  ttl: number = 5000 // 5 seconds default TTL
): Promise<T> => {
  // Check cache
  if (context.cache?.has(key)) {
    const cached = context.cache.get(key);
    if (cached.expiresAt > Date.now()) {
      return cached.value;
    } else {
      context.cache.delete(key);
    }
  }

  // Fetch fresh data
  const value = await fetchFn();

  // Store in cache
  if (context.cache) {
    context.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl,
    });
  }

  return value;
};
