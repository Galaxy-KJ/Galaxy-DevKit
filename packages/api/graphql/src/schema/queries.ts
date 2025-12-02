import { gql } from 'apollo-server-express';

/**
 * GraphQL Query Definitions
 * Defines all read operations for the Galaxy API
 */
export const queryTypeDefs = gql`
  type Query {
    # Wallet Queries
    wallet(id: ID!): Wallet
    walletByAddress(address: String!): Wallet
    wallets(first: Int, after: String): WalletConnection!
    walletBalance(address: String!): Balance!
    walletAssets(address: String!): [AssetBalance!]!

    # Contract Queries
    contract(id: ID!): Contract
    contractByAddress(address: String!): Contract
    contracts(first: Int, after: String, language: ContractLanguage): ContractConnection!
    contractFunctions(contractId: ID!): [ContractFunction!]!

    # Market Queries
    market(pair: String!): Market
    markets(first: Int, after: String): [Market!]!
    marketHistory(pair: String!, resolution: String, limit: Int): [Market!]!

    # Transaction Queries
    transaction(hash: String!): Transaction
    transactions(
      address: String
      first: Int
      after: String
      status: TransactionStatus
    ): TransactionConnection!
    transactionsByContract(contractId: ID!, first: Int, after: String): TransactionConnection!

    # Automation Queries
    automation(id: ID!): Automation
    automations(first: Int, after: String, status: AutomationStatus): [Automation!]!
    automationExecutionHistory(id: ID!, first: Int): [JSON!]!

    # Utility Queries
    health: JSON!
    networkStatus: JSON!
    gasPrice: String!
    networkFees: JSON!
  }
`;
