/**
 * @fileoverview Notification Service for Social Recovery
 * @description Handles notifications for guardians and wallet owners
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { EventEmitter } from 'events';
import {
  RecoveryNotification,
  NotificationType,
  Guardian,
} from './types';
import crypto from 'crypto';

// Decryption utility (inline to avoid cross-package dependency)
function decryptData(encrypted: { ciphertext: string; iv: string; salt: string; authTag: string; algorithm: string }, password: string): string {
  const algorithm = 'aes-256-gcm';
  const iv = Buffer.from(encrypted.iv, 'base64');
  const salt = Buffer.from(encrypted.salt, 'base64');
  const authTag = Buffer.from(encrypted.authTag, 'base64');
  const ciphertext = Buffer.from(encrypted.ciphertext, 'base64');
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * Notification service for recovery system
 */
export class NotificationService extends EventEmitter {
  private encryptionKey: string;
  private emailService?: (to: string, subject: string, body: string) => Promise<void>;
  private smsService?: (to: string, message: string) => Promise<void>;
  private pushService?: (to: string, title: string, body: string) => Promise<void>;

  constructor(
    encryptionKey: string,
    options?: {
      emailService?: (to: string, subject: string, body: string) => Promise<void>;
      smsService?: (to: string, message: string) => Promise<void>;
      pushService?: (to: string, title: string, body: string) => Promise<void>;
    }
  ) {
    super();
    this.encryptionKey = encryptionKey;
    this.emailService = options?.emailService;
    this.smsService = options?.smsService;
    this.pushService = options?.pushService;
  }

  /**
   * Sends a notification based on type
   */
  async sendNotification(
    notification: RecoveryNotification,
    guardian?: Guardian
  ): Promise<void> {
    try {
      // Determine contact method
      let contact: string | undefined;
      if (guardian?.contact) {
        try {
          const encrypted = JSON.parse(guardian.contact);
          contact = decryptData(encrypted, this.encryptionKey);
        } catch {
          // Contact decryption failed, skip
        }
      }

      // Send based on notification type
      switch (notification.type) {
        case NotificationType.RECOVERY_INITIATED:
          await this.sendRecoveryInitiated(notification, contact);
          break;
        case NotificationType.GUARDIAN_APPROVAL_REQUEST:
          await this.sendGuardianApprovalRequest(notification, contact);
          break;
        case NotificationType.THRESHOLD_REACHED:
          await this.sendThresholdReached(notification, contact);
          break;
        case NotificationType.TIME_LOCK_WARNING:
          await this.sendTimeLockWarning(notification, contact);
          break;
        case NotificationType.RECOVERY_EXECUTED:
          await this.sendRecoveryExecuted(notification, contact);
          break;
        case NotificationType.RECOVERY_CANCELLED:
          await this.sendRecoveryCancelled(notification, contact);
          break;
        case NotificationType.GUARDIAN_ADDED:
          await this.sendGuardianAdded(notification, contact);
          break;
        case NotificationType.GUARDIAN_REMOVED:
          await this.sendGuardianRemoved(notification, contact);
          break;
        default:
          console.warn(`Unknown notification type: ${notification.type}`);
      }

      this.emit('notification-sent', notification);
    } catch (error) {
      this.emit('notification-error', { notification, error });
      throw error;
    }
  }

  /**
   * Sends recovery initiated notification
   */
  private async sendRecoveryInitiated(
    notification: RecoveryNotification,
    contact?: string
  ): Promise<void> {
    const subject = 'Wallet Recovery Initiated';
    const body = `
A recovery process has been initiated for your wallet.

Recovery Request ID: ${notification.recoveryRequestId}
Scheduled Execution: ${notification.metadata?.executesAt || 'N/A'}

If you did not initiate this recovery, please cancel it immediately.

${notification.message}
    `.trim();

    await this.sendByMethod(contact, subject, body, 'Recovery Initiated');
  }

  /**
   * Sends guardian approval request notification
   */
  private async sendGuardianApprovalRequest(
    notification: RecoveryNotification,
    contact?: string
  ): Promise<void> {
    const subject = 'Recovery Approval Required';
    const body = `
You have been requested to approve a wallet recovery.

Recovery Request ID: ${notification.recoveryRequestId}
Wallet: ${notification.metadata?.walletPublicKey || 'N/A'}
New Owner: ${notification.metadata?.newOwnerKey || 'N/A'}

Please review and approve if this recovery is legitimate.

${notification.message}
    `.trim();

    await this.sendByMethod(contact, subject, body, 'Approval Required');
  }

  /**
   * Sends threshold reached notification
   */
  private async sendThresholdReached(
    notification: RecoveryNotification,
    contact?: string
  ): Promise<void> {
    const subject = 'Recovery Threshold Reached';
    const body = `
The recovery threshold has been reached. The recovery will execute automatically.

Recovery Request ID: ${notification.recoveryRequestId}
Execution Time: ${notification.metadata?.executesAt || 'N/A'}

If you did not initiate this recovery, you can still cancel it before execution.

${notification.message}
    `.trim();

    await this.sendByMethod(contact, subject, body, 'Threshold Reached');
  }

  /**
   * Sends time-lock warning notification
   */
  private async sendTimeLockWarning(
    notification: RecoveryNotification,
    contact?: string
  ): Promise<void> {
    const subject = 'Recovery Execution Warning';
    const body = `
⚠️ WARNING: Recovery will execute in 24 hours

Recovery Request ID: ${notification.recoveryRequestId}
Execution Time: ${notification.message.match(/\d{4}-\d{2}-\d{2}T[\d:.-]+Z/)?.[0] || 'N/A'}

If you did not initiate this recovery, cancel it immediately.

${notification.message}
    `.trim();

    await this.sendByMethod(contact, subject, body, 'Execution Warning');
  }

  /**
   * Sends recovery executed notification
   */
  private async sendRecoveryExecuted(
    notification: RecoveryNotification,
    contact?: string
  ): Promise<void> {
    const subject = 'Recovery Completed';
    const body = `
The wallet recovery has been completed successfully.

Recovery Request ID: ${notification.recoveryRequestId}
Transaction: ${notification.message.match(/Transaction: (\w+)/)?.[1] || 'N/A'}

Your wallet ownership has been transferred.

${notification.message}
    `.trim();

    await this.sendByMethod(contact, subject, body, 'Recovery Completed');
  }

  /**
   * Sends recovery cancelled notification
   */
  private async sendRecoveryCancelled(
    notification: RecoveryNotification,
    contact?: string
  ): Promise<void> {
    const subject = 'Recovery Cancelled';
    const body = `
The recovery process has been cancelled.

Recovery Request ID: ${notification.recoveryRequestId}

${notification.message}
    `.trim();

    await this.sendByMethod(contact, subject, body, 'Recovery Cancelled');
  }

  /**
   * Sends guardian added notification
   */
  private async sendGuardianAdded(
    notification: RecoveryNotification,
    contact?: string
  ): Promise<void> {
    const subject = 'Added as Recovery Guardian';
    const body = `
You have been added as a recovery guardian for a wallet.

${notification.message}

Please verify your guardian status to activate your role.
    `.trim();

    await this.sendByMethod(contact, subject, body, 'Guardian Added');
  }

  /**
   * Sends guardian removed notification
   */
  private async sendGuardianRemoved(
    notification: RecoveryNotification,
    contact?: string
  ): Promise<void> {
    const subject = 'Removed as Recovery Guardian';
    const body = `
You have been removed as a recovery guardian.

${notification.message}
    `.trim();

    await this.sendByMethod(contact, subject, body, 'Guardian Removed');
  }

  /**
   * Sends notification by the configured method
   */
  private async sendByMethod(
    contact: string | undefined,
    subject: string,
    body: string,
    pushTitle: string
  ): Promise<void> {
    if (!contact) {
      // No contact info, emit event for logging
      this.emit('notification-skipped', { reason: 'no-contact-info' });
      return;
    }

    // Try to determine if it's email or phone
    const isEmail = contact.includes('@');
    const isPhone = /^\+?[\d\s-()]+$/.test(contact);

    if (isEmail && this.emailService) {
      await this.emailService(contact, subject, body);
    } else if (isPhone && this.smsService) {
      await this.smsService(contact, body);
    } else if (this.pushService) {
      // Fallback to push notification
      await this.pushService(contact, pushTitle, body);
    } else {
      // No service available, just log
      console.log(`[Notification] ${subject}: ${body}`);
      this.emit('notification-logged', { contact, subject, body });
    }
  }
}
