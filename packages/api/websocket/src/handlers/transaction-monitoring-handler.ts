import { Server } from 'socket.io';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { ExtendedSocket } from '../types/websocket-types';
import { config } from '../config';

/**
 * `monitoring:subscribe` is the real-time endpoint for durable transaction
 * monitoring alerts. Events are emitted from the Supabase INSERT subscription
 * after the REST worker has stored them, keeping delivery under a single hop.
 */
export class TransactionMonitoringHandler {
  private readonly supabase: SupabaseClient;

  constructor(private readonly server: Server) {
    this.supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);
    this.server.on('connection', (socket) => this.bind(socket as ExtendedSocket));
    this.supabase.channel('transaction-monitoring-events').on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'transaction_monitoring_events',
    }, (payload) => {
      const event = payload.new as Record<string, unknown>;
      const organizationId = typeof event.organization_id === 'string' ? event.organization_id : null;
      if (!organizationId) return;
      this.server.to(`monitoring:${organizationId}`).emit('monitoring:alert', {
        id: event.id, organizationId, transactionHash: event.transaction_hash,
        pattern: event.pattern, severity: event.severity, details: event.details,
        occurredAt: event.occurred_at,
      });
    }).subscribe();
  }

  private bind(socket: ExtendedSocket): void {
    socket.on('monitoring:subscribe', async (data: { organizationId?: string }) => {
      if (!socket.isAuthenticated || !socket.userId || !data?.organizationId) {
        socket.emit('monitoring:subscription_error', { error: 'Authentication and organizationId are required' }); return;
      }
      const { data: membership, error } = await this.supabase.from('organization_members').select('id').eq('organization_id', data.organizationId).eq('user_id', socket.userId).maybeSingle();
      if (error || !membership) { socket.emit('monitoring:subscription_error', { error: 'Access denied to organization monitoring' }); return; }
      await socket.join(`monitoring:${data.organizationId}`);
      socket.emit('monitoring:subscribed', { organizationId: data.organizationId });
    });
    socket.on('monitoring:unsubscribe', async (data: { organizationId?: string }) => {
      if (data?.organizationId) await socket.leave(`monitoring:${data.organizationId}`);
      socket.emit('monitoring:unsubscribed', { organizationId: data?.organizationId });
    });
  }
}
