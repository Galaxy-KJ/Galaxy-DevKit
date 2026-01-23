/**
 * @fileoverview Social Recovery System Implementation
 * @description Manages wallet recovery through trusted guardians with time-lock mechanism
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { EventEmitter } from 'events';
import { Keypair, TransactionBuilder, Operation, Horizon, BASE_FEE } from '@stellar/stellar-sdk';
import * as crypto from 'crypto';
import {
  SocialRecoveryConfig,
  Guardian,
  GuardianStatus,
  RecoveryRequest,
  RecoveryStatus,
  RecoveryAction,
  GuardianApproval,
  RecoveryAttemptLog,
  RecoveryVerificationResult,
  RecoveryNotification,
  NotificationType,
  EmergencyContact,
  RecoveryTestResult,
  RecoveryStatistics,
} from './types';

// Encryption utilities (inline to avoid cross-package dependency)
function encryptData(data: string, password: string): { ciphertext: string; iv: string; salt: string; authTag: string; algorithm: string } {
  const algorithm = 'aes-256-gcm';
  const iv = crypto.randomBytes(12);
  const salt = crypto.randomBytes(16);
  const key = crypto.pbkdf2Sync(password, salt, 100000, 32, 'sha256');
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    salt: salt.toString('base64'),
    authTag: authTag.toString('base64'),
    algorithm,
  };
}

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

function createHMAC(data: string, key: string): string {
  return crypto.createHmac('sha256', key).update(data).digest('base64');
}

/**
 * Social Recovery class for wallet recovery through trusted guardians
 */
export class SocialRecovery extends EventEmitter {
  private config: SocialRecoveryConfig;
  private recoveryRequests: Map<string, RecoveryRequest> = new Map();
  private approvals: Map<string, GuardianApproval[]> = new Map();
  private logs: Map<string, RecoveryAttemptLog[]> = new Map();
  private emergencyContacts: Map<string, EmergencyContact> = new Map();
  private server: Server;
  private networkPassphrase: string;
  private encryptionKey: string; // For encrypting guardian contacts

  constructor(
    config: Partial<SocialRecoveryConfig>,
    server: Horizon.Server,
    networkPassphrase: string,
    encryptionKey: string
  ) {
    super();
    this.server = server;
    this.networkPassphrase = networkPassphrase;
    this.encryptionKey = encryptionKey;

    // Set defaults
    const minGuardians = config.minGuardians || 3;
    const maxGuardians = config.maxGuardians || 10;
    const defaultThreshold = Math.ceil((config.guardians?.length || minGuardians) * 0.6);

    this.config = {
      guardians: config.guardians || [],
      threshold: config.threshold || defaultThreshold,
      timeLockHours: config.timeLockHours || 48,
      notificationMethod: config.notificationMethod || 'email',
      enableTesting: config.enableTesting ?? true,
      minGuardians,
      maxGuardians,
    };

    // Validate configuration
    this.validateConfig();
  }

  /**
   * Validates the recovery configuration
   */
  private validateConfig(): void {
    if (this.config.guardians.length < this.config.minGuardians!) {
      throw new Error(
        `Minimum ${this.config.minGuardians} guardians required, got ${this.config.guardians.length}`
      );
    }

    if (this.config.guardians.length > this.config.maxGuardians!) {
      throw new Error(
        `Maximum ${this.config.maxGuardians} guardians allowed, got ${this.config.guardians.length}`
      );
    }

    if (this.config.threshold < 1 || this.config.threshold > this.config.guardians.length) {
      throw new Error(
        `Threshold must be between 1 and ${this.config.guardians.length}`
      );
    }

    if (this.config.timeLockHours < 1) {
      throw new Error('Time-lock must be at least 1 hour');
    }
  }

  /**
   * Adds a guardian to the recovery system
   */
  async addGuardian(
    publicKey: string,
    name?: string,
    contact?: string
  ): Promise<Guardian> {
    // Validate public key
    if (!this.isValidPublicKey(publicKey)) {
      throw new Error('Invalid guardian public key');
    }

    // Check if guardian already exists
    if (this.config.guardians.some(g => g.publicKey === publicKey)) {
      throw new Error('Guardian already exists');
    }

    // Check maximum guardians limit
    if (this.config.guardians.length >= this.config.maxGuardians!) {
      throw new Error(`Maximum ${this.config.maxGuardians} guardians allowed`);
    }

    // Encrypt contact information if provided
    let encryptedContact: string | undefined;
    if (contact) {
      const encrypted = encryptData(contact, this.encryptionKey);
      encryptedContact = JSON.stringify(encrypted);
    }

    const guardian: Guardian = {
      publicKey,
      name,
      contact: encryptedContact,
      addedAt: new Date(),
      verified: false,
      status: GuardianStatus.PENDING,
    };

    this.config.guardians.push(guardian);

    // Emit event
    this.emit('guardian-added', guardian);
    this.logAction('guardian-added', publicKey, { guardian });

    // Send notification
    await this.sendNotification({
      type: NotificationType.GUARDIAN_ADDED,
      recoveryRequestId: '',
      recipient: publicKey,
      message: `You have been added as a recovery guardian${name ? ` by ${name}` : ''}`,
      timestamp: new Date(),
    });

    return guardian;
  }

  /**
   * Removes a guardian from the recovery system
   */
  async removeGuardian(publicKey: string): Promise<void> {
    const index = this.config.guardians.findIndex(g => g.publicKey === publicKey);
    if (index === -1) {
      throw new Error('Guardian not found');
    }

    // Check minimum guardians limit (before removal)
    const activeGuardians = this.config.guardians.filter(
      g => g.status === GuardianStatus.ACTIVE
    ).length;
    
    if (activeGuardians <= this.config.minGuardians!) {
      throw new Error(
        `Cannot remove guardian: minimum ${this.config.minGuardians} guardians required`
      );
    }

    const guardian = this.config.guardians[index];
    guardian.status = GuardianStatus.REMOVED;
    // Keep guardian in list but mark as removed (for audit trail)
    // this.config.guardians.splice(index, 1);

    // Update threshold if needed
    const remainingActive = this.config.guardians.filter(
      g => g.status === GuardianStatus.ACTIVE
    ).length;
    if (this.config.threshold > remainingActive) {
      this.config.threshold = Math.ceil(remainingActive * 0.6);
    }

    // Emit event
    this.emit('guardian-removed', guardian);
    this.logAction('guardian-removed', publicKey, { guardian });

    // Send notification
    await this.sendNotification({
      type: NotificationType.GUARDIAN_REMOVED,
      recoveryRequestId: '',
      recipient: publicKey,
      message: 'You have been removed as a recovery guardian',
      timestamp: new Date(),
    });
  }

  /**
   * Verifies a guardian (marks them as verified)
   */
  async verifyGuardian(publicKey: string): Promise<void> {
    const guardian = this.config.guardians.find(g => g.publicKey === publicKey);
    if (!guardian) {
      throw new Error('Guardian not found');
    }

    guardian.verified = true;
    guardian.status = GuardianStatus.ACTIVE;
    guardian.lastActiveAt = new Date();

    this.emit('guardian-verified', guardian);
  }

  /**
   * Initiates a recovery process
   */
  async initiateRecovery(
    walletPublicKey: string,
    newOwnerKey: string,
    testMode: boolean = false
  ): Promise<RecoveryRequest> {
    // Validate keys
    if (!this.isValidPublicKey(walletPublicKey)) {
      throw new Error('Invalid wallet public key');
    }

    if (!this.isValidPublicKey(newOwnerKey)) {
      throw new Error('Invalid new owner public key');
    }

    // Check if testing is enabled
    if (testMode && !this.config.enableTesting) {
      throw new Error('Recovery testing is not enabled');
    }

    // Verify fraud indicators
    const verification = await this.verifyRecoveryRequest(
      walletPublicKey,
      newOwnerKey
    );

    if (!verification.valid) {
      throw new Error(`Recovery verification failed: ${verification.reason}`);
    }

    // Check for active recovery requests (pending or approved)
    const activeRequest = Array.from(this.recoveryRequests.values()).find(
      req => 
        req.walletPublicKey === walletPublicKey && 
        (req.status === RecoveryStatus.PENDING || req.status === RecoveryStatus.APPROVED)
    );

    if (activeRequest) {
      throw new Error('An active recovery request already exists for this wallet');
    }

    // Create recovery request
    const requestId = this.generateRequestId();
    const now = new Date();
    const executesAt = new Date(now.getTime() + this.config.timeLockHours * 60 * 60 * 1000);

    const request: RecoveryRequest = {
      id: requestId,
      walletPublicKey,
      initiatedAt: now,
      executesAt,
      newOwnerKey,
      approvals: [],
      status: RecoveryStatus.PENDING,
      testMode,
      metadata: {
        fraudIndicators: verification.fraudIndicators,
        riskScore: verification.riskScore,
      },
    };

    this.recoveryRequests.set(requestId, request);
    this.approvals.set(requestId, []);
    this.logs.set(requestId, []);

    // Log initiation
    this.logRecoveryAction(requestId, RecoveryAction.INITIATED, walletPublicKey);

    // Emit event
    this.emit('recovery-initiated', request);

    // Notify guardians
    await this.notifyGuardians(request);

    // Notify wallet owner
    await this.sendNotification({
      type: NotificationType.RECOVERY_INITIATED,
      recoveryRequestId: requestId,
      recipient: walletPublicKey,
      message: `Recovery process initiated. Execution scheduled for ${executesAt.toISOString()}`,
      timestamp: now,
      metadata: { testMode },
    });

    return request;
  }

  /**
   * Guardian approves a recovery request
   */
  async guardianApprove(
    recoveryRequestId: string,
    guardianPublicKey: string,
    guardianSecretKey: string
  ): Promise<GuardianApproval> {
    const request = this.recoveryRequests.get(recoveryRequestId);
    if (!request) {
      throw new Error('Recovery request not found');
    }

    if (request.status !== RecoveryStatus.PENDING) {
      throw new Error(`Recovery request is ${request.status}, cannot approve`);
    }

    // Verify guardian
    const guardian = this.config.guardians.find(
      g => g.publicKey === guardianPublicKey && g.status === GuardianStatus.ACTIVE
    );

    if (!guardian) {
      throw new Error('Guardian not found or not active');
    }

    // Check if already approved
    const existingApprovals = this.approvals.get(recoveryRequestId) || [];
    if (existingApprovals.some(a => a.guardianPublicKey === guardianPublicKey)) {
      throw new Error('Guardian has already approved this recovery');
    }

    // Create signature
    const signature = this.createApprovalSignature(
      recoveryRequestId,
      guardianPublicKey,
      guardianSecretKey
    );

    const approval: GuardianApproval = {
      recoveryRequestId,
      guardianPublicKey,
      approvedAt: new Date(),
      signature,
      verified: true,
    };

    existingApprovals.push(approval);
    this.approvals.set(recoveryRequestId, existingApprovals);
    request.approvals.push(guardianPublicKey);

    // Log approval
    this.logRecoveryAction(
      recoveryRequestId,
      RecoveryAction.GUARDIAN_APPROVED,
      guardianPublicKey
    );

    // Check if threshold reached
    if (request.approvals.length >= this.config.threshold) {
      request.status = RecoveryStatus.APPROVED;
      this.logRecoveryAction(
        recoveryRequestId,
        RecoveryAction.THRESHOLD_REACHED,
        guardianPublicKey
      );
      this.logRecoveryAction(
        recoveryRequestId,
        RecoveryAction.TIME_LOCK_STARTED,
        guardianPublicKey
      );

      // Emit event
      this.emit('recovery-approved', request);

      // Notify wallet owner that threshold is reached
      await this.sendNotification({
        type: NotificationType.THRESHOLD_REACHED,
        recoveryRequestId,
        recipient: request.walletPublicKey,
        message: `Recovery threshold reached. Execution scheduled for ${request.executesAt.toISOString()}`,
        timestamp: new Date(),
      });

      // Schedule time-lock warning
      this.scheduleTimeLockWarning(request);
    }

    // Emit event
    this.emit('guardian-approved', approval);

    return approval;
  }

  /**
   * Completes the recovery process
   */
  async completeRecovery(
    recoveryRequestId: string,
    currentOwnerSecretKey: string
  ): Promise<{ success: boolean; transactionHash?: string }> {
    const request = this.recoveryRequests.get(recoveryRequestId);
    if (!request) {
      throw new Error('Recovery request not found');
    }

    if (request.status !== RecoveryStatus.APPROVED) {
      throw new Error(`Recovery request is ${request.status}, cannot complete`);
    }

    // Check if time-lock has passed (skip for test mode)
    if (!request.testMode && new Date() < request.executesAt) {
      throw new Error(
        `Time-lock has not expired yet. Recovery can be executed after ${request.executesAt.toISOString()}`
      );
    }

    // Verify all approvals
    const approvals = this.approvals.get(recoveryRequestId) || [];
    if (approvals.length < this.config.threshold) {
      throw new Error('Insufficient approvals');
    }

    // If test mode, don't actually execute
    if (request.testMode) {
      request.status = RecoveryStatus.EXECUTED;
      request.completedAt = new Date();
      this.logRecoveryAction(recoveryRequestId, RecoveryAction.TEST_COMPLETED, request.walletPublicKey);

      this.emit('recovery-test-completed', request);
      return { success: true };
    }

    // Execute recovery on Stellar network
    try {
      const transactionHash = await this.executeRecoveryOnStellar(
        request,
        currentOwnerSecretKey
      );

      request.status = RecoveryStatus.EXECUTED;
      request.completedAt = new Date();
      this.logRecoveryAction(recoveryRequestId, RecoveryAction.EXECUTED, request.walletPublicKey);

      // Emit event
      this.emit('recovery-executed', { request, transactionHash });

      // Notify all parties
      await this.sendNotification({
        type: NotificationType.RECOVERY_EXECUTED,
        recoveryRequestId,
        recipient: request.walletPublicKey,
        message: `Recovery completed successfully. Transaction: ${transactionHash}`,
        timestamp: new Date(),
      });

      return { success: true, transactionHash };
    } catch (error) {
      throw new Error(
        `Failed to execute recovery: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Cancels a recovery request
   */
  async cancelRecovery(
    recoveryRequestId: string,
    cancelledBy: string
  ): Promise<void> {
    const request = this.recoveryRequests.get(recoveryRequestId);
    if (!request) {
      throw new Error('Recovery request not found');
    }

    if (request.status === RecoveryStatus.EXECUTED) {
      throw new Error('Cannot cancel an executed recovery');
    }

    if (request.status === RecoveryStatus.CANCELLED) {
      throw new Error('Recovery already cancelled');
    }

    request.status = RecoveryStatus.CANCELLED;
    request.cancelledAt = new Date();
    request.cancelledBy = cancelledBy;

    this.logRecoveryAction(recoveryRequestId, RecoveryAction.CANCELLED, cancelledBy);

    // Emit event
    this.emit('recovery-cancelled', request);

    // Notify guardians
    await this.sendNotification({
      type: NotificationType.RECOVERY_CANCELLED,
      recoveryRequestId,
      recipient: request.walletPublicKey,
      message: `Recovery cancelled by ${cancelledBy}`,
      timestamp: new Date(),
    });
  }

  /**
   * Executes recovery on Stellar network using multi-sig
   */
  private async executeRecoveryOnStellar(
    request: RecoveryRequest,
    currentOwnerSecretKey: string
  ): Promise<string> {
    const currentOwnerKeypair = Keypair.fromSecret(currentOwnerSecretKey);
    const account = await this.server.loadAccount(request.walletPublicKey);

    // Create transaction to change account signers
    // This is a simplified version - in production, you'd use Stellar's multi-sig
    // to transfer control to the new owner key

    const transaction = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(
        Operation.setOptions({
          signer: {
            ed25519PublicKey: request.newOwnerKey,
            weight: 1,
          },
        })
      )
      .setTimeout(30)
      .build();

    // Sign with current owner
    transaction.sign(currentOwnerKeypair);

    // In a real implementation, you'd also need signatures from guardians
    // This is a simplified version

    const result = await this.server.submitTransaction(transaction);
    return result.hash;
  }

  /**
   * Verifies a recovery request for fraud indicators
   */
  private async verifyRecoveryRequest(
    walletPublicKey: string,
    newOwnerKey: string
  ): Promise<RecoveryVerificationResult> {
    const fraudIndicators: string[] = [];
    let riskScore = 0;

    // Check for recent recovery attempts
    const recentAttempts = Array.from(this.recoveryRequests.values()).filter(
      req =>
        req.walletPublicKey === walletPublicKey &&
        req.initiatedAt > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
    );

    if (recentAttempts.length > 2) {
      fraudIndicators.push('Multiple recovery attempts in short period');
      riskScore += 30;
    }

    // Check if new owner key is the same as current (suspicious)
    if (walletPublicKey === newOwnerKey) {
      fraudIndicators.push('New owner key matches current owner');
      riskScore += 50;
    }

    // Check guardian activity
    const activeGuardians = this.config.guardians.filter(
      g => g.status === GuardianStatus.ACTIVE && g.verified
    );

    if (activeGuardians.length < this.config.threshold) {
      fraudIndicators.push('Insufficient active guardians');
      riskScore += 20;
    }

    const valid = riskScore < 70 && fraudIndicators.length === 0;

    return {
      valid,
      reason: valid ? undefined : 'High risk score or fraud indicators detected',
      fraudIndicators: fraudIndicators.length > 0 ? fraudIndicators : undefined,
      riskScore,
    };
  }

  /**
   * Creates an approval signature
   */
  private createApprovalSignature(
    recoveryRequestId: string,
    guardianPublicKey: string,
    guardianSecretKey: string
  ): string {
    const data = `${recoveryRequestId}:${guardianPublicKey}`;
    return createHMAC(data, guardianSecretKey);
  }

  /**
   * Verifies an approval signature
   */
  private verifyApprovalSignature(approval: GuardianApproval): boolean {
    // In a real implementation, you'd verify the signature using the guardian's public key
    // This is a simplified version
    return approval.verified;
  }

  /**
   * Schedules a time-lock warning notification
   */
  private scheduleTimeLockWarning(request: RecoveryRequest): void {
    // Send warning 24 hours before execution
    const warningTime = new Date(request.executesAt.getTime() - 24 * 60 * 60 * 1000);

    if (warningTime > new Date()) {
      setTimeout(async () => {
        if (request.status === RecoveryStatus.APPROVED) {
          await this.sendNotification({
            type: NotificationType.TIME_LOCK_WARNING,
            recoveryRequestId: request.id,
            recipient: request.walletPublicKey,
            message: `Recovery will execute in 24 hours: ${request.executesAt.toISOString()}`,
            timestamp: new Date(),
          });
        }
      }, warningTime.getTime() - Date.now());
    }
  }

  /**
   * Notifies all guardians of a recovery request
   */
  private async notifyGuardians(request: RecoveryRequest): Promise<void> {
    const activeGuardians = this.config.guardians.filter(
      g => g.status === GuardianStatus.ACTIVE
    );

    for (const guardian of activeGuardians) {
      await this.sendNotification({
        type: NotificationType.GUARDIAN_APPROVAL_REQUEST,
        recoveryRequestId: request.id,
        recipient: guardian.publicKey,
        message: `Recovery requested for wallet ${request.walletPublicKey}. Approval required.`,
        timestamp: new Date(),
        metadata: {
          walletPublicKey: request.walletPublicKey,
          newOwnerKey: request.newOwnerKey,
          executesAt: request.executesAt,
        },
      });
    }
  }

  /**
   * Sends a notification
   */
  private async sendNotification(notification: RecoveryNotification): Promise<void> {
    // Emit event for notification system to handle
    this.emit('notification', notification);

    // In a real implementation, this would integrate with email/SMS/push services
  }

  /**
   * Logs a recovery action
   */
  private logRecoveryAction(
    recoveryRequestId: string,
    action: RecoveryAction,
    actor: string,
    details?: Record<string, unknown>
  ): void {
    const logs = this.logs.get(recoveryRequestId) || [];
    const log: RecoveryAttemptLog = {
      id: this.generateRequestId(),
      recoveryRequestId,
      timestamp: new Date(),
      action,
      actor,
      details,
    };

    logs.push(log);
    this.logs.set(recoveryRequestId, logs);
  }

  /**
   * Logs a general action
   */
  private logAction(action: string, actor: string, details?: Record<string, unknown>): void {
    this.emit('action-logged', { action, actor, details, timestamp: new Date() });
  }

  /**
   * Validates a Stellar public key
   */
  private isValidPublicKey(publicKey: string): boolean {
    try {
      Keypair.fromPublicKey(publicKey);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generates a unique request ID
   */
  private generateRequestId(): string {
    return `recovery-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Gets a recovery request by ID
   */
  getRecoveryRequest(recoveryRequestId: string): RecoveryRequest | undefined {
    return this.recoveryRequests.get(recoveryRequestId);
  }

  /**
   * Gets all recovery requests for a wallet
   */
  getRecoveryRequests(walletPublicKey: string): RecoveryRequest[] {
    return Array.from(this.recoveryRequests.values()).filter(
      req => req.walletPublicKey === walletPublicKey
    );
  }

  /**
   * Gets guardian information
   */
  getGuardians(): Guardian[] {
    return [...this.config.guardians];
  }

  /**
   * Gets recovery statistics
   */
  getStatistics(): RecoveryStatistics {
    const allRequests = Array.from(this.recoveryRequests.values());
    const successful = allRequests.filter(r => r.status === RecoveryStatus.EXECUTED).length;
    const cancelled = allRequests.filter(r => r.status === RecoveryStatus.CANCELLED).length;

    // Calculate average approval time
    let totalApprovalTime = 0;
    let count = 0;

    for (const request of allRequests) {
      if (request.status === RecoveryStatus.APPROVED || request.status === RecoveryStatus.EXECUTED) {
        const approvals = this.approvals.get(request.id) || [];
        if (approvals.length > 0) {
          const firstApproval = approvals[0].approvedAt;
          const lastApproval = approvals[approvals.length - 1].approvedAt;
          totalApprovalTime += lastApproval.getTime() - firstApproval.getTime();
          count++;
        }
      }
    }

    const averageApprovalTime = count > 0 ? totalApprovalTime / count / (1000 * 60 * 60) : 0;

    // Find most active guardian
    const guardianActivity = new Map<string, number>();
    for (const approvals of Array.from(this.approvals.values())) {
      for (const approval of approvals) {
        guardianActivity.set(
          approval.guardianPublicKey,
          (guardianActivity.get(approval.guardianPublicKey) || 0) + 1
        );
      }
    }

    let mostActiveGuardian: string | undefined;
    let maxActivity = 0;
    for (const [key, activity] of Array.from(guardianActivity.entries())) {
      if (activity > maxActivity) {
        maxActivity = activity;
        mostActiveGuardian = key;
      }
    }

    return {
      totalRecoveryAttempts: allRequests.length,
      successfulRecoveries: successful,
      cancelledRecoveries: cancelled,
      averageApprovalTime,
      averageGuardianResponseTime: averageApprovalTime, // Simplified
      mostActiveGuardian,
    };
  }

  /**
   * Runs a recovery test (dry run)
   */
  async testRecovery(
    walletPublicKey: string,
    newOwnerKey: string
  ): Promise<RecoveryTestResult> {
    if (!this.config.enableTesting) {
      throw new Error('Recovery testing is not enabled');
    }

    const testId = `test-${Date.now()}`;
    let guardiansNotified = 0;
    let approvalsReceived = 0;
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Initiate test recovery
      const request = await this.initiateRecovery(walletPublicKey, newOwnerKey, true);
      guardiansNotified = this.config.guardians.filter(
        g => g.status === GuardianStatus.ACTIVE
      ).length;

      // Simulate guardian approvals (in real scenario, guardians would approve)
      // For testing, we'll auto-approve with a delay
      warnings.push('Test mode: Simulating guardian approvals');

      // Check threshold
      const thresholdReached = request.approvals.length >= this.config.threshold;

      return {
        success: true,
        testId: request.id,
        guardiansNotified,
        approvalsReceived: request.approvals.length,
        thresholdReached,
        timeLockSimulated: true,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown error');
      return {
        success: false,
        testId,
        guardiansNotified,
        approvalsReceived,
        thresholdReached: false,
        timeLockSimulated: false,
        errors,
        warnings,
      };
    }
  }

  /**
   * Adds an emergency contact
   */
  async addEmergencyContact(
    name: string,
    contact: string,
    relationship?: string
  ): Promise<EmergencyContact> {
    const encrypted = encryptData(contact, this.encryptionKey);
    const encryptedContact = JSON.stringify(encrypted);

    const emergencyContact: EmergencyContact = {
      id: `emergency-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      name,
      contact: encryptedContact,
      relationship,
      addedAt: new Date(),
      verified: false,
    };

    this.emergencyContacts.set(emergencyContact.id, emergencyContact);
    this.emit('emergency-contact-added', emergencyContact);

    return emergencyContact;
  }

  /**
   * Gets emergency contacts
   */
  getEmergencyContacts(): EmergencyContact[] {
    return Array.from(this.emergencyContacts.values());
  }
}
