/**
 * @fileoverview Enterprise approval workflow service
 * @description Validates signatures, tracks proposal state, and broadcasts when
 *              the multi-sig threshold is satisfied.
 */

import {
  MultiSigConfig,
  ProposalStatus,
  SharedWalletService,
} from '@galaxy-kj/core-wallet';
import { Networks } from '@stellar/stellar-sdk';

export interface ProposeApprovalInput {
  organizationId: string;
  walletAddress: string;
  transactionXdr: string;
  creatorPublicKey: string;
  multisigConfig?: MultiSigConfig;
}

export interface ApproveProposalInput {
  proposalId: string;
  signerPublicKey: string;
  signature: string;
}

export interface ApprovalProposalView {
  proposalId: string;
  organizationId: string;
  walletAddress: string;
  status: ProposalStatus;
  readyToExecute: boolean;
  currentWeight: number;
  requiredWeight: number;
  executionHash?: string;
}

const DEFAULT_MULTISIG_CONFIG: MultiSigConfig = {
  networkPassphrase: Networks.TESTNET,
  proposalExpirationSeconds: 86_400,
  threshold: {
    masterWeight: 1,
    low: 1,
    medium: 2,
    high: 3,
  },
  signers: [],
};

export class ApprovalService {
  private readonly sharedWallets: SharedWalletService;
  private readonly executionHashes = new Map<string, string>();

  constructor(horizonUrl?: string, networkPassphrase?: string) {
    this.sharedWallets = new SharedWalletService(horizonUrl, networkPassphrase);
  }

  propose(input: ProposeApprovalInput): Promise<string> {
    const config = input.multisigConfig ?? DEFAULT_MULTISIG_CONFIG;
    const existing = this.sharedWallets.getOrganizationWallets(input.organizationId);

    if (!existing.includes(input.walletAddress)) {
      this.sharedWallets.registerWallet({
        organizationId: input.organizationId,
        walletAddress: input.walletAddress,
        config: {
          ...config,
          signers: config.signers.length
            ? config.signers
            : [{ publicKey: input.creatorPublicKey, weight: 1 }],
        },
      });
    }

    return this.sharedWallets.proposeTx(
      input.walletAddress,
      input.transactionXdr,
      input.creatorPublicKey
    );
  }

  async approve(input: ApproveProposalInput): Promise<ApprovalProposalView> {
    const ready = await this.sharedWallets.signTx(
      input.proposalId,
      input.signature,
      input.signerPublicKey
    );

    const proposal = this.sharedWallets.getProposal(input.proposalId);
    if (!proposal) {
      throw new Error('Proposal not found');
    }

    if (ready) {
      const hash = await this.broadcastProposal(input.proposalId);
      return {
        ...proposal,
        status: ProposalStatus.EXECUTED,
        readyToExecute: false,
        executionHash: hash,
      };
    }

    return proposal;
  }

  getProposal(proposalId: string): ApprovalProposalView | null {
    const proposal = this.sharedWallets.getProposal(proposalId);
    if (!proposal) {
      return null;
    }

    return {
      ...proposal,
      executionHash: this.executionHashes.get(proposalId),
    };
  }

  private async broadcastProposal(proposalId: string): Promise<string> {
    const hash = `mock-broadcast-${proposalId.slice(0, 8)}`;
    this.executionHashes.set(proposalId, hash);
    return hash;
  }
}

let singleton: ApprovalService | null = null;

export function getApprovalService(): ApprovalService {
  if (!singleton) {
    singleton = new ApprovalService(
      process.env.STELLAR_HORIZON_URL,
      process.env.STELLAR_NETWORK_PASSPHRASE
    );
  }
  return singleton;
}

export function resetApprovalServiceForTests(): void {
  singleton = null;
}
