/**
 * @fileoverview Contract Event Monitor
 * @description Monitor and subscribe to Soroban contract events
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { randomBytes } from 'node:crypto';
import { SorobanRpc, rpc, xdr } from '../../types/stellar-sdk-compat.js';
import { resolveNetwork } from '../../utils/network-utils.js';
import { ScValConverter } from './scval-converter.js';
import {
  ContractEventQueryParams,
  ContractEventDetail,
  EventSubscription,
} from '../types/contract-types.js';

/** Delay between the end of one poll and the start of the next one. */
const POLL_INTERVAL_MS = 5000;

/** Number of events requested per `getEvents` page. */
const EVENTS_PAGE_LIMIT = 1000;

/** RPC limits for a single `getEvents` request. */
const MAX_FILTERS_PER_REQUEST = 5;
const MAX_TOPIC_FILTERS_PER_FILTER = 5;

/** Characters and length a Soroban `Symbol` allows. */
const SYMBOL_PATTERN = /^[A-Za-z0-9_]{1,32}$/;

/**
 * Polling state of one subscription.
 */
interface SubscriptionState {
  /** `getEvents` filters, built once when the subscription starts. */
  filters: SorobanRpc.EventFilter[];
  /** Ledger the first request starts from (inclusive). */
  startLedger: number;
  /**
   * Events from ledgers before this one closed before the subscription
   * started and are not delivered.
   */
  firstNewLedger: number;
  /** RPC paging cursor; once set, requests continue from it. */
  cursor?: string;
  /** Timer of the next scheduled poll. */
  timer?: ReturnType<typeof setTimeout>;
  /** True while a poll is running. */
  inFlight: boolean;
}

/**
 * Build the `getEvents` filters for one contract.
 *
 * RPC topic filters are lists of base64 `ScVal` XDR segments. Each event type
 * becomes `[Symbol(type), '**']` and each extra topic `[topic, '**']`, which
 * match events whose first topic is that value. Topic filters in a filter, and
 * filters in a request, are OR-ed. RPC accepts at most 5 topic filters per
 * filter and 5 filters per request, so the topic filters are split into
 * filters of 5.
 */
function buildEventFilters(
  contractId: string,
  eventTypes: string[] = [],
  topics: xdr.ScVal[] = []
): SorobanRpc.EventFilter[] {
  const invalidType = eventTypes.find(type => !SYMBOL_PATTERN.test(type));
  if (invalidType !== undefined) {
    throw new Error(
      `Event type "${invalidType.slice(0, 64)}" is not a Soroban symbol (1-32 characters of a-z, A-Z, 0-9 and _), so it cannot be used as an RPC topic filter`
    );
  }

  const topicFilters = [
    ...eventTypes.map(type => xdr.ScVal.scvSymbol(type)),
    ...topics,
  ].map(topic => [topic.toXDR('base64'), '**']);

  if (topicFilters.length === 0) {
    return [{ type: 'contract', contractIds: [contractId] }];
  }

  const maxTopicFilters =
    MAX_FILTERS_PER_REQUEST * MAX_TOPIC_FILTERS_PER_FILTER;
  if (topicFilters.length > maxTopicFilters) {
    throw new Error(
      `Too many event topic filters: ${topicFilters.length} (RPC allows at most ${maxTopicFilters} per request)`
    );
  }

  const filters: SorobanRpc.EventFilter[] = [];
  for (let i = 0; i < topicFilters.length; i += MAX_TOPIC_FILTERS_PER_FILTER) {
    filters.push({
      type: 'contract',
      contractIds: [contractId],
      topics: topicFilters.slice(i, i + MAX_TOPIC_FILTERS_PER_FILTER),
    });
  }
  return filters;
}

export class ContractEventMonitor {
  private server: SorobanRpc.Server;
  private subscriptions: Map<string, EventSubscription>;
  private pollingStates: Map<string, SubscriptionState>;
  private destroyed = false;

  constructor(rpcUrl: string = resolveNetwork('testnet').rpcUrl) {
    this.server = new SorobanRpc.Server(rpcUrl);
    this.subscriptions = new Map();
    this.pollingStates = new Map();
  }

  /**
   * Subscribe to contract events
   */
  async subscribeToEvents(subscription: EventSubscription): Promise<string> {
    return this.startSubscription(subscription);
  }

  /**
   * Query historical events
   */
  async queryEvents(
    params: ContractEventQueryParams
  ): Promise<ContractEventDetail[]> {
    const { contractId, startLedger, endLedger, eventTypes, topics } = params;

    try {
      // Build event filters
      const filters = buildEventFilters(contractId, eventTypes, topics);

      // Get events
      const eventsResponse = await this.server.getEvents({
        startLedger,
        endLedger,
        filters,
        limit: EVENTS_PAGE_LIMIT,
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
    const state = this.pollingStates.get(subscriptionId);
    if (state) {
      clearTimeout(state.timer);
      this.pollingStates.delete(subscriptionId);
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
   * Start a subscription: get the latest ledger, register the subscription
   * with its own cursor state, then schedule the first poll. If any step
   * fails, nothing is registered.
   */
  private async startSubscription(
    subscription: EventSubscription
  ): Promise<string> {
    try {
      const filters = buildEventFilters(
        subscription.contractId,
        subscription.eventTypes
      );

      // Get current ledger
      const ledgerResponse = await this.server.getLatestLedger();
      const startLedger = ledgerResponse?.sequence;
      if (!Number.isInteger(startLedger) || startLedger < 1) {
        throw new Error('Could not get the latest ledger sequence');
      }
      // destroy() may have run while the latest ledger was being fetched.
      if (this.destroyed) {
        throw new Error('ContractEventMonitor has been destroyed');
      }

      // Generate unique subscription ID
      const subscriptionId = this.generateSubscriptionId(
        subscription.contractId
      );

      // Store subscription
      this.subscriptions.set(subscriptionId, {
        ...subscription,
        id: subscriptionId,
      });
      // The latest ledger has already closed, so its events happened before
      // this subscription. Read from it (RPC needs a closed start ledger) but
      // deliver only events from later ledgers.
      const state: SubscriptionState = {
        filters,
        startLedger,
        firstNewLedger: startLedger + 1,
        inFlight: false,
      };
      this.pollingStates.set(subscriptionId, state);

      // Start polling for events
      this.schedulePoll(subscriptionId, state);

      return subscriptionId;
    } catch (error) {
      if (subscription.onError) {
        subscription.onError(error);
      }
      throw error;
    }
  }

  /**
   * Whether `state` still belongs to an active subscription.
   */
  private isActive(subscriptionId: string, state: SubscriptionState): boolean {
    return this.pollingStates.get(subscriptionId) === state;
  }

  /**
   * Schedule the next poll. A poll is only scheduled once the previous one
   * has finished, so polls of a subscription never overlap.
   */
  private schedulePoll(subscriptionId: string, state: SubscriptionState): void {
    state.timer = setTimeout(() => {
      void this.runPoll(subscriptionId, state);
    }, POLL_INTERVAL_MS);
  }

  /**
   * Run one poll, then schedule the next one if the subscription is active.
   */
  private async runPoll(
    subscriptionId: string,
    state: SubscriptionState
  ): Promise<void> {
    state.timer = undefined;
    if (state.inFlight || !this.isActive(subscriptionId, state)) return;

    state.inFlight = true;
    try {
      await this.pollForEvents(subscriptionId, state);
    } catch (error) {
      // Log error but don't stop polling. The cursor is unchanged, so the
      // next poll retries from the same position.
      console.error('Error polling for events:', error);
    } finally {
      state.inFlight = false;
    }

    if (this.isActive(subscriptionId, state)) {
      this.schedulePoll(subscriptionId, state);
    }
  }

  /**
   * Poll for new events
   *
   * The first request starts at the subscription's start ledger; later
   * requests continue from the cursor of the previous page. No `endLedger` is
   * sent: RPC treats it as exclusive, which would skip the newest ledger.
   * Pages are fetched until one is not full.
   */
  private async pollForEvents(
    subscriptionId: string,
    state: SubscriptionState
  ): Promise<void> {
    const subscription = this.subscriptions.get(subscriptionId);
    if (!subscription) return;

    let pageFull = true;
    while (pageFull) {
      const eventsResponse = await this.server.getEvents(
        state.cursor
          ? {
              cursor: state.cursor,
              filters: state.filters,
              limit: EVENTS_PAGE_LIMIT,
            }
          : {
              startLedger: state.startLedger,
              filters: state.filters,
              limit: EVENTS_PAGE_LIMIT,
            }
      );
      if (!this.isActive(subscriptionId, state)) return;

      // Process events
      const events: rpc.Api.EventResponse[] = eventsResponse.events ?? [];
      for (const event of events) {
        if (event.ledger < state.firstNewLedger) continue;
        try {
          subscription.onEvent(this.convertRpcEventToDetail(event));
        } catch (error) {
          // A failing handler must not stop the subscription or replay the
          // page on the next poll.
          console.error('Error in event handler:', error);
        }
        if (!this.isActive(subscriptionId, state)) return;
      }

      // Continue from the cursor of this page. If the server sends none, the
      // last event's id is also a valid cursor; without either, the next poll
      // would replay everything since the start ledger.
      const cursor: string | undefined =
        eventsResponse.cursor || events[events.length - 1]?.id;
      const advanced = Boolean(cursor) && cursor !== state.cursor;
      if (advanced) {
        state.cursor = cursor;
      }
      pageFull = advanced && events.length >= EVENTS_PAGE_LIMIT;
    }
  }

  /**
   * Convert RPC event to ContractEventDetail
   */
  private convertRpcEventToDetail(
    event: rpc.Api.EventResponse
  ): ContractEventDetail {
    return {
      contractId: event.contractId?.toString() || '',
      type: event.type,
      topics: event.topic || [],
      data: event.value || xdr.ScVal.scvVoid(),
      // Milliseconds, as in the docs examples (`new Date(event.timestamp)`).
      timestamp: Date.parse(event.ledgerClosedAt) || 0,
      ledger: event.ledger || 0,
      txHash: event.txHash || '',
    };
  }

  /**
   * Generate unique subscription ID
   */
  private generateSubscriptionId(contractId: string): string {
    const timestamp = Date.now();
    const random = randomBytes(6).toString('hex');
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
    this.destroyed = true;
    this.unsubscribeAll();
    this.subscriptions.clear();
  }
}
