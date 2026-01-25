/**
 * @fileoverview Multi-Signature Wallet Implementation
 * @description Core class for managing multi-sig accounts, proposals, and execution
 */

import { 
  Horizon, 
  Keypair, 
  TransactionBuilder, 
  Operation, 
  BASE_FEE,
  Transaction,
  FeeBumpTransaction 
} from '@stellar/stellar-sdk';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import { 
  MultiSigConfig, 
  MultiSigProposal, 
  ProposalStatus,
  MultiSigNotificationType 
} from './types';
import { TransactionProposal } from './TransactionProposal';
import { SignatureCollector } from './SignatureCollector';
import { NotificationService } from './NotificationService';

export class MultiSigWallet extends EventEmitter {
  private server: Horizon.Server;
  private config: MultiSigConfig;
  private proposals: Map<string, TransactionProposal>;
  private notificationService: NotificationService;

  constructor(
    server: Horizon.Server,
    config: MultiSigConfig,
    notificationService?: NotificationService
  ) {
    super();
    this.server = server;
    this.config = config;
    this.proposals = new Map();
    this.notificationService = notificationService || new NotificationService();
  }

  /**
   * Configures the Stellar account with multi-sig signers and thresholds.
   * This submits a transaction to the network.
   */
  async setupOnChain(sourceSecret: string): Promise<string> {
    const sourceKeypair = Keypair.fromSecret(sourceSecret);
    const account = await this.server.loadAccount(sourceKeypair.publicKey());

    const txBuilder = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.config.networkPassphrase,
    });

    // 1. Add Signers
    for (const signer of this.config.signers) {
      // Skip if signer is the master key (handled via masterWeight)
      if (signer.publicKey === sourceKeypair.publicKey()) continue;

      txBuilder.addOperation(Operation.setOptions({
        signer: {
          ed25519PublicKey: signer.publicKey,
          weight: signer.weight
        }
      }));
    }

    // 2. Set Thresholds & Master Weight
    const selfSigner = this.config.signers.find(s => s.publicKey === sourceKeypair.publicKey());
    const masterWeight = selfSigner ? selfSigner.weight : 0;

    txBuilder.addOperation(Operation.setOptions({
      masterWeight: masterWeight,
      lowThreshold: this.config.threshold.low,
      medThreshold: this.config.threshold.medium,
      highThreshold: this.config.threshold.high
    }));

    txBuilder.setTimeout(30);
    const tx = txBuilder.build();
    tx.sign(sourceKeypair);

    const result = await this.server.submitTransaction(tx);
    return result.hash;
  }

  /**
   * Creates a new transaction proposal
   */
  async proposeTransaction(
    creatorPublicKey: string,
    transactionXdr: string,
    description?: string
  ): Promise<TransactionProposal> {
    const transaction = TransactionBuilder.fromXDR(transactionXdr, this.config.networkPassphrase);
    
    // Safely extract source account based on transaction type
    let source: string;
    if (transaction instanceof FeeBumpTransaction) {
      source = transaction.feeSource;
    } else {
      source = transaction.source;
    }

    // Determine required weight based on operation types
    // For simplicity, we use the medium threshold for most ops
    const requiredWeight = this.config.threshold.medium; 

    const proposalId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.config.proposalExpirationSeconds * 1000);

    const data: MultiSigProposal = {
      id: proposalId,
      walletPublicKey: source,
      creatorPublicKey,
      transactionXdr,
      description,
      status: ProposalStatus.PENDING,
      createdAt: now,
      expiresAt,
      signatures: [],
      requiredWeight
    };

    const proposal = new TransactionProposal(data);
    this.proposals.set(proposalId, proposal);

    await this.notificationService.notifySigners(
      this.config.signers,
      MultiSigNotificationType.PROPOSAL_CREATED,
      { proposalId, description, wallet: source }
    );

    return proposal;
  }

  /**
   * Signs a pending proposal
   */
  async signProposal(
    proposalId: string,
    signerPublicKey: string,
    signature: string // Base64 signature
  ): Promise<TransactionProposal> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) throw new Error('Proposal not found');

    const transaction = proposal.getTransaction(this.config.networkPassphrase);

    // Validate signature
    const isValid = SignatureCollector.validateSignature(
      transaction,
      signerPublicKey,
      signature,
      this.config.networkPassphrase
    );

    if (!isValid) throw new Error('Invalid signature provided');

    proposal.addSignature(signerPublicKey, signature);
    
    // Calculate weights
    const signerWeights = new Map(this.config.signers.map(s => [s.publicKey, s.weight]));
    proposal.updateStatus(signerWeights);

    this.emit('proposalSigned', { proposalId, signerPublicKey });

    return proposal;
  }

  /**
   * Executes a fully signed proposal on the network
   */
  async executeProposal(proposalId: string): Promise<string> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) throw new Error('Proposal not found');

    const signerWeights = new Map(this.config.signers.map(s => [s.publicKey, s.weight]));
    
    // Re-check status
    proposal.updateStatus(signerWeights);

    if (proposal.data.status !== ProposalStatus.READY_TO_EXECUTE) {
      throw new Error(`Proposal is not ready to execute. Status: ${proposal.data.status}`);
    }

    let transaction = proposal.getTransaction(this.config.networkPassphrase);
    
    // Apply signatures
    transaction = SignatureCollector.applySignatures(transaction, proposal.data.signatures);

    try {
      const result = await this.server.submitTransaction(transaction);
      
      proposal.data.status = ProposalStatus.EXECUTED;
      proposal.data.executionHash = result.hash;

      await this.notificationService.notifySigners(
        this.config.signers,
        MultiSigNotificationType.PROPOSAL_EXECUTED,
        { proposalId, wallet: proposal.data.walletPublicKey }
      );

      return result.hash;
    } catch (error) {
      console.error('Execution failed', error);
      throw error;
    }
  }

  /**
   * Cancels a pending proposal
   */
  async cancelProposal(proposalId: string, requestorPublicKey: string): Promise<void> {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) throw new Error('Proposal not found');

    if (proposal.data.status === ProposalStatus.EXECUTED) {
      throw new Error('Cannot cancel executed proposal');
    }

    const isSigner = this.config.signers.some(s => s.publicKey === requestorPublicKey);
    if (!isSigner && proposal.data.creatorPublicKey !== requestorPublicKey) {
      throw new Error('Unauthorized to cancel proposal');
    }

    proposal.data.status = ProposalStatus.CANCELLED;
    
    await this.notificationService.notifySigners(
      this.config.signers,
      MultiSigNotificationType.PROPOSAL_CANCELLED,
      { proposalId, wallet: proposal.data.walletPublicKey }
    );
  }

  getProposal(id: string): TransactionProposal | undefined {
    return this.proposals.get(id);
  }

  getActiveProposals(): TransactionProposal[] {
    return Array.from(this.proposals.values()).filter(p => 
      p.data.status === ProposalStatus.PENDING || 
      p.data.status === ProposalStatus.READY_TO_EXECUTE
    );
  }
}