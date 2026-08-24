/**
 * Automation Handler
 *
 * Polls persisted automations, evaluates real trigger_conditions, and executes
 * via AutomationService / ExecutionEngine (build → sign → submit).
 *
 * Idempotency:
 * - `isPolling` plus schedule-next-after-complete prevent overlapping ticks.
 * - Per-automation `pending → executing → submitted → resolved|failed` claims
 *   (in memory + `automation_execution_attempts`) block duplicate submits.
 * - A submitted row that already has `transaction_hash` is reused, never resent.
 */

import { randomUUID } from 'crypto';
import { Server, Socket } from 'socket.io';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  ExtendedSocket,
  AutomationTriggeredEvent,
  AutomationExecutedEvent,
} from '../types/websocket-types';
import { RoomManager } from '../services/room-manager';
import { EventBroadcaster } from '../services/event-broadcaster';
import { requireAuth } from '../middleware/auth';
import { config } from '../config';
import { createDefaultPriceAggregator } from '../services/market-data-source';

export interface StoredAutomation {
  id: string;
  user_id: string;
  wallet_id?: string | null;
  name?: string | null;
  status: string;
  trigger_conditions: unknown;
  action_config: unknown;
  last_executed_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface TriggerEvaluationResult {
  met: boolean;
  triggerType: string;
  triggerData: Record<string, unknown>;
}

export interface ExecutionAttempt {
  id: string;
  automationId: string;
  status: 'pending' | 'executing' | 'submitted' | 'resolved' | 'failed';
  transactionHash?: string;
  error?: string;
}

export interface ExecutionResult {
  ruleId: string;
  executionId: string;
  success: boolean;
  timestamp: Date;
  duration: number;
  error?: Error;
  transactionHash?: string;
}

/**
 * Runtime used by the poll loop. Production wires AutomationService;
 * tests inject a fake so evaluation/execution stay deterministic.
 */
export interface AutomationRuntime {
  evaluatePersistedAutomation(
    automation: StoredAutomation
  ): Promise<TriggerEvaluationResult>;
  executePersistedAutomation(
    automation: StoredAutomation,
    attemptId?: string
  ): Promise<ExecutionResult>;
  isInFlight(automationId: string): boolean;
  tryBeginExecution(automationId: string): Promise<ExecutionAttempt | null>;
  confirmExecution(attemptId: string, transactionHash?: string): Promise<void>;
  completeExecution(automationId: string): void;
}

export interface AutomationHandlerOptions {
  supabase?: SupabaseClient;
  runtime?: AutomationRuntime;
  pollIntervalMs?: number;
  startMonitoring?: boolean;
  setupRealtime?: boolean;
}

const DEFAULT_POLL_INTERVAL_MS = 30_000;

/**
 * Automation Handler Class
 */
export class AutomationHandler {
  private server: Server;
  private roomManager: RoomManager;
  private eventBroadcaster: EventBroadcaster;
  private supabase: SupabaseClient;
  private automationSubscriptions = new Map<string, unknown>();
  private activeAutomations = new Map<string, StoredAutomation & { lastActivity?: number }>();
  private runtime?: AutomationRuntime;
  private runtimePromise?: Promise<AutomationRuntime>;
  private readonly pollIntervalMs: number;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private isPolling = false;
  private stopped = false;

  constructor(
    server: Server,
    roomManager: RoomManager,
    eventBroadcaster: EventBroadcaster,
    options: AutomationHandlerOptions = {}
  ) {
    this.server = server;
    this.roomManager = roomManager;
    this.eventBroadcaster = eventBroadcaster;
    this.supabase = options.supabase ?? createClient(config.supabase.url, config.supabase.serviceRoleKey);
    this.runtime = options.runtime;
    this.pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.setupAutomationHandlers();
    if (options.setupRealtime !== false) {
      this.setupSupabaseRealtime();
    }
    if (options.startMonitoring !== false) {
      this.startAutomationMonitoring();
    }
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
   * Start automation monitoring.
   *
   * Uses schedule-next-after-complete instead of a raw setInterval so a slow
   * evaluation cycle cannot overlap the next tick. processActiveAutomations
   * still has per-automation locks for the case of concurrent callers (tests).
   */
  private startAutomationMonitoring(): void {
    this.schedulePoll();

    this.cleanupTimer = setInterval(() => {
      this.cleanupInactiveAutomations();
    }, 300000);
  }

  private schedulePoll(): void {
    if (this.stopped) {
      return;
    }

    this.pollTimer = setTimeout(() => {
      void this.runPollCycle();
    }, this.pollIntervalMs);
  }

  private async runPollCycle(): Promise<void> {
    try {
      await this.checkAutomationTriggers();
    } finally {
      this.schedulePoll();
    }
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

      const automation = (newRecord || oldRecord) as StoredAutomation;
      const automationId = automation.id;

      if (eventType === 'INSERT') {
        return;
      }

      if (eventType === 'UPDATE' && newRecord.status !== oldRecord.status) {
        if (newRecord.status === 'active') {
          this.activeAutomations.set(automationId, automation);
        } else if (newRecord.status === 'paused') {
          this.activeAutomations.delete(automationId);
        }
      }

      // Execution events are emitted by the poll loop after a real
      // transaction result is known. Do not synthesize them here.
    } catch (error) {
      console.error('Failed to handle automation change:', error);
    }
  }

  /**
   * Check automation triggers
   */
  async checkAutomationTriggers(): Promise<void> {
    if (this.isPolling) {
      console.warn('[automation-handler] skipping overlapping poll cycle');
      return;
    }

    this.isPolling = true;
    try {
      const { data: automations, error } = await this.supabase
        .from('automations')
        .select('*')
        .eq('status', 'active');

      if (error || !automations) {
        if (error) {
          console.error('Failed to load active automations:', error);
        }
        return;
      }

      await this.processActiveAutomations(automations as StoredAutomation[]);
    } catch (error) {
      console.error('Failed to check automation triggers:', error);
    } finally {
      this.isPolling = false;
    }
  }

  /**
   * Evaluate and execute a batch of automations. Safe to call concurrently:
   * per-automation claim prevents duplicate submits.
   */
  async processActiveAutomations(automations: StoredAutomation[]): Promise<void> {
    for (const automation of automations) {
      try {
        await this.processAutomation(automation);
      } catch (error) {
        console.error(`Failed to check triggers for automation ${automation.id}:`, error);
      }
    }
  }

  private async processAutomation(automation: StoredAutomation): Promise<void> {
    const runtime = await this.getRuntime();

    if (runtime.isInFlight(automation.id)) {
      console.info(
        `[automation ${automation.id}] skip: previous execution still pending/executing`
      );
      return;
    }

    const evaluation = await runtime.evaluatePersistedAutomation(automation);
    if (!evaluation.met) {
      return;
    }

    const attempt = await runtime.tryBeginExecution(automation.id);
    if (!attempt) {
      console.warn(
        `[automation ${automation.id}] skip: could not claim execution lock`
      );
      return;
    }

    try {
      if (attempt.transactionHash) {
        console.info(
          `[automation ${automation.id}] recovering submitted hash ${attempt.transactionHash}`
        );
        const result = await runtime.executePersistedAutomation(
          automation,
          attempt.id
        );
        await this.emitExecuted(automation, result);
        await runtime.confirmExecution(attempt.id, result.transactionHash);
        return;
      }

      await this.emitTriggered(automation, evaluation);

      const result = await runtime.executePersistedAutomation(automation, attempt.id);
      await this.emitExecuted(automation, result);
      await runtime.confirmExecution(attempt.id, result.transactionHash);

      await this.supabase
        .from('automations')
        .update({ last_executed_at: new Date().toISOString() })
        .eq('id', automation.id);
    } finally {
      runtime.completeExecution(automation.id);
    }
  }

  /**
   * Evaluate trigger conditions for an automation.
   */
  async evaluateTriggerConditions(automation: StoredAutomation): Promise<boolean> {
    const runtime = await this.getRuntime();
    const evaluation = await runtime.evaluatePersistedAutomation(automation);
    return evaluation.met;
  }

  private async emitTriggered(
    automation: StoredAutomation,
    evaluation: TriggerEvaluationResult
  ): Promise<void> {
    const event: AutomationTriggeredEvent = {
      id: randomUUID(),
      timestamp: Date.now(),
      source: 'galaxy-websocket',
      type: 'automation:triggered',
      data: {
        automationId: automation.id,
        userId: automation.user_id,
        walletId: automation.wallet_id ?? '',
        triggerCondition: JSON.stringify(automation.trigger_conditions),
        triggerData: evaluation.triggerData,
      },
    };

    await this.eventBroadcaster.broadcastToUser(automation.user_id, event);
    await this.eventBroadcaster.broadcastToRoom(`automation:${automation.id}`, event);
    console.info(`[automation ${automation.id}] emitted automation:triggered`);
  }

  private async emitExecuted(
    automation: StoredAutomation,
    result: ExecutionResult
  ): Promise<void> {
    const event: AutomationExecutedEvent = {
      id: randomUUID(),
      timestamp: Date.now(),
      source: 'galaxy-websocket',
      type: 'automation:executed',
      data: {
        automationId: automation.id,
        userId: automation.user_id,
        walletId: automation.wallet_id ?? '',
        result: result.success ? 'success' : 'failed',
        executedAt: Date.now(),
        transactionHash: result.success ? result.transactionHash : undefined,
        error: result.success
          ? undefined
          : result.error?.message ?? 'Automation execution failed',
      },
    };

    await this.eventBroadcaster.broadcastToUser(automation.user_id, event);
    await this.eventBroadcaster.broadcastToRoom(`automation:${automation.id}`, event);
    console.info(
      `[automation ${automation.id}] emitted automation:executed ` +
        `success=${result.success}` +
        (result.transactionHash ? ` hash=${result.transactionHash}` : '') +
        (result.error ? ` error=${result.error.message}` : '')
    );
  }

  private async getRuntime(): Promise<AutomationRuntime> {
    if (this.runtime) {
      return this.runtime;
    }

    if (!this.runtimePromise) {
      this.runtimePromise = this.createDefaultRuntime();
    }

    this.runtime = await this.runtimePromise;
    return this.runtime;
  }

  private async createDefaultRuntime(): Promise<AutomationRuntime> {
    const moduleName = '@galaxy-kj/core-automation';
    const { AutomationService } = (await import(moduleName)) as {
      AutomationService: new (config: {
        network: {
          type: 'PUBLIC' | 'TESTNET';
          horizonUrl: string;
          networkPassphrase: string;
        };
        sourceSecret?: string;
        oracle?: {
          getAggregatedPrices: (
            symbols: string[]
          ) => Promise<Array<{ symbol: string; price: number }>>;
        };
      }) => AutomationRuntime;
    };

    const isMainnet = config.stellar.network === 'mainnet';
    let oracle:
      | {
          getAggregatedPrices: (
            symbols: string[]
          ) => Promise<Array<{ symbol: string; price: number }>>;
        }
      | undefined;

    try {
      const aggregator = await createDefaultPriceAggregator();
      oracle = {
        getAggregatedPrices: async (symbols: string[]) =>
          Promise.all(
            symbols.map(async symbol => {
              const snapshot = await aggregator.getAggregatedPrice(symbol);
              return { symbol, price: snapshot.price };
            })
          ),
      };
    } catch (error) {
      console.warn(
        '[automation-handler] price oracle unavailable; price triggers will not fire',
        error
      );
    }

    return new AutomationService({
      network: {
        type: isMainnet ? 'PUBLIC' : 'TESTNET',
        horizonUrl: config.stellar.horizonUrl,
        networkPassphrase: isMainnet
          ? 'Public Global Stellar Network ; September 2015'
          : 'Test SDF Network ; September 2015',
      },
      sourceSecret: process.env.AUTOMATION_SOURCE_SECRET || '',
      oracle,
    });
  }

  /**
   * Cleanup inactive automations
   */
  private cleanupInactiveAutomations(): void {
    // Remove automations that haven't been active for 1 hour
    const oneHourAgo = Date.now() - 3600000;
    
    for (const [automationId, automation] of this.activeAutomations.entries()) {
      if (automation.lastActivity !== undefined && automation.lastActivity < oneHourAgo) {
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
    this.stopped = true;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.supabase.removeAllChannels();

    this.automationSubscriptions.clear();
    this.activeAutomations.clear();
  }
}
