/**
 * Transaction Handler
 * 
 * This module handles transaction status updates, confirmations,
 * and failures by listening to Supabase real-time changes.
 */

import { Server, Socket } from 'socket.io';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ExtendedSocket, TransactionPendingEvent, TransactionConfirmedEvent, TransactionFailedEvent } from '../types/websocket-types';
import { RoomManager } from '../services/room-manager';
import { EventBroadcaster } from '../services/event-broadcaster';
import { config } from '../config';

/**
 * Transaction Handler Class
 */
export class TransactionHandler {
  private server: Server;
  private roomManager: RoomManager;
  private eventBroadcaster: EventBroadcaster;
  private supabase: SupabaseClient;
  private transactionSubscriptions = new Map<string, any>();

  constructor(server: Server, roomManager: RoomManager, eventBroadcaster: EventBroadcaster) {
    this.server = server;
    this.roomManager = roomManager;
    this.eventBroadcaster = eventBroadcaster;
    this.supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);
    this.setupTransactionHandlers();
    this.setupSupabaseRealtime();
  }

  /**
   * Setup transaction event handlers
   */
  private setupTransactionHandlers(): void {
    this.server.on('connection', (socket: Socket) => {
      const extendedSocket = socket as ExtendedSocket;
      this.setupSocketTransactionHandlers(extendedSocket);
    });
  }

  /**
   * Setup socket-specific transaction handlers
   * 
   * @param socket - Socket instance
   */
  private setupSocketTransactionHandlers(socket: ExtendedSocket): void {
    // Handle transaction subscription
    socket.on('transaction:subscribe', async (data: { walletId: string }) => {
      await this.handleTransactionSubscription(socket, data);
    });

    // Handle transaction unsubscription
    socket.on('transaction:unsubscribe', async (data: { walletId: string }) => {
      await this.handleTransactionUnsubscription(socket, data);
    });

    // Handle transaction status request
    socket.on('transaction:get_status', async (data: { hash: string }) => {
      await this.handleTransactionStatusRequest(socket, data);
    });

    // Handle transaction history request
    socket.on('transaction:get_history', async (data: { walletId: string, limit?: number }) => {
      await this.handleTransactionHistoryRequest(socket, data);
    });
  }

  /**
   * Setup Supabase real-time subscriptions
   */
  private setupSupabaseRealtime(): void {
    // Subscribe to transaction changes
    const transactionChannel = this.supabase
      .channel('transactions')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions'
        },
        (payload) => {
          this.handleTransactionChange(payload);
        }
      )
      .subscribe();

    console.log('Subscribed to Supabase transaction changes');
  }

  /**
   * Handle transaction subscription
   * 
   * @param socket - Socket instance
   * @param data - Subscription data
   */
  private async handleTransactionSubscription(socket: ExtendedSocket, data: { walletId: string }): Promise<void> {
    try {
      if (!socket.isAuthenticated || !socket.userId) {
        socket.emit('transaction:subscription_error', {
          error: 'Authentication required',
          timestamp: Date.now()
        });
        return;
      }

      if (!data.walletId) {
        socket.emit('transaction:subscription_error', {
          error: 'Wallet ID is required',
          timestamp: Date.now()
        });
        return;
      }

      // Verify user owns the wallet
      const hasAccess = await this.verifyWalletAccess(socket.userId, data.walletId);
      if (!hasAccess) {
        socket.emit('transaction:subscription_error', {
          error: 'Access denied to wallet',
          timestamp: Date.now()
        });
        return;
      }

      const roomName = `wallet:${data.walletId}`;
      await this.roomManager.joinRoom(socket, roomName);

      socket.emit('transaction:subscribed', {
        walletId: data.walletId,
        timestamp: Date.now()
      });

      console.log(`Socket ${socket.id} subscribed to transactions for wallet ${data.walletId}`);

    } catch (error) {
      console.error(`Transaction subscription failed for ${socket.id}:`, error);
      socket.emit('transaction:subscription_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle transaction unsubscription
   * 
   * @param socket - Socket instance
   * @param data - Unsubscription data
   */
  private async handleTransactionUnsubscription(socket: ExtendedSocket, data: { walletId: string }): Promise<void> {
    try {
      if (!data.walletId) {
        socket.emit('transaction:unsubscription_error', {
          error: 'Wallet ID is required',
          timestamp: Date.now()
        });
        return;
      }

      const roomName = `wallet:${data.walletId}`;
      await this.roomManager.leaveRoom(socket, roomName);

      socket.emit('transaction:unsubscribed', {
        walletId: data.walletId,
        timestamp: Date.now()
      });

      console.log(`Socket ${socket.id} unsubscribed from transactions for wallet ${data.walletId}`);

    } catch (error) {
      console.error(`Transaction unsubscription failed for ${socket.id}:`, error);
      socket.emit('transaction:unsubscription_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle transaction status request
   * 
   * @param socket - Socket instance
   * @param data - Status request data
   */
  private async handleTransactionStatusRequest(socket: ExtendedSocket, data: { hash: string }): Promise<void> {
    try {
      if (!data.hash) {
        socket.emit('transaction:status_error', {
          error: 'Transaction hash is required',
          timestamp: Date.now()
        });
        return;
      }

      // Get transaction from database
      const { data: transaction, error } = await this.supabase
        .from('transactions')
        .select('*')
        .eq('hash', data.hash)
        .single();

      if (error || !transaction) {
        socket.emit('transaction:status_error', {
          error: 'Transaction not found',
          timestamp: Date.now()
        });
        return;
      }

      // Check if user has access to this transaction
      if (socket.userId && transaction.user_id !== socket.userId) {
        socket.emit('transaction:status_error', {
          error: 'Access denied',
          timestamp: Date.now()
        });
        return;
      }

      socket.emit('transaction:status', {
        hash: transaction.hash,
        status: transaction.status,
        fromAddress: transaction.from_address,
        toAddress: transaction.to_address,
        amount: transaction.amount,
        asset: transaction.asset,
        network: transaction.network,
        createdAt: transaction.created_at,
        timestamp: Date.now()
      });

      console.log(`Sent transaction status for ${data.hash} to ${socket.id}`);

    } catch (error) {
      console.error(`Transaction status request failed for ${socket.id}:`, error);
      socket.emit('transaction:status_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle transaction history request
   * 
   * @param socket - Socket instance
   * @param data - History request data
   */
  private async handleTransactionHistoryRequest(socket: ExtendedSocket, data: { walletId: string, limit?: number }): Promise<void> {
    try {
      if (!socket.isAuthenticated || !socket.userId) {
        socket.emit('transaction:history_error', {
          error: 'Authentication required',
          timestamp: Date.now()
        });
        return;
      }

      if (!data.walletId) {
        socket.emit('transaction:history_error', {
          error: 'Wallet ID is required',
          timestamp: Date.now()
        });
        return;
      }

      // Verify user owns the wallet
      const hasAccess = await this.verifyWalletAccess(socket.userId, data.walletId);
      if (!hasAccess) {
        socket.emit('transaction:history_error', {
          error: 'Access denied to wallet',
          timestamp: Date.now()
        });
        return;
      }

      const limit = data.limit || 50;

      // Get transaction history
      const { data: transactions, error } = await this.supabase
        .from('transactions')
        .select('*')
        .eq('wallet_id', data.walletId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        socket.emit('transaction:history_error', {
          error: 'Failed to fetch transaction history',
          timestamp: Date.now()
        });
        return;
      }

      socket.emit('transaction:history', {
        walletId: data.walletId,
        transactions: transactions || [],
        limit,
        timestamp: Date.now()
      });

      console.log(`Sent transaction history for wallet ${data.walletId} to ${socket.id}`);

    } catch (error) {
      console.error(`Transaction history request failed for ${socket.id}:`, error);
      socket.emit('transaction:history_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle transaction changes from Supabase
   * 
   * @param payload - Supabase change payload
   */
  private async handleTransactionChange(payload: any): Promise<void> {
    try {
      const { eventType, new: newRecord, old: oldRecord } = payload;

      if (!newRecord && !oldRecord) {
        return;
      }

      const transaction = newRecord || oldRecord;
      const userId = transaction.user_id;
      const walletId = transaction.wallet_id;

      // Create appropriate event based on status
      let event: TransactionPendingEvent | TransactionConfirmedEvent | TransactionFailedEvent;

      if (eventType === 'INSERT' || transaction.status === 'pending') {
        event = {
          id: `transaction-pending-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
          source: 'galaxy-websocket',
          type: 'transaction:pending',
          data: {
            hash: transaction.hash,
            userId,
            walletId,
            fromAddress: transaction.from_address,
            toAddress: transaction.to_address,
            amount: transaction.amount,
            asset: transaction.asset,
            network: transaction.network
          }
        };
      } else if (transaction.status === 'confirmed') {
        event = {
          id: `transaction-confirmed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
          source: 'galaxy-websocket',
          type: 'transaction:confirmed',
          data: {
            hash: transaction.hash,
            userId,
            walletId,
            confirmedAt: Date.now(),
            blockNumber: transaction.metadata?.blockNumber,
            gasUsed: transaction.metadata?.gasUsed
          }
        };
      } else if (transaction.status === 'failed') {
        event = {
          id: `transaction-failed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: Date.now(),
          source: 'galaxy-websocket',
          type: 'transaction:failed',
          data: {
            hash: transaction.hash,
            userId,
            walletId,
            error: transaction.metadata?.error || 'Transaction failed',
            errorCode: transaction.metadata?.errorCode,
            failedAt: Date.now()
          }
        };
      } else {
        return; // Unknown status
      }

      // Broadcast to user-specific room
      await this.eventBroadcaster.broadcastToUser(userId, event);

      // Broadcast to wallet-specific room
      const walletRoomName = `wallet:${walletId}`;
      await this.eventBroadcaster.broadcastToRoom(walletRoomName, event);

      console.log(`Broadcasted transaction ${event.type} for ${transaction.hash}`);

    } catch (error) {
      console.error('Failed to handle transaction change:', error);
    }
  }

  /**
   * Verify wallet access for user
   * 
   * @param userId - User ID
   * @param walletId - Wallet ID
   * @returns Promise<boolean> - Whether user has access
   */
  private async verifyWalletAccess(userId: string, walletId: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('wallets')
        .select('id')
        .eq('id', walletId)
        .eq('user_id', userId)
        .single();

      return !error && !!data;
    } catch {
      return false;
    }
  }

  /**
   * Get transaction statistics
   * 
   * @returns Object - Transaction statistics
   */
  public getTransactionStats(): {
    totalSubscriptions: number;
    activeTransactions: number;
  } {
    return {
      totalSubscriptions: this.transactionSubscriptions.size,
      activeTransactions: 0 // TODO: Implement active transaction tracking
    };
  }

  /**
   * Cleanup transaction subscriptions
   */
  public cleanup(): void {
    // Unsubscribe from Supabase real-time
    this.supabase.removeAllChannels();
    
    // Clear local subscriptions
    this.transactionSubscriptions.clear();
  }
}
