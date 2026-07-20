/**
 * @fileoverview WebSocket notification channel.
 * @description Delivers alert events to connected WebSocket clients in real time
 *              by emitting to a topic room. The room key is taken from
 *              `alert.channelConfig.topic` (e.g. `alert:{alertId}` or
 *              `user:{userId}`).
 *
 *              Decoupled from any specific WebSocket server via the
 *              `IWebSocketEmitter` interface, making it fully testable without
 *              a live socket server.
 *
 * @author Galaxy DevKit Team
 * @since 2026-07-01
 */

import {
  AlertEventPayload,
  ChannelDeliveryResult,
  MonitoringAlert,
  WebSocketChannelConfig,
} from '../../../types/monitoring-types';
import { INotificationChannel } from './notification-channel';

/**
 * Minimal interface for a WebSocket emitter.
 * Inject the real `io` (socket.io Server) in production;
 * inject a mock in unit tests.
 */
export interface IWebSocketEmitter {
  to(room: string): { emit(event: string, data: unknown): void };
}

export class WebSocketChannel implements INotificationChannel {
  readonly kind = 'websocket' as const;

  constructor(private readonly emitter: IWebSocketEmitter) {}

  async send(alert: MonitoringAlert, payload: AlertEventPayload): Promise<ChannelDeliveryResult> {
    const config = alert.channelConfig as WebSocketChannelConfig;
    const start = Date.now();

    try {
      this.emitter.to(config.topic).emit('monitoring.alert.triggered', payload);
      return {
        success: true,
        durationMs: Date.now() - start,
        retryable: false,
      };
    } catch (err) {
      return {
        success: false,
        durationMs: Date.now() - start,
        retryable: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}