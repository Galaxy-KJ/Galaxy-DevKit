import { gql } from 'apollo-server-express';

/**
 * GraphQL Subscription Definitions
 * Defines all real-time event subscriptions for the Galaxy API
 */
export const subscriptionTypeDefs = gql`
  type Subscription {
    # Wallet Subscriptions
    walletUpdated(address: String!): WalletUpdateEvent!
    walletBalanceChanged(address: String!): WalletUpdateEvent!
    walletActivityNotification(address: String!): JSON!

    # Transaction Subscriptions
    transactionStatusChanged(hash: String!): TransactionEvent!
    transactionSubmitted(address: String): TransactionEvent!
    transactionConfirmed(address: String): TransactionEvent!

    # Market Subscriptions
    marketPriceUpdated(pair: String!): MarketUpdateEvent!
    marketVolume24hChanged(pair: String!): MarketUpdateEvent!

    # Automation Subscriptions
    automationExecuted(automationId: ID!): AutomationExecutionEvent!
    automationTriggered(automationId: ID!): AutomationExecutionEvent!
    automationStatusChanged(automationId: ID!): Automation!

    # Network Subscriptions
    networkStatusChanged: JSON!
    networkFeeUpdated: JSON!

    # Generic Event Subscription
    eventStream(
      types: [String!]
      filter: JSON
    ): JSON!
  }
`;
