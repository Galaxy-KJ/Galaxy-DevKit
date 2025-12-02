import { gql } from 'apollo-server-express';

/**
 * GraphQL Type Definitions
 * Defines all scalar, object, and interface types for the Galaxy API
 */
export const typeDefs = gql`
  scalar DateTime
  scalar JSON
  scalar BigInt

  # Wallet Types
  type Wallet {
    id: ID!
    address: String!
    publicKey: String!
    type: WalletType!
    name: String
    balance: Balance!
    nativeBalance: String!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  enum WalletType {
    KEYPAIR
    LEDGER
    FREIGHTER
    ALBEDO
    XBULL
    HARDWARE
  }

  type Balance {
    native: String!
    assets: [AssetBalance!]!
  }

  type AssetBalance {
    code: String!
    issuer: String!
    balance: String!
    limit: String
  }

  # Contract Types
  type Contract {
    id: ID!
    address: String!
    name: String!
    description: String
    language: ContractLanguage!
    version: String!
    status: ContractStatus!
    owner: String!
    deployedAt: DateTime!
    updatedAt: DateTime!
    metadata: JSON
    functions: [ContractFunction!]!
  }

  enum ContractLanguage {
    RUST
    JAVASCRIPT
    PYTHON
    SOLIDITY
  }

  enum ContractStatus {
    DRAFT
    TESTING
    DEPLOYED
    SUSPENDED
    ARCHIVED
  }

  type ContractFunction {
    name: String!
    description: String
    inputs: [ContractParameter!]!
    output: String
    isPure: Boolean!
    isPayable: Boolean!
  }

  type ContractParameter {
    name: String!
    type: String!
    description: String
    isOptional: Boolean!
  }

  # Automation Types
  type Automation {
    id: ID!
    name: String!
    description: String
    trigger: Trigger!
    actions: [Action!]!
    enabled: Boolean!
    owner: String!
    createdAt: DateTime!
    updatedAt: DateTime!
    lastExecutedAt: DateTime
    executionCount: Int!
    status: AutomationStatus!
  }

  enum AutomationStatus {
    ACTIVE
    PAUSED
    FAILED
    COMPLETED
    ARCHIVED
  }

  type Trigger {
    type: TriggerType!
    condition: JSON!
    frequency: String
  }

  enum TriggerType {
    PRICE_CHANGE
    BALANCE_THRESHOLD
    TIME_BASED
    EVENT_BASED
    CUSTOM
  }

  type Action {
    type: ActionType!
    parameters: JSON!
    description: String
  }

  enum ActionType {
    SEND_PAYMENT
    EXECUTE_CONTRACT
    SWAP_ASSETS
    SET_OFFER
    SEND_NOTIFICATION
    WEBHOOK
  }

  # Market Types
  type Market {
    id: ID!
    pair: TradingPair!
    price: String!
    volume24h: String!
    marketCap: String
    change24h: Float!
    high24h: String!
    low24h: String!
    lastUpdated: DateTime!
  }

  type TradingPair {
    base: Asset!
    quote: Asset!
  }

  type Asset {
    code: String!
    issuer: String
    name: String
    domain: String
  }

  # Transaction Types
  type Transaction {
    id: ID!
    hash: String!
    source: String!
    destination: String
    type: TransactionType!
    amount: String
    asset: Asset
    fee: String!
    status: TransactionStatus!
    createdAt: DateTime!
    memo: String
    ledgerSequence: Int!
  }

  enum TransactionType {
    PAYMENT
    PATH_PAYMENT
    OFFER
    MANAGE_OFFER
    CREATE_ACCOUNT
    CHANGE_TRUST
    ALLOW_TRUST
    ACCOUNT_MERGE
    MANAGE_DATA
    BUMP_SEQUENCE
    CONTRACT_INVOKE
    SWAP
  }

  enum TransactionStatus {
    PENDING
    SUCCESS
    FAILED
    SUBMITTED
  }

  # Query Results
  type QueryResult {
    id: ID!
    query: String!
    result: JSON!
    executedAt: DateTime!
    duration: Int!
  }

  # Pagination
  type PageInfo {
    hasNextPage: Boolean!
    hasPreviousPage: Boolean!
    startCursor: String
    endCursor: String
  }

  type WalletConnection {
    edges: [WalletEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type WalletEdge {
    node: Wallet!
    cursor: String!
  }

  type ContractConnection {
    edges: [ContractEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type ContractEdge {
    node: Contract!
    cursor: String!
  }

  type TransactionConnection {
    edges: [TransactionEdge!]!
    pageInfo: PageInfo!
    totalCount: Int!
  }

  type TransactionEdge {
    node: Transaction!
    cursor: String!
  }

  # Error Type
  type Error {
    code: String!
    message: String!
    details: JSON
  }

  union Result = Wallet | Contract | Transaction | Error

  # Subscription Event Types
  type WalletUpdateEvent {
    wallet: Wallet!
    eventType: String!
    timestamp: DateTime!
  }

  type TransactionEvent {
    transaction: Transaction!
    status: TransactionStatus!
    timestamp: DateTime!
  }

  type MarketUpdateEvent {
    market: Market!
    previousPrice: String!
    timestamp: DateTime!
  }

  type AutomationExecutionEvent {
    automation: Automation!
    result: JSON!
    timestamp: DateTime!
  }
`;
