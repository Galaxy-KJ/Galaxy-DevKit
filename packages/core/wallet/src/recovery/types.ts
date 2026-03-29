/**
 * @fileoverview Type definitions for Social Recovery System
 * @description Contains all interfaces and types for social recovery functionality
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

/**
 * Guardian information
 */
export interface Guardian {
  publicKey: string;
  name?: string;
  contact?: string; // Encrypted contact information
  addedAt: Date;
  verified: boolean;
  status: GuardianStatus;
  lastActiveAt?: Date;
}

/**
 * Guardian status
 */
export enum GuardianStatus {
  ACTIVE = 'active',
  PENDING = 'pending',
  SUSPENDED = 'suspended',
  REMOVED = 'removed',
}

/**
 * Social recovery configuration
 */
export interface SocialRecoveryConfig {
  guardians: Guardian[];
  threshold: number; // Number of guardians needed for recovery
  timeLockHours: number; // Delay before execution (default: 48 hours)
  notificationMethod?: 'email' | 'sms' | 'push';
  enableTesting?: boolean; // Allow dry-run recovery tests
  minGuardians?: number; // Minimum number of guardians (default: 3)
  maxGuardians?: number; // Maximum number of guardians (default: 10)
}

/**
 * Recovery request
 */
export interface RecoveryRequest {
  id: string;
  walletPublicKey: string;
  initiatedAt: Date;
  executesAt: Date;
  newOwnerKey: string;
  approvals: string[]; // Guardian public keys who approved
  status: RecoveryStatus;
  cancelledAt?: Date;
  cancelledBy?: string;
  completedAt?: Date;
  testMode?: boolean; // If true, this is a dry-run test
  metadata?: Record<string, unknown>;
}

/**
 * Recovery status
 */
export enum RecoveryStatus {
  PENDING = 'pending',
  APPROVED = 'approved', // Threshold reached, waiting for time-lock
  EXECUTED = 'executed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

/**
 * Guardian approval
 */
export interface GuardianApproval {
  recoveryRequestId: string;
  guardianPublicKey: string;
  approvedAt: Date;
  signature: string; // Cryptographic signature
  verified: boolean;
}

/**
 * Recovery attempt log
 */
export interface RecoveryAttemptLog {
  id: string;
  recoveryRequestId: string;
  timestamp: Date;
  action: RecoveryAction;
  actor: string; // Public key of the actor
  details?: Record<string, unknown>;
}

/**
 * Recovery action types
 */
export enum RecoveryAction {
  INITIATED = 'initiated',
  GUARDIAN_APPROVED = 'guardian_approved',
  THRESHOLD_REACHED = 'threshold_reached',
  TIME_LOCK_STARTED = 'time_lock_started',
  EXECUTED = 'executed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  TEST_STARTED = 'test_started',
  TEST_COMPLETED = 'test_completed',
}

/**
 * Recovery verification result
 */
export interface RecoveryVerificationResult {
  valid: boolean;
  reason?: string;
  fraudIndicators?: string[];
  riskScore?: number; // 0-100, higher is riskier
}

/**
 * Notification payload
 */
export interface RecoveryNotification {
  type: NotificationType;
  recoveryRequestId: string;
  recipient: string; // Guardian public key or wallet owner
  message: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Notification types
 */
export enum NotificationType {
  RECOVERY_INITIATED = 'recovery_initiated',
  GUARDIAN_APPROVAL_REQUEST = 'guardian_approval_request',
  THRESHOLD_REACHED = 'threshold_reached',
  TIME_LOCK_WARNING = 'time_lock_warning',
  RECOVERY_EXECUTED = 'recovery_executed',
  RECOVERY_CANCELLED = 'recovery_cancelled',
  GUARDIAN_ADDED = 'guardian_added',
  GUARDIAN_REMOVED = 'guardian_removed',
}

/**
 * Emergency contact
 */
export interface EmergencyContact {
  id: string;
  name: string;
  contact: string; // Encrypted
  relationship?: string;
  addedAt: Date;
  verified: boolean;
}

/**
 * Recovery test result
 */
export interface RecoveryTestResult {
  success: boolean;
  testId: string;
  guardiansNotified: number;
  approvalsReceived: number;
  thresholdReached: boolean;
  timeLockSimulated: boolean;
  errors?: string[];
  warnings?: string[];
}

/**
 * Recovery statistics
 */
export interface RecoveryStatistics {
  totalRecoveryAttempts: number;
  successfulRecoveries: number;
  cancelledRecoveries: number;
  averageApprovalTime: number; // in hours
  averageGuardianResponseTime: number; // in hours
  mostActiveGuardian?: string;
}
