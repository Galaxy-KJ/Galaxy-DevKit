/**
 * @fileoverview Strategy contract for delivering alert events to a destination.
 * @description One implementation per channel kind: webhook, email, websocket.
 *              Channels MUST be idempotent on the receiver side via payload.eventId.
 * @author Galaxy DevKit Team
 * @since 2026-06-29 (extended 2026-07-01 with websocket)
 */

import { AlertEventPayload, ChannelDeliveryResult, MonitoringAlert } from '../../../types/monitoring-types';

export interface INotificationChannel {
  readonly kind: 'webhook' | 'email' | 'websocket';
  send(alert: MonitoringAlert, payload: AlertEventPayload): Promise<ChannelDeliveryResult>;
}