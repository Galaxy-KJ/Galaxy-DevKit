/**
 * Automation Handler
 * 
 * This module handles automation rule events, triggers, executions,
 * and status updates for automated trading operations.
 */

import { Server, Socket } from 'socket.io';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ExtendedSocket, AutomationTriggeredEvent, AutomationExecutedEvent, AutomationErrorEvent } from '../types/websocket-types';
import { RoomManager } from '../services/room-manager';
import { EventBroadcaster } from '../services/event-broadcaster';
import { requireAuth } from '../middleware/auth';
import { config } from '../config';

/**
 * Automation Handler Class
 */
export class AutomationHandler {
  private server: Server;
  private roomManager: RoomManager;
  private eventBroadcaster: EventBroadcaster;
  private supabase: SupabaseClient;
  private automationSubscriptions = new Map<string, any>();
  private activeAutomations = new Map<string, any>();

  constructor(server: Server, roomManager: RoomManager, eventBroadcaster: EventBroadcaster) {
    this.server = server;
    this.roomManager = roomManager;
    this.eventBroadcaster = eventBroadcaster;
    this.supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);
    this.setupAutomationHandlers();
    this.setupSupabaseRealtime();
    this.startAutomationMonitoring();
  }

  /**
   * Setup automation event handlers
   */
  private setupAutomationHandlers(): void {
    this.server.on('connection', (socket: Socket) => {
      const extendedSocket = socket as ExtendedSocket;
      this.setupSocketAutomationHandlers(extendedSocket);
    });
  }

  /**
   * Setup socket-specific automation handlers
   * 
   * @param socket - Socket instance
   */
  private setupSocketAutomationHandlers(socket: ExtendedSocket): void {
    // Handle automation subscription
    requireAuth(socket, 'automation:subscribe', async (socket, ...args) => {
      const data = args[0] as { automationIds: string[] };
      await this.handleAutomationSubscription(socket, data);
    });

    // Handle automation unsubscription
    requireAuth(socket, 'automation:unsubscribe', async (socket, ...args) => {
      const data = args[0] as { automationIds: string[] };
      await this.handleAutomationUnsubscription(socket, data);
    });

    // Handle automation enable
    requireAuth(socket, 'automation:enable', async (socket, ...args) => {
      const data = args[0] as { automationId: string };
      await this.handleAutomationEnable(socket, data);
    });

    // Handle automation disable
    requireAuth(socket, 'automation:disable', async (socket, ...args) => {
      const data = args[0] as { automationId: string };
      await this.handleAutomationDisable(socket, data);
    });

    // Handle automation status request
    requireAuth(socket, 'automation:get_status', async (socket, ...args) => {
      const data = args[0] as { automationId: string };
      await this.handleAutomationStatusRequest(socket, data);
    });

    // Handle automation list request
    requireAuth(socket, 'automation:list', async (socket, ...args) => {
      const data = args[0] as { walletId?: string };
      await this.handleAutomationListRequest(socket, data);
    });
  }

  /**
   * Setup Supabase real-time subscriptions
   */
  private setupSupabaseRealtime(): void {
    // Subscribe to automation changes
    const automationChannel = this.supabase
      .channel('automations')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'automations'
        },
        (payload) => {
          this.handleAutomationChange(payload);
        }
      )
      .subscribe();

    console.log('Subscribed to Supabase automation changes');
  }

  /**
   * Start automation monitoring
   */
  private startAutomationMonitoring(): void {
    // Monitor automation triggers every 30 seconds
    setInterval(() => {
      this.checkAutomationTriggers();
    }, 30000);

    // Clean up inactive automations every 5 minutes
    setInterval(() => {
      this.cleanupInactiveAutomations();
    }, 300000);
  }

  /**
   * Handle automation subscription
   * 
   * @param socket - Socket instance
   * @param data - Subscription data
   */
  private async handleAutomationSubscription(socket: ExtendedSocket, data: { automationIds: string[] }): Promise<void> {
    try {
      if (!data.automationIds || !Array.isArray(data.automationIds)) {
        socket.emit('automation:subscription_error', {
          error: 'Invalid automation IDs array',
          timestamp: Date.now()
        });
        return;
      }

      const subscribedAutomations: string[] = [];

      for (const automationId of data.automationIds) {
        // Verify user owns the automation
        const hasAccess = await this.verifyAutomationAccess(socket.userId!, automationId);
        if (!hasAccess) {
          console.warn(`User ${socket.userId} attempted to subscribe to automation ${automationId} without access`);
          continue;
        }

        const roomName = `automation:${automationId}`;
        await this.roomManager.joinRoom(socket, roomName);
        subscribedAutomations.push(automationId);
      }

      socket.emit('automation:subscribed', {
        automationIds: subscribedAutomations,
        timestamp: Date.now()
      });

      console.log(`Socket ${socket.id} subscribed to automations: ${subscribedAutomations.join(', ')}`);

    } catch (error) {
      console.error(`Automation subscription failed for ${socket.id}:`, error);
      socket.emit('automation:subscription_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle automation unsubscription
   * 
   * @param socket - Socket instance
   * @param data - Unsubscription data
   */
  private async handleAutomationUnsubscription(socket: ExtendedSocket, data: { automationIds: string[] }): Promise<void> {
    try {
      if (!data.automationIds || !Array.isArray(data.automationIds)) {
        socket.emit('automation:unsubscription_error', {
          error: 'Invalid automation IDs array',
          timestamp: Date.now()
        });
        return;
      }

      const unsubscribedAutomations: string[] = [];

      for (const automationId of data.automationIds) {
        const roomName = `automation:${automationId}`;
        await this.roomManager.leaveRoom(socket, roomName);
        unsubscribedAutomations.push(automationId);
      }

      socket.emit('automation:unsubscribed', {
        automationIds: unsubscribedAutomations,
        timestamp: Date.now()
      });

      console.log(`Socket ${socket.id} unsubscribed from automations: ${unsubscribedAutomations.join(', ')}`);

    } catch (error) {
      console.error(`Automation unsubscription failed for ${socket.id}:`, error);
      socket.emit('automation:unsubscription_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle automation enable
   * 
   * @param socket - Socket instance
   * @param data - Enable data
   */
  private async handleAutomationEnable(socket: ExtendedSocket, data: { automationId: string }): Promise<void> {
    try {
      if (!data.automationId) {
        socket.emit('automation:enable_error', {
          error: 'Automation ID is required',
          timestamp: Date.now()
        });
        return;
      }

      // Verify user owns the automation
      const hasAccess = await this.verifyAutomationAccess(socket.userId!, data.automationId);
      if (!hasAccess) {
        socket.emit('automation:enable_error', {
          error: 'Access denied to automation',
          timestamp: Date.now()
        });
        return;
      }

      // Update automation status in database
      const { error } = await this.supabase
        .from('automations')
        .update({ status: 'active' })
        .eq('id', data.automationId)
        .eq('user_id', socket.userId);

      if (error) {
        socket.emit('automation:enable_error', {
          error: 'Failed to enable automation',
          timestamp: Date.now()
        });
        return;
      }

      socket.emit('automation:enabled', {
        automationId: data.automationId,
        timestamp: Date.now()
      });

      console.log(`Automation ${data.automationId} enabled by user ${socket.userId}`);

    } catch (error) {
      console.error(`Automation enable failed for ${socket.id}:`, error);
      socket.emit('automation:enable_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle automation disable
   * 
   * @param socket - Socket instance
   * @param data - Disable data
   */
  private async handleAutomationDisable(socket: ExtendedSocket, data: { automationId: string }): Promise<void> {
    try {
      if (!data.automationId) {
        socket.emit('automation:disable_error', {
          error: 'Automation ID is required',
          timestamp: Date.now()
        });
        return;
      }

      // Verify user owns the automation
      const hasAccess = await this.verifyAutomationAccess(socket.userId!, data.automationId);
      if (!hasAccess) {
        socket.emit('automation:disable_error', {
          error: 'Access denied to automation',
          timestamp: Date.now()
        });
        return;
      }

      // Update automation status in database
      const { error } = await this.supabase
        .from('automations')
        .update({ status: 'paused' })
        .eq('id', data.automationId)
        .eq('user_id', socket.userId);

      if (error) {
        socket.emit('automation:disable_error', {
          error: 'Failed to disable automation',
          timestamp: Date.now()
        });
        return;
      }

      socket.emit('automation:disabled', {
        automationId: data.automationId,
        timestamp: Date.now()
      });

      console.log(`Automation ${data.automationId} disabled by user ${socket.userId}`);

    } catch (error) {
      console.error(`Automation disable failed for ${socket.id}:`, error);
      socket.emit('automation:disable_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle automation status request
   * 
   * @param socket - Socket instance
   * @param data - Status request data
   */
  private async handleAutomationStatusRequest(socket: ExtendedSocket, data: { automationId: string }): Promise<void> {
    try {
      if (!data.automationId) {
        socket.emit('automation:status_error', {
          error: 'Automation ID is required',
          timestamp: Date.now()
        });
        return;
      }

      // Get automation from database
      const { data: automation, error } = await this.supabase
        .from('automations')
        .select('*')
        .eq('id', data.automationId)
        .eq('user_id', socket.userId)
        .single();

      if (error || !automation) {
        socket.emit('automation:status_error', {
          error: 'Automation not found',
          timestamp: Date.now()
        });
        return;
      }

      socket.emit('automation:status', {
        automationId: automation.id,
        name: automation.name,
        status: automation.status,
        triggerConditions: automation.trigger_conditions,
        actionConfig: automation.action_config,
        lastExecutedAt: automation.last_executed_at,
        createdAt: automation.created_at,
        timestamp: Date.now()
      });

      console.log(`Sent automation status for ${data.automationId} to ${socket.id}`);

    } catch (error) {
      console.error(`Automation status request failed for ${socket.id}:`, error);
      socket.emit('automation:status_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle automation list request
   * 
   * @param socket - Socket instance
   * @param data - List request data
   */
  private async handleAutomationListRequest(socket: ExtendedSocket, data: { walletId?: string }): Promise<void> {
    try {
      let query = this.supabase
        .from('automations')
        .select('*')
        .eq('user_id', socket.userId);

      if (data.walletId) {
        query = query.eq('wallet_id', data.walletId);
      }

      const { data: automations, error } = await query.order('created_at', { ascending: false });

      if (error) {
        socket.emit('automation:list_error', {
          error: 'Failed to fetch automations',
          timestamp: Date.now()
        });
        return;
      }

      socket.emit('automation:list', {
        automations: automations || [],
        walletId: data.walletId,
        timestamp: Date.now()
      });

      console.log(`Sent automation list to ${socket.id}`);

    } catch (error) {
      console.error(`Automation list request failed for ${socket.id}:`, error);
      socket.emit('automation:list_error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle automation changes from Supabase
   * 
   * @param payload - Supabase change payload
   */
  private async handleAutomationChange(payload: any): Promise<void> {
    try {
      const { eventType, new: newRecord, old: oldRecord } = payload;

      if (!newRecord && !oldRecord) {
        return;
      }

      const automation = newRecord || oldRecord;
      const userId = automation.user_id;
      const automationId = automation.id;

      // Create appropriate event based on change
      let event: AutomationTriggeredEvent | AutomationExecutedEvent | AutomationErrorEvent | undefined;

      if (eventType === 'INSERT') {
        // New automation created
        return; // No event needed for creation
      } else if (eventType === 'UPDATE') {
        // Check if status changed
        if (newRecord.status !== oldRecord.status) {
          if (newRecord.status === 'active') {
            // Automation activated
            this.activeAutomations.set(automationId, automation);
          } else if (newRecord.status === 'paused') {
            // Automation paused
            this.activeAutomations.delete(automationId);
          }
        }

        // Check if last_executed_at changed (execution occurred)
        if (newRecord.last_executed_at !== oldRecord.last_executed_at) {
          event = {
            id: `automation-executed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: Date.now(),
            source: 'galaxy-websocket',
            type: 'automation:executed',
            data: {
              automationId,
              userId,
              walletId: automation.wallet_id,
              result: 'success', // TODO: Determine actual result
              executedAt: Date.now()
            }
          };
        }
      }

      if (event) {
        // Broadcast to user-specific room
        await this.eventBroadcaster.broadcastToUser(userId, event);

        // Broadcast to automation-specific room
        const automationRoomName = `automation:${automationId}`;
        await this.eventBroadcaster.broadcastToRoom(automationRoomName, event);

        console.log(`Broadcasted automation ${event.type} for ${automationId}`);
      }

    } catch (error) {
      console.error('Failed to handle automation change:', error);
    }
  }

  /**
   * Check automation triggers
   */
  private async checkAutomationTriggers(): Promise<void> {
    try {
      // Get all active automations
      const { data: automations, error } = await this.supabase
        .from('automations')
        .select('*')
        .eq('status', 'active');

      if (error || !automations) {
        return;
      }

      for (const automation of automations) {
        try {
          // Check if automation should trigger
          const shouldTrigger = await this.evaluateTriggerConditions(automation);
          
          if (shouldTrigger) {
            await this.triggerAutomation(automation);
          }
        } catch (error) {
          console.error(`Failed to check triggers for automation ${automation.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to check automation triggers:', error);
    }
  }

  /**
   * Evaluate trigger conditions for an automation
   * 
   * @param automation - Automation object
   * @returns Promise<boolean> - Whether automation should trigger
   */
  private async evaluateTriggerConditions(automation: any): Promise<boolean> {
    // TODO: Implement actual trigger condition evaluation
    // This is a placeholder that randomly triggers automations
    return Math.random() < 0.1; // 10% chance to trigger
  }

  /**
   * Trigger an automation
   * 
   * @param automation - Automation object
   */
  private async triggerAutomation(automation: any): Promise<void> {
    try {
      // Create trigger event
      const event: AutomationTriggeredEvent = {
        id: `automation-triggered-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        source: 'galaxy-websocket',
        type: 'automation:triggered',
        data: {
          automationId: automation.id,
          userId: automation.user_id,
          walletId: automation.wallet_id,
          triggerCondition: JSON.stringify(automation.trigger_conditions),
          triggerData: {}
        }
      };

      // Broadcast trigger event
      await this.eventBroadcaster.broadcastToUser(automation.user_id, event);
      await this.eventBroadcaster.broadcastToRoom(`automation:${automation.id}`, event);

      // Simulate execution
      setTimeout(async () => {
        await this.simulateAutomationExecution(automation);
      }, 1000);

      console.log(`Triggered automation ${automation.id}`);

    } catch (error) {
      console.error(`Failed to trigger automation ${automation.id}:`, error);
    }
  }

  /**
   * Simulate automation execution
   * 
   * @param automation - Automation object
   */
  private async simulateAutomationExecution(automation: any): Promise<void> {
    try {
      const success = Math.random() > 0.2; // 80% success rate

      const event: AutomationExecutedEvent = {
        id: `automation-executed-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: Date.now(),
        source: 'galaxy-websocket',
        type: 'automation:executed',
        data: {
          automationId: automation.id,
          userId: automation.user_id,
          walletId: automation.wallet_id,
          result: success ? 'success' : 'failed',
          executedAt: Date.now(),
          transactionHash: success ? `tx_${Math.random().toString(36).substr(2, 9)}` : undefined,
          error: success ? undefined : 'Simulated execution failure'
        }
      };

      // Broadcast execution event
      await this.eventBroadcaster.broadcastToUser(automation.user_id, event);
      await this.eventBroadcaster.broadcastToRoom(`automation:${automation.id}`, event);

      // Update last executed timestamp
      await this.supabase
        .from('automations')
        .update({ last_executed_at: new Date().toISOString() })
        .eq('id', automation.id);

      console.log(`Executed automation ${automation.id} (${success ? 'success' : 'failed'})`);

    } catch (error) {
      console.error(`Failed to simulate execution for automation ${automation.id}:`, error);
    }
  }

  /**
   * Cleanup inactive automations
   */
  private cleanupInactiveAutomations(): void {
    // Remove automations that haven't been active for 1 hour
    const oneHourAgo = Date.now() - 3600000;
    
    for (const [automationId, automation] of this.activeAutomations.entries()) {
      if (automation.lastActivity < oneHourAgo) {
        this.activeAutomations.delete(automationId);
      }
    }
  }

  /**
   * Verify automation access for user
   * 
   * @param userId - User ID
   * @param automationId - Automation ID
   * @returns Promise<boolean> - Whether user has access
   */
  private async verifyAutomationAccess(userId: string, automationId: string): Promise<boolean> {
    try {
      const { data, error } = await this.supabase
        .from('automations')
        .select('id')
        .eq('id', automationId)
        .eq('user_id', userId)
        .single();

      return !error && !!data;
    } catch {
      return false;
    }
  }

  /**
   * Get automation statistics
   * 
   * @returns Object - Automation statistics
   */
  public getAutomationStats(): {
    totalSubscriptions: number;
    activeAutomations: number;
    totalAutomations: number;
  } {
    return {
      totalSubscriptions: this.automationSubscriptions.size,
      activeAutomations: this.activeAutomations.size,
      totalAutomations: 0 // TODO: Implement total automation count
    };
  }

  /**
   * Cleanup automation handler
   */
  public cleanup(): void {
    // Unsubscribe from Supabase real-time
    this.supabase.removeAllChannels();
    
    // Clear local data
    this.automationSubscriptions.clear();
    this.activeAutomations.clear();
  }
}
