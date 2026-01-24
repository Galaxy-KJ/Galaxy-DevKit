/**
 * @fileoverview Type definitions for Multi-Signature Wallet System
 * @description Interfaces and types for multi-sig functionality
 */

export interface MultiSigConfig {
  signers: MultiSigSigner[];
  threshold: MultiSigThresholds;
  proposalExpirationSeconds: number; // Default expiration for new proposals
  networkPassphrase: string;
}

export interface MultiSigThresholds {
  masterWeight: number;
  low: number;
  medium: number;
  high: number;
}

export interface MultiSigSigner {
  publicKey: string;
  weight: number;
  name?: string;
  email?: string; // For notifications
}

export enum ProposalStatus {
  PENDING = 'pending',
  READY_TO_EXECUTE = 'ready_to_execute',
  EXECUTED = 'executed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
}

export interface ProposalSignature {
  signerPublicKey: string;
  signature: string; // Base64 signature
  signedAt: Date;
}

export interface MultiSigProposal {
  id: string;
  walletPublicKey: string;
  creatorPublicKey: string;
  transactionXdr: string;
  description?: string;
  status: ProposalStatus;
  createdAt: Date;
  expiresAt: Date;
  signatures: ProposalSignature[];
  executionHash?: string;
  requiredWeight: number; // Snapshot of weight required at creation
}

export enum MultiSigNotificationType {
  PROPOSAL_CREATED = 'proposal_created',
  PROPOSAL_SIGNED = 'proposal_signed',
  PROPOSAL_EXECUTED = 'proposal_executed',
  PROPOSAL_CANCELLED = 'proposal_cancelled',
  SIGNER_ADDED = 'signer_added',
  SIGNER_REMOVED = 'signer_removed',
}

export interface MultiSigNotification {
  type: MultiSigNotificationType;
  recipient: string; // Public Key or Email
  subject: string;
  message: string;
  metadata?: Record<string, unknown>;
}