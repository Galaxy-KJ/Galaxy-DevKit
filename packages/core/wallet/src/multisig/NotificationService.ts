/**
 * @fileoverview Notification Service for Multi-Sig
 * @description Handles notifications for multi-sig signers
 */

import { EventEmitter } from 'events';
import { MultiSigNotification, MultiSigNotificationType } from './types';

export class NotificationService extends EventEmitter {
  private emailService?: (to: string, subject: string, body: string) => Promise<void>;

  constructor(options?: {
    emailService?: (to: string, subject: string, body: string) => Promise<void>;
  }) {
    super();
    this.emailService = options?.emailService;
  }

  async sendNotification(notification: MultiSigNotification): Promise<void> {
    try {
      this.emit('notification', notification);

      if (this.emailService && notification.recipient.includes('@')) {
        await this.emailService(
          notification.recipient,
          notification.subject,
          notification.message
        );
      } else {
        console.log(`[MultiSig Notification] To: ${notification.recipient} | ${notification.subject}`);
      }
    } catch (error) {
      console.error('Failed to send notification', error);
      this.emit('error', error);
    }
  }

  async notifySigners(
    signers: Array<{ publicKey: string; email?: string }>,
    type: MultiSigNotificationType,
    context: { proposalId: string; description?: string; wallet: string }
  ): Promise<void> {
    for (const signer of signers) {
      let subject = '';
      let message = '';

      switch (type) {
        case MultiSigNotificationType.PROPOSAL_CREATED:
          subject = `New Multi-Sig Proposal: ${context.proposalId}`;
          message = `A new transaction proposal has been created for wallet ${context.wallet}.\nDescription: ${context.description || 'No description'}\nPlease review and sign.`;
          break;
        case MultiSigNotificationType.PROPOSAL_EXECUTED:
          subject = `Proposal Executed: ${context.proposalId}`;
          message = `The transaction proposal ${context.proposalId} for wallet ${context.wallet} has been successfully executed.`;
          break;
        case MultiSigNotificationType.PROPOSAL_CANCELLED:
          subject = `Proposal Cancelled: ${context.proposalId}`;
          message = `The transaction proposal ${context.proposalId} has been cancelled.`;
          break;
      }

      if (subject) {
        await this.sendNotification({
          type,
          recipient: signer.email || signer.publicKey,
          subject,
          message,
          metadata: context,
        });
      }
    }
  }
}