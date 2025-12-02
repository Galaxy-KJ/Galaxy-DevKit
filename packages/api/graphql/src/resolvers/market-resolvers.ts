/**
 * Market GraphQL Resolvers
 * Handles market and trading related queries and subscriptions
 */

export const marketResolvers = {
  Query: {
    market: async (_: any, { pair }: { pair: string }, context: any) => {
      try {
        const market = await context.dataSources.marketService.getMarket(pair);
        return market;
      } catch (error) {
        throw new Error(`Failed to fetch market: ${(error as Error).message}`);
      }
    },

    markets: async (
      _: any,
      { first, after }: { first?: number; after?: string },
      context: any
    ) => {
      try {
        const markets = await context.dataSources.marketService.getMarkets({
          first: first || 10,
          after,
        });
        return markets;
      } catch (error) {
        throw new Error(`Failed to fetch markets: ${(error as Error).message}`);
      }
    },

    marketHistory: async (
      _: any,
      { pair, resolution, limit }: { pair: string; resolution?: string; limit?: number },
      context: any
    ) => {
      try {
        const history = await context.dataSources.marketService.getMarketHistory(
          pair,
          resolution || '1h',
          limit || 100
        );
        return history;
      } catch (error) {
        throw new Error(`Failed to fetch market history: ${(error as Error).message}`);
      }
    },

    transaction: async (_: any, { hash }: { hash: string }, context: any) => {
      try {
        const transaction = await context.dataSources.transactionService.getTransaction(hash);
        return transaction;
      } catch (error) {
        throw new Error(`Failed to fetch transaction: ${(error as Error).message}`);
      }
    },

    transactions: async (
      _: any,
      {
        address,
        first,
        after,
        status,
      }: { address?: string; first?: number; after?: string; status?: string },
      context: any
    ) => {
      try {
        const transactions = await context.dataSources.transactionService.getTransactions({
          address,
          first: first || 10,
          after,
          status,
        });
        return transactions;
      } catch (error) {
        throw new Error(`Failed to fetch transactions: ${(error as Error).message}`);
      }
    },

    transactionsByContract: async (
      _: any,
      { contractId, first, after }: { contractId: string; first?: number; after?: string },
      context: any
    ) => {
      try {
        const transactions =
          await context.dataSources.transactionService.getTransactionsByContract(contractId, {
            first: first || 10,
            after,
          });
        return transactions;
      } catch (error) {
        throw new Error(
          `Failed to fetch transactions by contract: ${(error as Error).message}`
        );
      }
    },
  },

  Mutation: {
    sendPayment: async (
      _: any,
      {
        source,
        destination,
        asset,
        amount,
        memo,
        signers,
      }: {
        source: string;
        destination: string;
        asset: string;
        amount: string;
        memo?: string;
        signers: string[];
      },
      context: any
    ) => {
      try {
        const transaction = await context.dataSources.transactionService.sendPayment({
          source,
          destination,
          asset,
          amount,
          memo,
          signers,
        });

        // Emit generic event
        context.subscriptionManager.emit('transactionSubmitted', transaction);

        // Emit per-address and per-hash scoped events so subscribers receive them
        if (transaction) {
          if (transaction.hash) {
            context.subscriptionManager.emit(`transaction:${transaction.hash}:status-changed`, transaction);
          }
          if (transaction.source) {
            context.subscriptionManager.emit(`transaction:${transaction.source}:submitted`, transaction);
            if (transaction.status === 'SUCCESS') {
              context.subscriptionManager.emit(`transaction:${transaction.source}:confirmed`, transaction);
            }
          }
          if (transaction.destination) {
            context.subscriptionManager.emit(`transaction:${transaction.destination}:submitted`, transaction);
            if (transaction.status === 'SUCCESS') {
              context.subscriptionManager.emit(`transaction:${transaction.destination}:confirmed`, transaction);
            }
          }
        }

        return transaction;
      } catch (error) {
        throw new Error(`Failed to send payment: ${(error as Error).message}`);
      }
    },

    createOffer: async (
      _: any,
      {
        source,
        selling,
        buying,
        amount,
        price,
        signers,
      }: {
        source: string;
        selling: string;
        buying: string;
        amount: string;
        price: string;
        signers: string[];
      },
      context: any
    ) => {
      try {
        const transaction = await context.dataSources.transactionService.createOffer({
          source,
          selling,
          buying,
          amount,
          price,
          signers,
        });

        // Generic event
        context.subscriptionManager.emit('offerCreated', transaction);

        // Scoped emits
        if (transaction) {
          if (transaction.hash) {
            context.subscriptionManager.emit(`transaction:${transaction.hash}:status-changed`, transaction);
          }
          if (transaction.source) {
            context.subscriptionManager.emit(`transaction:${transaction.source}:submitted`, transaction);
            if (transaction.status === 'SUCCESS') {
              context.subscriptionManager.emit(`transaction:${transaction.source}:confirmed`, transaction);
            }
          }
          if (transaction.destination) {
            context.subscriptionManager.emit(`transaction:${transaction.destination}:submitted`, transaction);
            if (transaction.status === 'SUCCESS') {
              context.subscriptionManager.emit(`transaction:${transaction.destination}:confirmed`, transaction);
            }
          }
        }

        return transaction;
      } catch (error) {
        throw new Error(`Failed to create offer: ${(error as Error).message}`);
      }
    },

    swapAssets: async (
      _: any,
      {
        source,
        sendAsset,
        sendAmount,
        receiveAsset,
        receiveAmount,
        signers,
      }: {
        source: string;
        sendAsset: string;
        sendAmount: string;
        receiveAsset: string;
        receiveAmount: string;
        signers: string[];
      },
      context: any
    ) => {
      try {
        const transaction = await context.dataSources.transactionService.swapAssets({
          source,
          sendAsset,
          sendAmount,
          receiveAsset,
          receiveAmount,
          signers,
        });

        // Generic event
        context.subscriptionManager.emit('swapExecuted', transaction);

        // Scoped emits
        if (transaction) {
          if (transaction.hash) {
            context.subscriptionManager.emit(`transaction:${transaction.hash}:status-changed`, transaction);
          }
          if (transaction.source) {
            context.subscriptionManager.emit(`transaction:${transaction.source}:submitted`, transaction);
            if (transaction.status === 'SUCCESS') {
              context.subscriptionManager.emit(`transaction:${transaction.source}:confirmed`, transaction);
            }
          }
          if (transaction.destination) {
            context.subscriptionManager.emit(`transaction:${transaction.destination}:submitted`, transaction);
            if (transaction.status === 'SUCCESS') {
              context.subscriptionManager.emit(`transaction:${transaction.destination}:confirmed`, transaction);
            }
          }
        }

        return transaction;
      } catch (error) {
        throw new Error(`Failed to swap assets: ${(error as Error).message}`);
      }
    },

    submitTransaction: async (
      _: any,
      { transactionEnvelope }: { transactionEnvelope: string },
      context: any
    ) => {
      try {
        const transaction = await context.dataSources.transactionService.submitTransaction(
          transactionEnvelope
        );

        // Generic event
        context.subscriptionManager.emit('transactionSubmitted', transaction);

        // Scoped emits
        if (transaction) {
          if (transaction.hash) {
            context.subscriptionManager.emit(`transaction:${transaction.hash}:status-changed`, transaction);
          }
          if (transaction.source) {
            context.subscriptionManager.emit(`transaction:${transaction.source}:submitted`, transaction);
            if (transaction.status === 'SUCCESS') {
              context.subscriptionManager.emit(`transaction:${transaction.source}:confirmed`, transaction);
            }
          }
          if (transaction.destination) {
            context.subscriptionManager.emit(`transaction:${transaction.destination}:submitted`, transaction);
            if (transaction.status === 'SUCCESS') {
              context.subscriptionManager.emit(`transaction:${transaction.destination}:confirmed`, transaction);
            }
          }
        }

        return transaction;
      } catch (error) {
        throw new Error(`Failed to submit transaction: ${(error as Error).message}`);
      }
    },
  },

  Subscription: {
    marketPriceUpdated: {
      subscribe: (_: any, { pair }: { pair: string }, context: any) => {
        return context.subscriptionManager.subscribe(`market:${pair}:price-updated`);
      },
      resolve: (payload: any) => payload,
    },

    marketVolume24hChanged: {
      subscribe: (_: any, { pair }: { pair: string }, context: any) => {
        return context.subscriptionManager.subscribe(`market:${pair}:volume-changed`);
      },
      resolve: (payload: any) => payload,
    },

    transactionStatusChanged: {
      subscribe: (_: any, { hash }: { hash: string }, context: any) => {
        return context.subscriptionManager.subscribe(`transaction:${hash}:status-changed`);
      },
      resolve: (payload: any) => payload,
    },

    transactionSubmitted: {
      subscribe: (_: any, { address }: { address?: string }, context: any) => {
        const channel = address ? `transaction:${address}:submitted` : 'transaction:submitted';
        return context.subscriptionManager.subscribe(channel);
      },
      resolve: (payload: any) => payload,
    },

    transactionConfirmed: {
      subscribe: (_: any, { address }: { address?: string }, context: any) => {
        const channel = address ? `transaction:${address}:confirmed` : 'transaction:confirmed';
        return context.subscriptionManager.subscribe(channel);
      },
      resolve: (payload: any) => payload,
    },
  },

  Market: {
    pair: (market: any) => {
      return {
        base: market.baseAsset,
        quote: market.quoteAsset,
      };
    },
  },

  TradingPair: {
    base: (pair: any) => pair.base || pair.baseAsset,
    quote: (pair: any) => pair.quote || pair.quoteAsset,
  },
};
