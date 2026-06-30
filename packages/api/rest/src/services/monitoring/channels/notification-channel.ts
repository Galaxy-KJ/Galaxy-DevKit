/**
 * @fileoverview Strategy contract for delivering alert events to a destination.
 * @description One implementation per channel kind (webhook, email, ...).
 *              Channels MUST be idempotent on the receiver side via payload.eventId.
 * @author Galaxy DevKit Team
 * @since 2026-06-29
 */

import { AlertEventPayload, ChannelDeliveryResult, MonitoringAlert } from '../../../types/monitoring-types';

export interface INotificationChannel {
  readonly kind: 'webhook' | 'email';
  send(alert: MonitoringAlert, payload: AlertEventPayload): Promise<ChannelDeliveryResult>;
}
