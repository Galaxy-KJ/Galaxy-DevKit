/**
 * Core types for the automation engine - Stellar SDK
 */

export enum AutomationStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  DISABLED = 'DISABLED',
  ERROR = 'ERROR',
}

export enum ConditionOperator {
  GREATER_THAN = 'GT',
  LESS_THAN = 'LT',
  GREATER_THAN_OR_EQUAL = 'GTE',
  LESS_THAN_OR_EQUAL = 'LTE',
  EQUAL = 'EQ',
  NOT_EQUAL = 'NEQ',
  BETWEEN = 'BETWEEN',
  NOT_BETWEEN = 'NOT_BETWEEN',
}

export enum ConditionLogic {
  AND = 'AND',
  OR = 'OR',
}

export enum ExecutionType {
  STELLAR_PAYMENT = 'STELLAR_PAYMENT',
  STELLAR_SWAP = 'STELLAR_SWAP',
  STELLAR_CONTRACT = 'STELLAR_CONTRACT',
  DEX_TRADE = 'DEX_TRADE',
  NOTIFICATION = 'NOTIFICATION',
  WEBHOOK = 'WEBHOOK',
}

export enum TriggerType {
  CRON = 'CRON',
  EVENT = 'EVENT',
  PRICE = 'PRICE',
  VOLUME = 'VOLUME',
  CUSTOM = 'CUSTOM',
}

export interface Condition {
  id: string;
  field: string;
  operator: ConditionOperator;
  value: number | string | boolean;
  value2?: number | string; // For BETWEEN operations
}

export interface ConditionGroup {
  logic: ConditionLogic;
  conditions: Condition[];
  groups?: ConditionGroup[];
}

export interface AutomationRule {
  id: string;
  name: string;
  description?: string;
  userId: string;
  status: AutomationStatus;
  triggerType: TriggerType;
  cronExpression?: string; // For CRON triggers
  conditionGroup: ConditionGroup;
  executionType: ExecutionType;
  executionConfig: ExecutionConfig;
  createdAt: Date;
  updatedAt: Date;
  lastExecuted?: Date;
  executionCount: number;
  failureCount: number;
  maxExecutions?: number;
  expiresAt?: Date;
}

export interface ExecutionConfig {
  // Stellar Payment
  paymentConfig?: StellarPaymentConfig;

  // Stellar Swap (Path Payment)
  swapConfig?: StellarSwapConfig;

  // Stellar Smart Contract (Soroban)
  contractConfig?: StellarContractConfig;

  // DEX Trade
  tradeConfig?: DexTradeConfig;

  // Webhook
  webhookUrl?: string;
  webhookHeaders?: Record<string, string>;

  // Notifications
  notificationConfig?: NotificationConfig;

  // Retry configuration
  retryAttempts?: number;
  retryDelay?: number; // milliseconds

  // Stellar-specific
  baseFee?: string;
  timeout?: number;
  memo?: string;
  memoType?: 'text' | 'id' | 'hash' | 'return';
}

export interface StellarPaymentConfig {
  destination: string;
  asset: {
    code?: string; // For non-native assets
    issuer?: string; // For non-native assets
  };
  amount: string;
  createAccount?: boolean; // For new accounts
}

export interface StellarSwapConfig {
  destinationAsset: {
    code?: string;
    issuer?: string;
  };
  destinationAmount: string;
  destinationAccount: string;
  sendAsset: {
    code?: string;
    issuer?: string;
  };
  sendMax: string;
  path?: Array<{
    code?: string;
    issuer?: string;
  }>;
}

export interface StellarContractConfig {
  contractId: string;
  method: string;
  params?: any[];
  auth?: boolean;
}

export interface DexTradeConfig {
  pair: string; // e.g., "XLM/USDC"
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT';
  amount: string;
  price?: string; // For limit orders
  selling: {
    code?: string;
    issuer?: string;
  };
  buying: {
    code?: string;
    issuer?: string;
  };
}

export interface NotificationConfig {
  channels: ('EMAIL' | 'SMS' | 'PUSH' | 'WEBHOOK')[];
  message: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
}

export interface ExecutionContext {
  ruleId: string;
  userId: string;
  timestamp: Date;
  marketData?: Record<string, any>;
  accountData?: {
    balance?: string;
    sequence?: string;
    xlmBalance?: string;
    assets?: Array<{
      code: string;
      issuer: string;
      balance: string;
    }>;
  };
  stellarData?: {
    lastLedger?: number;
    networkPassphrase?: string;
  };
  customData?: Record<string, any>;
}

export interface ExecutionResult {
  ruleId: string;
  executionId: string;
  success: boolean;
  timestamp: Date;
  duration: number; // milliseconds
  error?: Error;
  result?: any;
  transactionHash?: string;
  ledger?: number;
  retryCount?: number;
  stellarResult?: {
    hash: string;
    ledger: number;
    envelope_xdr: string;
    result_xdr: string;
    result_meta_xdr: string;
  };
}

export interface AutomationMetrics {
  ruleId: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  lastExecutionTime?: Date;
  lastSuccess?: Date;
  lastFailure?: Date;
  successRate: number;
  totalFeesSpent?: string; // in XLM
}

export interface CronJob {
  id: string;
  ruleId: string;
  expression: string;
  nextRun: Date;
  lastRun?: Date;
  isRunning: boolean;
}

export interface AutomationError extends Error {
  code: string;
  ruleId: string;
  context?: Record<string, any>;
  recoverable: boolean;
  stellarError?: any;
}

export interface StellarNetwork {
  type: 'PUBLIC' | 'TESTNET' | 'FUTURENET' | 'STANDALONE';
  horizonUrl: string;
  networkPassphrase: string;
}
