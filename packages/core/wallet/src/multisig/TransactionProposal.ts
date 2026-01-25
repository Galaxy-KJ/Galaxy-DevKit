/**
 * @fileoverview Transaction Proposal Wrapper
 * @description Manages individual transaction proposals and their state
 */

import { Transaction, FeeBumpTransaction, TransactionBuilder } from '@stellar/stellar-sdk';
import { MultiSigProposal, ProposalStatus } from './types';

export class TransactionProposal {
  public data: MultiSigProposal;

  constructor(data: MultiSigProposal) {
    this.data = data;
  }

  /**
   * Checks if the proposal is expired
   */
  isExpired(): boolean {
    return new Date() > this.data.expiresAt;
  }

  /**
   * Validates if the proposal can accept new signatures
   */
  canSign(): boolean {
    return (
      this.data.status === ProposalStatus.PENDING &&
      !this.isExpired()
    );
  }

  /**
   * Adds a signature to the proposal
   */
  addSignature(signerPublicKey: string, signature: string): void {
    if (!this.canSign()) {
      throw new Error(`Cannot sign proposal in status ${this.data.status} or expired`);
    }

    // Check if already signed by this signer
    if (this.data.signatures.some(s => s.signerPublicKey === signerPublicKey)) {
      throw new Error('Signer has already signed this proposal');
    }

    this.data.signatures.push({
      signerPublicKey,
      signature,
      signedAt: new Date(),
    });
  }

  /**
   * Gets the decoded Stellar Transaction object
   */
  getTransaction(networkPassphrase: string): Transaction | FeeBumpTransaction {
    return TransactionBuilder.fromXDR(
      this.data.transactionXdr,
      networkPassphrase
    );
  }

  /**
   * Calculates the current total weight of signatures
   */
  getCurrentWeight(signerWeights: Map<string, number>): number {
    return this.data.signatures.reduce((total, sig) => {
      return total + (signerWeights.get(sig.signerPublicKey) || 0);
    }, 0);
  }

  /**
   * Checks if the proposal has enough weight to execute
   */
  hasSufficientWeight(signerWeights: Map<string, number>): boolean {
    const currentWeight = this.getCurrentWeight(signerWeights);
    return currentWeight >= this.data.requiredWeight;
  }

  /**
   * Transitions status based on weight
   */
  updateStatus(signerWeights: Map<string, number>): void {
    if (this.data.status === ProposalStatus.EXECUTED || this.data.status === ProposalStatus.CANCELLED) {
      return;
    }

    if (this.isExpired()) {
      this.data.status = ProposalStatus.EXPIRED;
      return;
    }

    if (this.hasSufficientWeight(signerWeights)) {
      this.data.status = ProposalStatus.READY_TO_EXECUTE;
    } else {
      this.data.status = ProposalStatus.PENDING;
    }
  }
}