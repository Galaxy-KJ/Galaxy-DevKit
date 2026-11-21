/**
 * @fileoverview Contract Event Monitor
 * @description Monitor and subscribe to Soroban contract events
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { SorobanRpc, nativeToScVal, xdr } from '../../types/stellar-sdk-compat.js';
import { resolveNetwork } from '../../utils/network-utils.js';
import { ScValConverter } from './scval-converter.js';
import {
  ContractEventQueryParams,
  ContractEventDetail,
  EventSubscription,
} from '../types/contract-types.js';

const POLL_INTERVAL_MS = 5000;
const PAGE_LIMIT = 1000;

/** One topic segment as base64 XDR, the form Soroban RPC expects. */
function topicSegment(value: unknown): string {
  if (value instanceof xdr.ScVal) {
    return value.toXDR('base64');
  }
  return nativeToScVal(value, { type: 'symbol' }).toXDR('base64');
}

/** Match events whose first topic is `value`, with any topics after it. */
function firstTopicFilter(value: unknown): string[] {
  return [topicSegment(value), '**'];
}

interface PollState {
  filters: SorobanRpc.EventFilter[];
  startLedger: number;
  cursor?: string;
  timer?: NodeJS.Timeout;
  stopped: boolean;
}

export class ContractEventMonitor {
  private server: SorobanRpc.Server;
  private subscriptions: Map<string, EventSubscription>;
  private pollStates: Map<string, PollState>;

  constructor(rpcUrl: string = resolveNetwork('testnet').rpcUrl) {
    this.server = new SorobanRpc.Server(rpcUrl);
    this.subscriptions = new Map();
    this.pollStates = new Map();
  }

  /**
   * Subscribe to contract events
   */
  async subscribeToEvents(subscription: EventSubscription): Promise<string> {
    return this.startSubscription(subscription);
  }

  /**
   * Register a subscription with its own cursor, starting at the
   * caller's `startLedger` or the latest ledger.
   */
  private async startSubscription(
    subscription: EventSubscription
  ): Promise<string> {
    try {
      const startLedger =
        subscription.startLedger ??
        (await this.server.getLatestLedger()).sequence;
      const subscriptionId = this.generateSubscriptionId(
        subscription.contractId
      );

      this.subscriptions.set(subscriptionId, {
        ...subscription,
        id: subscriptionId,
      });
      this.pollStates.set(subscriptionId, {
        filters: this.buildSubscriptionFilters(subscription),
        startLedger,
        stopped: false,
      });

      this.scheduleNextPoll(subscriptionId);

      return subscriptionId;
    } catch (error) {
      if (subscription.onError) {
        subscription.onError(error);
      }
      throw error;
    }
  }

  private buildSubscriptionFilters(
    subscription: EventSubscription
  ): SorobanRpc.EventFilter[] {
    return [
      {
        type: 'contract',
        contractIds: [subscription.contractId],
        ...(subscription.eventTypes &&
          subscription.eventTypes.length > 0 && {
            topics: subscription.eventTypes.map(type => firstTopicFilter(type)),
          }),
      },
    ];
  }

  /**
   * Query historical events
   */
  async queryEvents(
    params: ContractEventQueryParams
  ): Promise<ContractEventDetail[]> {
    const {
      contractId,
      startLedger,
      endLedger,
      eventTypes,
      topics,
    } = params;

    try {
      // Build event filters
      const filters: SorobanRpc.EventFilter[] = [];

      if (eventTypes && eventTypes.length > 0) {
        filters.push({
          type: 'contract',
          contractIds: [contractId],
          topics: eventTypes.map(type => firstTopicFilter(type)),
        });
      } else {
        filters.push({
          type: 'contract',
          contractIds: [contractId],
        });
      }

      // Add additional topic filters
      if (topics && topics.length > 0) {
        filters[0].topics = [
          ...(filters[0].topics || []),
          ...topics.map(topic => firstTopicFilter(topic)),
        ];
      }

      // Get events
      const eventsResponse = await this.server.getEvents({
        startLedger,
        endLedger,
        filters,
        limit: 1000, // Adjust as needed
      });

      return eventsResponse.events.map(event =>
        this.convertRpcEventToDetail(event)
      );
    } catch (error) {
      throw new Error(`Event query failed: ${error.message}`);
    }
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscriptionId: string): void {
    // Stop polling
    const state = this.pollStates.get(subscriptionId);
    if (state) {
      state.stopped = true;
      clearTimeout(state.timer);
      this.pollStates.delete(subscriptionId);
    }

    // Remove subscription
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription && subscription.onClose) {
      subscription.onClose();
    }

    this.subscriptions.delete(subscriptionId);
  }

  /**
   * Unsubscribe all events
   */
  unsubscribeAll(): void {
    for (const subscriptionId of this.subscriptions.keys()) {
      this.unsubscribe(subscriptionId);
    }
  }

  /**
   * Get active subscriptions
   */
  getSubscriptions(): EventSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Schedule the next poll. The next one is only scheduled after the
   * current one finishes, so polls never overlap.
   */
  private scheduleNextPoll(subscriptionId: string): void {
    const state = this.pollStates.get(subscriptionId);
    if (!state || state.stopped) return;

    state.timer = setTimeout(async () => {
      await this.pollForEvents(subscriptionId);
      this.scheduleNextPoll(subscriptionId);
    }, POLL_INTERVAL_MS);
  }

  /**
   * Fetch every page of new events for one subscription and advance
   * its cursor.
   */
  private async pollForEvents(subscriptionId: string): Promise<void> {
    const subscription = this.subscriptions.get(subscriptionId);
    const state = this.pollStates.get(subscriptionId);
    if (!subscription || !state) return;

    try {
      while (!state.stopped) {
        const response = await this.server.getEvents(
          state.cursor
            ? { filters: state.filters, cursor: state.cursor, limit: PAGE_LIMIT }
            : {
                filters: state.filters,
                startLedger: state.startLedger,
                limit: PAGE_LIMIT,
              }
        );
        const events = response.events || [];

        for (const event of events) {
          if (state.stopped) return;
          subscription.onEvent(this.convertRpcEventToDetail(event));
        }

        const lastId = events.length > 0 ? events[events.length - 1].id : undefined;
        state.cursor = response.cursor || lastId || state.cursor;

        if (events.length === 0) break;
      }
    } catch (error) {
      // Report the error but keep polling from the same cursor
      if (subscription.onError) {
        subscription.onError(error);
      } else {
        console.error('Error polling for events:', error);
      }
    }
  }

  /**
   * Convert RPC event to ContractEventDetail
   */
  private convertRpcEventToDetail(
    event: SorobanRpc.Api.GetEventsResponseEvent
  ): ContractEventDetail {
    return {
      contractId: event.contractId?.toString() || '',
      type: event.type.toString(),
      topics: event.topics || [],
      data: event.data || xdr.ScVal.scvVoid(),
      timestamp: event.timestamp || 0,
      ledger: event.ledger || 0,
      txHash: event.txHash || '',
      ...event,
    };
  }

  /**
   * Generate unique subscription ID
   */
  private generateSubscriptionId(contractId: string): string {
    const timestamp = Date.now();
    const random = require('crypto').randomBytes(6).toString('hex');
    return `${contractId.substr(0, 8)}_${timestamp}_${random}`;
  }

  /**
   * Stream events using WebSocket (if available)
   */
  async streamEvents(subscription: EventSubscription): Promise<string> {
    // For now, fall back to polling since WebSocket support is limited
    // In the future, this could use actual WebSocket connections
    return this.startSubscription(subscription);
  }

  /**
   * Filter events by topic
   */
  filterEventsByTopic(
    events: ContractEventDetail[],
    topic: string
  ): ContractEventDetail[] {
    return events.filter(event =>
      event.topics.some(t => ScValConverter.fromScVal(t) === topic)
    );
  }

  /**
   * Filter events by contract
   */
  filterEventsByContract(
    events: ContractEventDetail[],
    contractId: string
  ): ContractEventDetail[] {
    return events.filter(event => event.contractId === contractId);
  }

  /**
   * Filter events by time range
   */
  filterEventsByTimeRange(
    events: ContractEventDetail[],
    startTime: number,
    endTime: number
  ): ContractEventDetail[] {
    return events.filter(
      event => event.timestamp >= startTime && event.timestamp <= endTime
    );
  }

  /**
   * Get event statistics
   */
  getEventStats(events: ContractEventDetail[]): {
    totalEvents: number;
    uniqueContracts: number;
    uniqueTypes: number;
    ledgerRange: { min: number; max: number };
    timeRange: { min: number; max: number };
  } {
    const uniqueContracts = new Set(events.map(e => e.contractId)).size;
    const uniqueTypes = new Set(events.map(e => e.type)).size;
    const ledgers = events.map(e => e.ledger).filter(l => l > 0);
    const timestamps = events.map(e => e.timestamp).filter(t => t > 0);

    return {
      totalEvents: events.length,
      uniqueContracts,
      uniqueTypes,
      ledgerRange: {
        min: ledgers.length > 0 ? Math.min(...ledgers) : 0,
        max: ledgers.length > 0 ? Math.max(...ledgers) : 0,
      },
      timeRange: {
        min: timestamps.length > 0 ? Math.min(...timestamps) : 0,
        max: timestamps.length > 0 ? Math.max(...timestamps) : 0,
      },
    };
  }

  /**
   * Get the RPC server instance
   */
  getServer(): SorobanRpc.Server {
    return this.server;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    this.unsubscribeAll();
    this.subscriptions.clear();
  }
}
