import express, { Express, Request, Response } from 'express';
import { ApolloServer } from 'apollo-server-express';
import { GraphQLSchema } from 'graphql';
import { mergeTypeDefs, mergeResolvers } from '@graphql-tools/merge';
import { GraphQLScalarType } from 'graphql';
import { GraphQLDateTime, GraphQLJSON, GraphQLBigInt } from 'graphql-scalars';
import { typeDefs as typeDefinitions } from './schema/types';
import { queryTypeDefs } from './schema/queries';
import { mutationTypeDefs } from './schema/mutations';
import { subscriptionTypeDefs } from './schema/subscriptions';
import { walletResolvers } from './resolvers/wallet-resolvers';
import { contractResolvers } from './resolvers/contract-resolvers';
import { automationResolvers } from './resolvers/automation-resolvers';
import { marketResolvers } from './resolvers/market-resolvers';
import { createContext, contextMiddleware } from './utils/context';
import { createSubscriptionManager } from './utils/subscription-manager';

/**
 * Mock Data Sources - Replace with actual service implementations
 */
const createMockDataSources = () => ({
  walletService: {
    getWallet: async (id: string) => ({ id, address: '0x123', type: 'KEYPAIR' }),
    getWalletByAddress: async (address: string) => ({ address, type: 'KEYPAIR' }),
    getWallets: async (opts: any) => ({
      edges: [],
      pageInfo: { hasNextPage: false, hasPreviousPage: false },
      totalCount: 0,
    }),
    getBalance: async (address: string) => ({ native: '100', assets: [] }),
    getAssets: async (address: string) => [],
    createWallet: async (opts: any) => ({ id: '1', address: '0x123', type: opts.type }),
    importWallet: async (opts: any) => ({ address: opts.publicKey, type: 'KEYPAIR' }),
    deleteWallet: async (id: string) => true,
    updateWalletName: async (id: string, name: string) => ({ id, name }),
  },
  contractService: {
    getContract: async (id: string) => ({ id, address: '0xabc', name: 'Contract' }),
    getContractByAddress: async (address: string) => ({ address, name: 'Contract' }),
    getContracts: async (opts: any) => ({
      edges: [],
      pageInfo: { hasNextPage: false, hasPreviousPage: false },
      totalCount: 0,
    }),
    getContractFunctions: async (id: string) => [],
    deployContract: async (opts: any) => ({ id: '1', address: '0xabc', name: opts.name }),
    updateContract: async (id: string, opts: any) => ({ id, ...opts }),
    invokeFunction: async (
      contractId: string,
      functionName: string,
      parameters: any,
      signers?: string[]
    ) => ({ result: null }),
    deleteContract: async (id: string) => true,
  },
  transactionService: {
    getTransaction: async (hash: string) => ({ hash, status: 'SUCCESS' }),
    getTransactions: async (opts: any) => ({
      edges: [],
      pageInfo: { hasNextPage: false, hasPreviousPage: false },
      totalCount: 0,
    }),
    getTransactionsByContract: async (contractId: string, opts: any) => ({
      edges: [],
      pageInfo: { hasNextPage: false, hasPreviousPage: false },
      totalCount: 0,
    }),
    sendPayment: async (opts: any) => ({ hash: '0x123', status: 'PENDING' }),
    createOffer: async (opts: any) => ({ hash: '0x123', status: 'PENDING' }),
    swapAssets: async (opts: any) => ({ hash: '0x123', status: 'PENDING' }),
    submitTransaction: async (envelope: string) => ({ hash: '0x123', status: 'PENDING' }),
  },
  marketService: {
    getMarket: async (pair: string) => ({ id: pair, pair: pair, price: '100', change24h: 0 }),
    getMarkets: async (opts: any) => [],
    getMarketHistory: async (pair: string, resolution: string, limit: number) => [],
  },
  automationService: {
    getAutomation: async (id: string) => ({ id, name: 'Automation', enabled: true }),
    getAutomations: async (opts: any) => [],
    getExecutionHistory: async (id: string, limit: number) => [],
    createAutomation: async (opts: any) => ({ id: '1', name: opts.name, enabled: true }),
    updateAutomation: async (id: string, opts: any) => ({ id, ...opts }),
    executeAutomation: async (id: string) => ({}),
    deleteAutomation: async (id: string) => true,
    pauseAutomation: async (id: string) => ({ id, status: 'PAUSED' }),
    resumeAutomation: async (id: string) => ({ id, status: 'ACTIVE' }),
  },
});

/**
 * Custom scalar resolvers
 */
const scalarResolvers = {
  DateTime: GraphQLDateTime,
  JSON: GraphQLJSON,
  BigInt: GraphQLBigInt,
};

/**
 * Root Query Resolver
 */
const rootQueryResolver = {
  Query: {
    health: async () => ({
      status: 'ok',
      timestamp: new Date(),
      version: '1.0.0',
    }),
    networkStatus: async (_: any, __: any, context: any) => ({
      network: context.network,
      status: 'online',
      latency: Math.random() * 100,
    }),
    gasPrice: async () => '21',
    networkFees: async () => ({
      low: '1',
      standard: '2',
      fast: '3',
    }),
  },
};

/**
 * Merge all type definitions and resolvers
 */
const mergedTypeDefs = mergeTypeDefs([
  typeDefinitions,
  queryTypeDefs,
  mutationTypeDefs,
  subscriptionTypeDefs,
]);

const mergedResolvers = mergeResolvers([
  scalarResolvers,
  rootQueryResolver,
  walletResolvers,
  contractResolvers,
  automationResolvers,
  marketResolvers,
]);

/**
 * GraphQL API Server Class
 */
export class GraphQLAPIServer {
  private app: Express;
  private server: ApolloServer | null = null;
  private subscriptionManager: any;
  private config: {
    port: number;
    host: string;
    supabaseUrl: string;
    supabaseKey: string;
  };

  constructor(config: {
    port?: number;
    host?: string;
    supabaseUrl: string;
    supabaseKey: string;
  }) {
    this.app = express();
    this.subscriptionManager = createSubscriptionManager();
    this.config = {
      port: config.port || 4000,
      host: config.host || 'localhost',
      supabaseUrl: config.supabaseUrl,
      supabaseKey: config.supabaseKey,
    };
  }

  /**
   * Initialize the Apollo Server and middleware
   */
  async initialize(): Promise<void> {
    // Middleware
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // Health check endpoint
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({
        status: 'ok',
        timestamp: new Date(),
        uptime: process.uptime(),
      });
    });

    // Metrics endpoint
    this.app.get('/metrics', (_req: Request, res: Response) => {
      res.json({
        subscriptions: this.subscriptionManager.getListenerCount('*'),
        timestamp: new Date(),
      });
    });

    // Create data sources
    const dataSources = createMockDataSources();

    // Create Apollo Server
    this.server = new ApolloServer({
      typeDefs: mergedTypeDefs,
      resolvers: mergedResolvers as any,
      context: contextMiddleware(
        dataSources,
        this.subscriptionManager,
        this.config.supabaseUrl,
        this.config.supabaseKey
      ) as any,
      plugins: {
        didResolveOperation: async () => {
          // Log operations if needed
        },
      },
      formatError: (error) => {
        console.error('GraphQL Error:', error);
        return error;
      },
    });

    // Start Apollo Server
    await this.server.start();

    // Connect Apollo Server middleware to Express
    this.app.use('/graphql', this.server.getMiddleware());

    console.log('GraphQL API Server initialized');
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    await this.initialize();

    return new Promise((resolve, reject) => {
      this.app
        .listen(this.config.port, this.config.host, () => {
          console.log(
            `🚀 GraphQL API Server running at http://${this.config.host}:${this.config.port}/graphql`
          );
          console.log(`📊 Metrics available at http://${this.config.host}:${this.config.port}/metrics`);
          resolve();
        })
        .on('error', reject);
    });
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    if (this.server) {
      await this.server.stop();
    }
    this.subscriptionManager.clear();
    console.log('GraphQL API Server stopped');
  }

  /**
   * Get the subscription manager
   */
  getSubscriptionManager() {
    return this.subscriptionManager;
  }

  /**
   * Get the Express app
   */
  getApp() {
    return this.app;
  }
}

/**
 * Main entry point
 */
async function main() {
  const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
  const supabaseKey = process.env.SUPABASE_ANON_KEY || 'your-anon-key';

  const server = new GraphQLAPIServer({
    port: parseInt(process.env.PORT || '4000', 10),
    host: process.env.HOST || 'localhost',
    supabaseUrl,
    supabaseKey,
  });

  try {
    await server.start();
  } catch (error) {
    console.error('Failed to start GraphQL API Server:', error);
    process.exit(1);
  }

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...');
    await server.stop();
    process.exit(0);
  });
}

// Export for testing and integration
export default GraphQLAPIServer;

// Run if this is the main module
if (require.main === module) {
  main().catch(console.error);
}
