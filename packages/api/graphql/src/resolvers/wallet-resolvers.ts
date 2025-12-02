import { SubscriptionManager } from '../utils/subscription-manager';

/**
 * Wallet GraphQL Resolvers
 * Handles wallet-related queries, mutations, and subscriptions
 */

interface WalletInput {
  name: string;
  type: string;
}

interface ImportWalletInput {
  publicKey: string;
  name?: string;
}

export const walletResolvers = {
  Query: {
    wallet: async (_: any, { id }: { id: string }, context: any) => {
      try {
        const wallet = await context.dataSources.walletService.getWallet(id);
        return wallet;
      } catch (error) {
        throw new Error(`Failed to fetch wallet: ${(error as Error).message}`);
      }
    },

    walletByAddress: async (_: any, { address }: { address: string }, context: any) => {
      try {
        const wallet = await context.dataSources.walletService.getWalletByAddress(address);
        return wallet;
      } catch (error) {
        throw new Error(`Failed to fetch wallet by address: ${(error as Error).message}`);
      }
    },

    wallets: async (
      _: any,
      { first, after }: { first?: number; after?: string },
      context: any
    ) => {
      try {
        const wallets = await context.dataSources.walletService.getWallets({
          first: first || 10,
          after,
        });
        return wallets;
      } catch (error) {
        throw new Error(`Failed to fetch wallets: ${(error as Error).message}`);
      }
    },

    walletBalance: async (_: any, { address }: { address: string }, context: any) => {
      try {
        const balance = await context.dataSources.walletService.getBalance(address);
        return balance;
      } catch (error) {
        throw new Error(`Failed to fetch wallet balance: ${(error as Error).message}`);
      }
    },

    walletAssets: async (_: any, { address }: { address: string }, context: any) => {
      try {
        const assets = await context.dataSources.walletService.getAssets(address);
        return assets;
      } catch (error) {
        throw new Error(`Failed to fetch wallet assets: ${(error as Error).message}`);
      }
    },
  },

  Mutation: {
    createWallet: async (_: any, { name, type }: WalletInput, context: any) => {
      try {
        const wallet = await context.dataSources.walletService.createWallet({
          name,
          type,
        });
        context.subscriptionManager.emit('walletCreated', wallet);
        return wallet;
      } catch (error) {
        throw new Error(`Failed to create wallet: ${(error as Error).message}`);
      }
    },

    importWallet: async (
      _: any,
      { publicKey, name }: ImportWalletInput,
      context: any
    ) => {
      try {
        const wallet = await context.dataSources.walletService.importWallet({
          publicKey,
          name,
        });
        context.subscriptionManager.emit('walletImported', wallet);
        return wallet;
      } catch (error) {
        throw new Error(`Failed to import wallet: ${(error as Error).message}`);
      }
    },

    deleteWallet: async (_: any, { id }: { id: string }, context: any) => {
      try {
        await context.dataSources.walletService.deleteWallet(id);
        context.subscriptionManager.emit('walletDeleted', { id });
        return true;
      } catch (error) {
        throw new Error(`Failed to delete wallet: ${(error as Error).message}`);
      }
    },

    updateWalletName: async (
      _: any,
      { id, name }: { id: string; name: string },
      context: any
    ) => {
      try {
        const wallet = await context.dataSources.walletService.updateWalletName(id, name);
        context.subscriptionManager.emit('walletUpdated', wallet);
        return wallet;
      } catch (error) {
        throw new Error(`Failed to update wallet name: ${(error as Error).message}`);
      }
    },
  },

  Subscription: {
    walletUpdated: {
      subscribe: (_: any, { address }: { address: string }, context: any) => {
        return context.subscriptionManager.subscribe(`wallet:${address}:updated`);
      },
      resolve: (payload: any) => payload,
    },

    walletBalanceChanged: {
      subscribe: (_: any, { address }: { address: string }, context: any) => {
        return context.subscriptionManager.subscribe(`wallet:${address}:balance-changed`);
      },
      resolve: (payload: any) => payload,
    },

    walletActivityNotification: {
      subscribe: (_: any, { address }: { address: string }, context: any) => {
        return context.subscriptionManager.subscribe(`wallet:${address}:activity`);
      },
      resolve: (payload: any) => payload,
    },
  },

  Wallet: {
    balance: async (wallet: any, _: any, context: any) => {
      try {
        const balance = await context.dataSources.walletService.getBalance(wallet.address);
        return balance;
      } catch (error) {
        console.error('Failed to resolve wallet balance:', error);
        return null;
      }
    },
  },
};
