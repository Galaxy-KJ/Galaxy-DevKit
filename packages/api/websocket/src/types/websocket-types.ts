/**
 * WebSocket Event Types for Galaxy DevKit
 * 
 * This module defines all WebSocket event types using discriminated unions
 * for type safety and proper event handling.
 */

import { Socket } from 'socket.io';

/**
 * Base interface for all WebSocket events
 */
export interface BaseWebSocketEvent {
  /** Unique event identifier */
  id: string;
  /** Event timestamp */
  timestamp: number;
  /** Event source */
  source: 'galaxy-websocket';
}

/**
 * Market Data Events
 */
export interface MarketPriceUpdateEvent extends BaseWebSocketEvent {
  type: 'market:price_update';
  data: {
    /** Trading pair symbol (e.g., 'BTC/USDC') */
    pair: string;
    /** Current price */
    price: number;
    /** 24h volume */
    volume: number;
    /** Price change percentage */
    change24h: number;
    /** Market cap */
    marketCap?: number;
  };
}

export interface MarketOrderbookUpdateEvent extends BaseWebSocketEvent {
  type: 'market:orderbook_update';
  data: {
    /** Trading pair symbol */
    pair: string;
    /** Updated bids */
    bids: Array<[number, number]>;
    /** Updated asks */
    asks: Array<[number, number]>;
    /** Orderbook depth */
    depth: number;
  };
}

export interface MarketTradeEvent extends BaseWebSocketEvent {
  type: 'market:trade';
  data: {
    /** Trading pair symbol */
    pair: string;
    /** Trade price */
    price: number;
    /** Trade volume */
    volume: number;
    /** Trade side */
    side: 'buy' | 'sell';
    /** Trade timestamp */
    tradeTimestamp: number;
  };
}

/**
 * Transaction Events
 */
export interface TransactionPendingEvent extends BaseWebSocketEvent {
  type: 'transaction:pending';
  data: {
    /** Transaction hash */
    hash: string;
    /** User ID */
    userId: string;
    /** Wallet ID */
    walletId: string;
    /** From address */
    fromAddress: string;
    /** To address */
    toAddress: string;
    /** Amount */
    amount: number;
    /** Asset */
    asset: string;
    /** Network */
    network: 'testnet' | 'mainnet';
  };
}

export interface TransactionConfirmedEvent extends BaseWebSocketEvent {
  type: 'transaction:confirmed';
  data: {
    /** Transaction hash */
    hash: string;
    /** User ID */
    userId: string;
    /** Wallet ID */
    walletId: string;
    /** Confirmation timestamp */
    confirmedAt: number;
    /** Block number */
    blockNumber?: number;
    /** Gas used */
    gasUsed?: number;
  };
}

export interface TransactionFailedEvent extends BaseWebSocketEvent {
  type: 'transaction:failed';
  data: {
    /** Transaction hash */
    hash: string;
    /** User ID */
    userId: string;
    /** Wallet ID */
    walletId: string;
    /** Error message */
    error: string;
    /** Error code */
    errorCode?: string;
    /** Failed timestamp */
    failedAt: number;
  };
}

/**
 * Automation Events
 */
export interface AutomationTriggeredEvent extends BaseWebSocketEvent {
  type: 'automation:triggered';
  data: {
    /** Automation ID */
    automationId: string;
    /** User ID */
    userId: string;
    /** Wallet ID */
    walletId: string;
    /** Trigger condition */
    triggerCondition: string;
    /** Trigger data */
    triggerData: Record<string, unknown>;
  };
}

export interface AutomationExecutedEvent extends BaseWebSocketEvent {
  type: 'automation:executed';
  data: {
    /** Automation ID */
    automationId: string;
    /** User ID */
    userId: string;
    /** Wallet ID */
    walletId: string;
    /** Execution result */
    result: 'success' | 'failed';
    /** Execution timestamp */
    executedAt: number;
    /** Transaction hash if applicable */
    transactionHash?: string;
    /** Error message if failed */
    error?: string;
  };
}

export interface AutomationErrorEvent extends BaseWebSocketEvent {
  type: 'automation:error';
  data: {
    /** Automation ID */
    automationId: string;
    /** User ID */
    userId: string;
    /** Wallet ID */
    walletId: string;
    /** Error message */
    error: string;
    /** Error code */
    errorCode: string;
    /** Error timestamp */
    errorAt: number;
  };
}

/**
 * Wallet Events
 */
export interface WalletBalanceUpdatedEvent extends BaseWebSocketEvent {
  type: 'wallet:balance_updated';
  data: {
    /** Wallet ID */
    walletId: string;
    /** User ID */
    userId: string;
    /** Asset */
    asset: string;
    /** New balance */
    balance: number;
    /** Previous balance */
    previousBalance: number;
    /** Change amount */
    change: number;
  };
}

/**
 * System Events
 */
export interface SystemMaintenanceEvent extends BaseWebSocketEvent {
  type: 'system:maintenance';
  data: {
    /** Maintenance message */
    message: string;
    /** Maintenance start time */
    startTime: number;
    /** Maintenance end time */
    endTime: number;
    /** Affected services */
    affectedServices: string[];
  };
}

export interface SystemErrorEvent extends BaseWebSocketEvent {
  type: 'system:error';
  data: {
    /** Error message */
    message: string;
    /** Error code */
    code: string;
    /** Severity level */
    severity: 'low' | 'medium' | 'high' | 'critical';
  };
}

/**
 * Union type for all WebSocket events
 */
export type WebSocketEvent = 
  | MarketPriceUpdateEvent
  | MarketOrderbookUpdateEvent
  | MarketTradeEvent
  | TransactionPendingEvent
  | TransactionConfirmedEvent
  | TransactionFailedEvent
  | AutomationTriggeredEvent
  | AutomationExecutedEvent
  | AutomationErrorEvent
  | WalletBalanceUpdatedEvent
  | SystemMaintenanceEvent
  | SystemErrorEvent;

/**
 * Client Request Events
 */
export interface ClientAuthenticateRequest {
  type: 'authenticate';
  data: {
    /** JWT token */
    token: string;
  };
}

export interface ClientMarketSubscribeRequest {
  type: 'market:subscribe';
  data: {
    /** Trading pairs to subscribe to */
    pairs: string[];
  };
}

export interface ClientMarketUnsubscribeRequest {
  type: 'market:unsubscribe';
  data: {
    /** Trading pairs to unsubscribe from */
    pairs: string[];
  };
}

export interface ClientAutomationSubscribeRequest {
  type: 'automation:subscribe';
  data: {
    /** Automation IDs to subscribe to */
    automationIds: string[];
  };
}

export interface ClientAutomationEnableRequest {
  type: 'automation:enable';
  data: {
    /** Automation ID */
    automationId: string;
  };
}

export interface ClientAutomationDisableRequest {
  type: 'automation:disable';
  data: {
    /** Automation ID */
    automationId: string;
  };
}

/**
 * Union type for all client request events
 */
export type ClientRequestEvent = 
  | ClientAuthenticateRequest
  | ClientMarketSubscribeRequest
  | ClientMarketUnsubscribeRequest
  | ClientAutomationSubscribeRequest
  | ClientAutomationEnableRequest
  | ClientAutomationDisableRequest;

/**
 * Connection State Interface
 */
export interface ConnectionState {
  /** Socket ID */
  socketId: string;
  /** User ID (if authenticated) */
  userId?: string;
  /** Authentication status */
  isAuthenticated: boolean;
  /** Connected timestamp */
  connectedAt: number;
  /** Last activity timestamp */
  lastActivity: number;
  /** Subscribed rooms */
  rooms: Set<string>;
  /** Connection metadata */
  metadata: Record<string, unknown>;
}

/**
 * Room Types
 */
export type RoomType = 
  | 'public'      // Public market data
  | 'user'        // User-specific data
  | 'wallet'      // Wallet-specific data
  | 'automation'  // Automation-specific data
  | 'system';     // System-wide events

/**
 * Room Configuration
 */
export interface RoomConfig {
  /** Room name */
  name: string;
  /** Room type */
  type: RoomType;
  /** Whether authentication is required */
  requiresAuth: boolean;
  /** Maximum connections per room */
  maxConnections?: number;
  /** Room description */
  description?: string;
}

/**
 * Authentication Result
 */
export interface AuthenticationResult {
  /** Whether authentication was successful */
  success: boolean;
  /** User ID if successful */
  userId?: string;
  /** User email if successful */
  userEmail?: string;
  /** Error message if failed */
  error?: string;
  /** User permissions */
  permissions?: string[];
}

/**
 * Event Broadcaster Options
 */
export interface BroadcastOptions {
  /** Whether to include timestamp */
  includeTimestamp?: boolean;
  /** Whether to include source */
  includeSource?: boolean;
  /** Event priority */
  priority?: 'low' | 'normal' | 'high' | 'critical';
  /** Retry configuration */
  retry?: {
    /** Maximum retry attempts */
    maxAttempts: number;
    /** Retry delay in milliseconds */
    delay: number;
  };
}

/**
 * Room Statistics
 */
export interface RoomStats {
  /** Room name */
  roomName: string;
  /** Number of active connections */
  connectionCount: number;
  /** Room type */
  type: RoomType;
  /** Created timestamp */
  createdAt: number;
  /** Last activity timestamp */
  lastActivity: number;
}

/**
 * Extended Socket Interface
 */
export interface ExtendedSocket extends Socket {
  /** User ID if authenticated */
  userId?: string;
  /** Authentication status */
  isAuthenticated?: boolean;
  /** Connection state */
  connectionState?: ConnectionState;
  /** Subscribed rooms */
  subscribedRooms?: Set<string>;
}

/**
 * WebSocket Server Configuration
 */
export interface WebSocketServerConfig {
  /** Server port */
  port: number;
  /** CORS configuration */
  cors: {
    /** Allowed origins */
    origins: string[];
    /** Whether credentials are allowed */
    credentials: boolean;
  };
  /** Connection timeout in milliseconds */
  connectionTimeout: number;
  /** Maximum connections per user */
  maxConnectionsPerUser: number;
  /** Heartbeat interval in milliseconds */
  heartbeatInterval: number;
  /** Room cleanup interval in milliseconds */
  roomCleanupInterval: number;
}

/**
 * Error Types
 */
export class WebSocketError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400
  ) {
    super(message);
    this.name = 'WebSocketError';
  }
}

export class AuthenticationError extends WebSocketError {
  constructor(message: string = 'Authentication failed') {
    super(message, 'AUTH_ERROR', 401);
  }
}

export class RoomError extends WebSocketError {
  constructor(message: string = 'Room operation failed') {
    super(message, 'ROOM_ERROR', 400);
  }
}

export class BroadcastError extends WebSocketError {
  constructor(message: string = 'Broadcast failed') {
    super(message, 'BROADCAST_ERROR', 500);
  }
}
