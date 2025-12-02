/**
 * Subscription Manager for GraphQL
 * Manages real-time subscriptions using an event emitter pattern
 */

type Listener = (event: any) => void;
type UnsubscribeFunction = () => void;

interface QueueMetrics {
  droppedEvents: number;
  maxQueueSize: number;
}

export class SubscriptionManager {
  private listeners: Map<string, Set<Listener>> = new Map();
  private eventQueue: Map<string, any[]> = new Map();
  private maxQueueSize = 100;
  private localMaxQueueSize = 100; // Limit per-subscriber queue size
  private queueMetrics: Map<string, QueueMetrics> = new Map();

  /**
   * Subscribe to a channel and return an async iterator for subscriptions
   */
  public subscribe(channel: string): AsyncIterable<any> {
    const self = this;

    return {
      async *[Symbol.asyncIterator]() {
        const queue: any[] = [];
        let isSubscribed = true;
        let droppedCount = 0;
        let pendingResolve: (() => void) | null = null;

        const listener = (event: any) => {
          if (isSubscribed) {
            // Enforce per-subscriber queue size limit with backpressure
            if (queue.length >= self.localMaxQueueSize) {
              droppedCount++;
              if (droppedCount % 10 === 0) {
                console.warn(
                  `Subscription queue for channel '${channel}' at limit; dropped ${droppedCount} events`
                );
              }
              // Drop oldest event to make room (FIFO backpressure)
              queue.shift();
            }
            queue.push(event);

            // Signal waiting iterator that new event arrived
            if (pendingResolve) {
              const resolve = pendingResolve;
              pendingResolve = null;
              resolve();
            }
          }
        };

        // Subscribe to channel
        self.on(channel, listener);

        try {
          while (isSubscribed) {
            // Yield queued events
            while (queue.length > 0) {
              yield queue.shift();
            }

            // Wait for new events or timeout using event-driven signaling
            await new Promise<void>((resolve) => {
              let resolved = false;
              const timeout = setTimeout(() => {
                if (!resolved) {
                  resolved = true;
                  pendingResolve = null;
                  resolve();
                }
              }, 30000); // 30 second timeout

              // Store resolve callback for listener to call
              pendingResolve = () => {
                if (!resolved) {
                  resolved = true;
                  clearTimeout(timeout);
                  resolve();
                }
              };
            });
          }
        } finally {
          isSubscribed = false;
          pendingResolve = null;
          self.off(channel, listener);
          if (droppedCount > 0) {
            console.info(`Subscription to '${channel}' ended with ${droppedCount} dropped events`);
          }
        }
      },
    };
  }

  /**
   * Emit an event to all subscribers on a channel
   * @param throwOnError If true, throws AggregateError if any listener throws
   */
  public emit(channel: string, event: any, throwOnError: boolean = false): void {
    const listeners = this.listeners.get(channel);
    const errors: Error[] = [];

    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(event);
        } catch (error) {
          console.error(`Error in subscription listener for ${channel}:`, error);
          if (throwOnError) {
            errors.push(error as Error);
          }
        }
      });
    }

    // Throw if errors occurred and throwOnError is true
    if (throwOnError && errors.length > 0) {
      throw new AggregateError(errors, `${errors.length} listener(s) failed for channel '${channel}'`);
    }

    // Store event in queue for late subscribers
    if (!this.eventQueue.has(channel)) {
      this.eventQueue.set(channel, []);
    }
    const queue = this.eventQueue.get(channel)!;
    queue.push({
      event,
      timestamp: Date.now(),
    });

    // Trim queue to max size
    if (queue.length > this.maxQueueSize) {
      queue.shift();
    }
  }

  /**
   * Register a listener on a channel
   */
  public on(channel: string, listener: Listener): UnsubscribeFunction {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set());
    }
    this.listeners.get(channel)!.add(listener);

    // Return unsubscribe function
    return () => {
      this.off(channel, listener);
    };
  }

  /**
   * Remove a listener from a channel
   */
  public off(channel: string, listener: Listener): void {
    const listeners = this.listeners.get(channel);
    if (listeners) {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.listeners.delete(channel);
      }
    }
  }

  /**
   * Get listener count for a channel
   */
  public getListenerCount(channel: string): number {
    const listeners = this.listeners.get(channel);
    return listeners ? listeners.size : 0;
  }

  /**
   * Get total number of listeners across all channels
   */
  public getTotalListenerCount(): number {
    let total = 0;
    for (const [, set] of this.listeners) {
      total += set.size;
    }
    return total;
  }

  /**
   * Clear all listeners for a channel
   */
  public clearChannel(channel: string): void {
    this.listeners.delete(channel);
    this.eventQueue.delete(channel);
  }

  /**
   * Clear all subscriptions
   */
  public clear(): void {
    this.listeners.clear();
    this.eventQueue.clear();
    this.queueMetrics.clear();
  }

  /**
   * Get queue metrics for observability
   */
  public getMetrics(): { totalListeners: number; channels: number; droppedEvents: number } {
    let droppedEvents = 0;
    for (const [, metrics] of this.queueMetrics) {
      droppedEvents += metrics.droppedEvents;
    }
    return {
      totalListeners: this.getTotalListenerCount(),
      channels: this.listeners.size,
      droppedEvents,
    };
  }

  /**
   * Get recent events from a channel
   */
  public getRecentEvents(channel: string, limit: number = 10): any[] {
    const queue = this.eventQueue.get(channel);
    if (!queue) return [];
    return queue.slice(-limit).map((item) => item.event);
  }

  /**
   * Subscribe to multiple channels
   */
  public subscribeToMultiple(channels: string[]): AsyncIterable<any> {
    const self = this;

    return {
      async *[Symbol.asyncIterator]() {
        const queue: any[] = [];
        let isSubscribed = true;
        let droppedCount = 0;
        let pendingResolve: (() => void) | null = null;

        const createListener = (channel: string) => (event: any) => {
          if (isSubscribed) {
            // Enforce per-subscriber queue size limit with backpressure
            if (queue.length >= self.localMaxQueueSize) {
              droppedCount++;
              if (droppedCount % 10 === 0) {
                console.warn(
                  `Multi-channel subscription queue at limit; dropped ${droppedCount} events`
                );
              }
              // Drop oldest event to make room (FIFO backpressure)
              queue.shift();
            }
            queue.push({ channel, event });

            // Signal waiting iterator that new event arrived
            if (pendingResolve) {
              const resolve = pendingResolve;
              pendingResolve = null;
              resolve();
            }
          }
        };

        // Subscribe to all channels
        const unsubscribers: UnsubscribeFunction[] = [];
        channels.forEach((channel) => {
          const listener = createListener(channel);
          unsubscribers.push(self.on(channel, listener));
        });

        try {
          while (isSubscribed) {
            while (queue.length > 0) {
              yield queue.shift();
            }

            // Wait for new events or timeout using event-driven signaling
            await new Promise<void>((resolve) => {
              let resolved = false;
              const timeout = setTimeout(() => {
                if (!resolved) {
                  resolved = true;
                  pendingResolve = null;
                  resolve();
                }
              }, 30000); // 30 second timeout

              // Store resolve callback for listener to call
              pendingResolve = () => {
                if (!resolved) {
                  resolved = true;
                  clearTimeout(timeout);
                  resolve();
                }
              };
            });
          }
        } finally {
          isSubscribed = false;
          pendingResolve = null;
          unsubscribers.forEach((unsubscribe) => unsubscribe());
          if (droppedCount > 0) {
            console.info(`Multi-channel subscription ended with ${droppedCount} dropped events`);
          }
        }
      },
    };
  }

  /**
   * Batch emit multiple events
   */
  public batchEmit(events: Array<{ channel: string; event: any }>): void {
    events.forEach(({ channel, event }) => {
      this.emit(channel, event, false);
    });
  }

  /**
   * Emit event with retry logic
   * Throws AggregateError if all retries fail
   */
  public async emitWithRetry(
    channel: string,
    event: any,
    retries: number = 3,
    delayMs: number = 100
  ): Promise<void> {
    let lastError: Error | null = null;

    for (let i = 0; i < retries; i++) {
      try {
        // Pass throwOnError=true to enable retry on listener failures
        this.emit(channel, event, true);
        return;
      } catch (error) {
        lastError = error as Error;
        if (i < retries - 1) {
          // Exponential backoff: wait before retrying
          await new Promise((resolve) => setTimeout(resolve, delayMs * Math.pow(2, i)));
        }
      }
    }

    throw lastError || new Error(`Failed to emit event to channel '${channel}' after ${retries} retries`);
  }
}

/**
 * Create a global subscription manager instance
 */
export const createSubscriptionManager = (): SubscriptionManager => {
  return new SubscriptionManager();
};
