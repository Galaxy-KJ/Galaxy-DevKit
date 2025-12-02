/**
 * Subscription Manager for GraphQL
 * Manages real-time subscriptions using an event emitter pattern
 */

type Listener = (event: any) => void;
type UnsubscribeFunction = () => void;

export class SubscriptionManager {
  private listeners: Map<string, Set<Listener>> = new Map();
  private eventQueue: Map<string, any[]> = new Map();
  private maxQueueSize = 100;

  /**
   * Subscribe to a channel and return an async iterator for subscriptions
   */
  public subscribe(channel: string): AsyncIterable<any> {
    const self = this;

    return {
      async *[Symbol.asyncIterator]() {
        const queue: any[] = [];
        let isSubscribed = true;

        const listener = (event: any) => {
          if (isSubscribed) {
            queue.push(event);
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

            // Wait for new events or timeout
            await new Promise((resolve) => {
              const timeout = setTimeout(resolve, 30000); // 30 second timeout
              const checkQueue = () => {
                if (queue.length > 0) {
                  clearTimeout(timeout);
                  resolve(null);
                } else {
                  setTimeout(checkQueue, 100);
                }
              };
              checkQueue();
            });
          }
        } finally {
          isSubscribed = false;
          self.off(channel, listener);
        }
      },
    };
  }

  /**
   * Emit an event to all subscribers on a channel
   */
  public emit(channel: string, event: any): void {
    const listeners = this.listeners.get(channel);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(event);
        } catch (error) {
          console.error(`Error in subscription listener for ${channel}:`, error);
        }
      });
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

        const createListener = (channel: string) => (event: any) => {
          if (isSubscribed) {
            queue.push({ channel, event });
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

            await new Promise((resolve) => {
              const timeout = setTimeout(resolve, 30000);
              const checkQueue = () => {
                if (queue.length > 0) {
                  clearTimeout(timeout);
                  resolve(null);
                } else {
                  setTimeout(checkQueue, 100);
                }
              };
              checkQueue();
            });
          }
        } finally {
          isSubscribed = false;
          unsubscribers.forEach((unsubscribe) => unsubscribe());
        }
      },
    };
  }

  /**
   * Batch emit multiple events
   */
  public batchEmit(events: Array<{ channel: string; event: any }>): void {
    events.forEach(({ channel, event }) => {
      this.emit(channel, event);
    });
  }

  /**
   * Emit event with retry logic
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
        this.emit(channel, event);
        return;
      } catch (error) {
        lastError = error as Error;
        if (i < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs * Math.pow(2, i)));
        }
      }
    }

    throw lastError || new Error('Failed to emit event after retries');
  }
}

/**
 * Create a global subscription manager instance
 */
export const createSubscriptionManager = (): SubscriptionManager => {
  return new SubscriptionManager();
};
