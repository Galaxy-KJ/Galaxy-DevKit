/**
 * @fileoverview Soroban event-based automation trigger
 * @description Monitors Soroban contract events via RPC polling and invokes
 *              callbacks when matching events are detected.
 */

import {
  ContractEventDetail,
  ContractEventMonitor,
  EventSubscription,
} from '@galaxy-kj/core-stellar-sdk/soroban';

export interface EventFilter {
  contractId: string;
  topics: string[];
}

export interface EventTriggerOptions {
  rpcUrl?: string;
  maxReconnectAttempts?: number;
  reconnectDelayMs?: number;
}

const DEFAULT_RPC_URL = 'https://soroban-testnet.stellar.org';
const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5;
const DEFAULT_RECONNECT_DELAY_MS = 2000;

export class EventTrigger {
  private readonly monitor: ContractEventMonitor;
  private readonly options: Required<EventTriggerOptions>;
  private subscriptionId?: string;
  private isListening = false;
  private reconnectAttempts = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private callback?: (event: ContractEventDetail) => void;
  private currentFilter?: EventFilter;

  constructor(
    rpcUrl?: string,
    monitor?: ContractEventMonitor
  ) {
    this.options = {
      rpcUrl: rpcUrl ?? DEFAULT_RPC_URL,
      maxReconnectAttempts: DEFAULT_MAX_RECONNECT_ATTEMPTS,
      reconnectDelayMs: DEFAULT_RECONNECT_DELAY_MS,
    };
    this.monitor = monitor ?? new ContractEventMonitor(this.options.rpcUrl);
  }

  /**
   * Start listening for Soroban contract events matching the provided filter.
   */
  async startListening(
    filter: EventFilter,
    callback: (event: ContractEventDetail) => void
  ): Promise<void> {
    if (this.isListening) {
      throw new Error('EventTrigger is already listening');
    }

    this.currentFilter = filter;
    this.callback = callback;
    this.isListening = true;
    this.reconnectAttempts = 0;

    await this.subscribe(filter, callback);
  }

  /**
   * Stop listening and release RPC subscription resources.
   */
  stopListening(): void {
    this.clearReconnectTimer();

    if (this.subscriptionId) {
      this.monitor.unsubscribe(this.subscriptionId);
      this.subscriptionId = undefined;
    }

    this.isListening = false;
    this.callback = undefined;
    this.currentFilter = undefined;
    this.reconnectAttempts = 0;
  }

  /**
   * Emit a simulated Soroban event for testing without a live RPC connection.
   */
  emitSimulatedEvent(event: ContractEventDetail): void {
    if (!this.callback || !this.currentFilter) {
      return;
    }

    if (!this.matchesFilter(event, this.currentFilter)) {
      return;
    }

    this.callback(event);
  }

  private async subscribe(
    filter: EventFilter,
    callback: (event: ContractEventDetail) => void
  ): Promise<void> {
    const subscription: EventSubscription = {
      id: '',
      contractId: filter.contractId,
      eventTypes: filter.topics.length > 0 ? filter.topics : undefined,
      onEvent: (event: ContractEventDetail) => {
        if (this.matchesFilter(event, filter)) {
          callback(event);
        }
      },
      onError: (error: Error) => {
        this.handleConnectionError(error);
      },
    };

    this.subscriptionId = await this.monitor.subscribeToEvents(subscription);
  }

  private matchesFilter(
    event: ContractEventDetail,
    filter: EventFilter
  ): boolean {
    if (event.contractId !== filter.contractId) {
      return false;
    }

    if (filter.topics.length === 0) {
      return true;
    }

    const eventTopics = this.extractTopicStrings(event);
    return filter.topics.every((topic) => eventTopics.includes(topic));
  }

  private extractTopicStrings(event: ContractEventDetail): string[] {
    if (event.decodedTopics && event.decodedTopics.length > 0) {
      return event.decodedTopics.map((topic: unknown) => String(topic));
    }

    return event.topics.map((topic: unknown) => {
      if (typeof topic === 'string') {
        return topic;
      }

      if (topic && typeof topic === 'object' && 'toString' in topic) {
        return topic.toString();
      }

      return String(topic);
    });
  }

  private handleConnectionError(error: Error): void {
    if (!this.isListening || !this.currentFilter || !this.callback) {
      return;
    }

    if (this.subscriptionId) {
      this.monitor.unsubscribe(this.subscriptionId);
      this.subscriptionId = undefined;
    }

    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      this.isListening = false;
      return;
    }

    this.reconnectAttempts += 1;
    const delayMs = this.options.reconnectDelayMs * this.reconnectAttempts;

    this.clearReconnectTimer();
    this.reconnectTimer = setTimeout(() => {
      void this.attemptReconnect();
    }, delayMs);

    console.error(
      `EventTrigger RPC connection error (attempt ${this.reconnectAttempts}/${this.options.maxReconnectAttempts}):`,
      error.message
    );
  }

  private async attemptReconnect(): Promise<void> {
    if (!this.isListening || !this.currentFilter || !this.callback) {
      return;
    }

    try {
      await this.subscribe(this.currentFilter, this.callback);
      this.reconnectAttempts = 0;
    } catch (error) {
      const reconnectError =
        error instanceof Error ? error : new Error(String(error));
      this.handleConnectionError(reconnectError);
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }
}