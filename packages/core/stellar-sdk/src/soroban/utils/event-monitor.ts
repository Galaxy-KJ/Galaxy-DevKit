/**
 * @fileoverview Contract Event Monitor
 * @description Monitor and subscribe to Soroban contract events
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { SorobanRpc, xdr } from '@stellar/stellar-sdk';
import { ScValConverter } from '../utils/scval-converter';
import {
  ContractEventQueryParams,
  ContractEventDetail,
  EventSubscription,
} from '../types/contract-types';

export class ContractEventMonitor {
  private server: SorobanRpc.Server;
  private subscriptions: Map<string, EventSubscription>;
  private pollingIntervals: Map<string, NodeJS.Timeout>;
  private lastLedger: number;

  constructor(rpcUrl: string = 'https://soroban-testnet.stellar.org') {
    this.server = new SorobanRpc.Server(rpcUrl);
    this.subscriptions = new Map();
    this.pollingIntervals = new Map();
    this.lastLedger = 0;
  }

  /**
   * Subscribe to contract events
   */
  async subscribeToEvents(subscription: EventSubscription): Promise<string> {
    const { contractId, eventTypes, onEvent, onError, onClose } = subscription;

    try {
      // Generate unique subscription ID
      const subscriptionId = this.generateSubscriptionId(contractId);

      // Store subscription
      this.subscriptions.set(subscriptionId, {
        ...subscription,
        id: subscriptionId,
      });

      // Get current ledger
      const ledgerResponse = await this.server.getLatestLedger();
      this.lastLedger = ledgerResponse.sequence;

      // Start polling for events
      this.startPolling(subscriptionId);

      return subscriptionId;
    } catch (error) {
      if (onError) {
        onError(error);
      }
      throw error;
    }
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
      networkPassphrase,
    } = params;

    try {
      // Build event filters
      const filters: SorobanRpc.EventFilter[] = [];

      if (eventTypes && eventTypes.length > 0) {
        filters.push({
          type: 'contract',
          contractIds: [contractId],
          topics: eventTypes.map(type => ({ type: 'string', value: type })),
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
          ...topics.map(topic => ({
            type: 'string',
            value: ScValConverter.fromScVal(topic),
          })),
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
    if (this.pollingIntervals.has(subscriptionId)) {
      clearInterval(this.pollingIntervals.get(subscriptionId));
      this.pollingIntervals.delete(subscriptionId);
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
   * Start polling for events
   */
  private startPolling(subscriptionId: string): void {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return;

    const interval = setInterval(async () => {
      try {
        await this.pollForEvents(subscriptionId);
      } catch (error) {
        if (subscription.onError) {
          subscription.onError(error);
        }
      }
    }, 5000); // Poll every 5 seconds

    this.pollingIntervals.set(subscriptionId, interval);
  }

  /**
   * Poll for new events
   */
  private async pollForEvents(subscriptionId: string): Promise<void> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return;

    try {
      // Get latest ledger
      const ledgerResponse = await this.server.getLatestLedger();
      const currentLedger = ledgerResponse.sequence;

      if (currentLedger <= this.lastLedger) {
        return; // No new ledgers
      }

      // Query events since last check
      const eventsResponse = await this.server.getEvents({
        startLedger: this.lastLedger + 1,
        endLedger: currentLedger,
        filters: [
          {
            type: 'contract',
            contractIds: [subscription.contractId],
            ...(subscription.eventTypes && {
              topics: subscription.eventTypes.map(type => ({
                type: 'string',
                value: type,
              })),
            }),
          },
        ],
      });

      // Process events
      for (const event of eventsResponse.events) {
        const eventDetail = this.convertRpcEventToDetail(event);
        subscription.onEvent(eventDetail);
      }

      // Update last ledger
      this.lastLedger = currentLedger;
    } catch (error) {
      // Log error but don't stop polling
      console.error('Error polling for events:', error);
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
    const random = Math.random().toString(36).substr(2, 9);
    return `${contractId.substr(0, 8)}_${timestamp}_${random}`;
  }

  /**
   * Stream events using WebSocket (if available)
   */
  async streamEvents(subscription: EventSubscription): Promise<string> {
    try {
      const subscriptionId = this.generateSubscriptionId(
        subscription.contractId
      );

      // Store subscription
      this.subscriptions.set(subscriptionId, {
        ...subscription,
        id: subscriptionId,
      });

      // For now, fall back to polling since WebSocket support is limited
      // In the future, this could use actual WebSocket connections
      this.startPolling(subscriptionId);

      return subscriptionId;
    } catch (error) {
      if (subscription.onError) {
        subscription.onError(error);
      }
      throw error;
    }
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
