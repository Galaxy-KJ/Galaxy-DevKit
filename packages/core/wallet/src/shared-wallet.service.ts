/**
 * @fileoverview Shared multi-sig wallet service for team workspaces
 * @description Maps multi-signature contract vaults to organization accounts so
 *              teams can propose transactions and collect signatures collectively.
 */

import { Horizon, Networks } from '@stellar/stellar-sdk';
import { MultiSigWallet } from './multisig/MultiSigWallet';
import { MultiSigConfig, ProposalStatus } from './multisig/types';

export interface SharedWalletRegistration {
  organizationId: string;
  walletAddress: string;
  config: MultiSigConfig;
}

export interface SharedWalletProposal {
  proposalId: string;
  organizationId: string;
  walletAddress: string;
  status: ProposalStatus;
  requiredWeight: number;
  currentWeight: number;
  readyToExecute: boolean;
}

interface RegisteredWallet {
  wallet: MultiSigWallet;
  organizationId: string;
  signerWeights: Map<string, number>;
}

export class SharedWalletService {
  private readonly wallets = new Map<string, RegisteredWallet>();
  private readonly defaultNetworkPassphrase: string;

  constructor(
    private readonly horizonUrl: string = 'https://horizon-testnet.stellar.org',
    networkPassphrase: string = Networks.TESTNET
  ) {
    this.defaultNetworkPassphrase = networkPassphrase;
  }

  /**
   * Register a multi-sig wallet against an organization workspace.
   */
  registerWallet(registration: SharedWalletRegistration): void {
    const server = new Horizon.Server(this.horizonUrl);
    const config: MultiSigConfig = {
      ...registration.config,
      networkPassphrase:
        registration.config.networkPassphrase || this.defaultNetworkPassphrase,
    };

    const signerWeights = new Map(
      config.signers.map((signer) => [signer.publicKey, signer.weight])
    );

    this.wallets.set(registration.walletAddress, {
      wallet: new MultiSigWallet(server, config),
      organizationId: registration.organizationId,
      signerWeights,
    });
  }

  /**
   * Propose a transaction for a shared wallet. Returns the proposal identifier.
   */
  async proposeTx(
    walletAddress: string,
    txPayload: string,
    creatorPublicKey?: string
  ): Promise<string> {
    const { wallet } = this.getRegisteredWallet(walletAddress);
    const creator = creatorPublicKey ?? walletAddress;

    const proposal = await wallet.proposeTransaction(creator, txPayload);
    return proposal.data.id;
  }

  /**
   * Register an approval signature for a pending proposal.
   * Returns true when the multi-sig threshold has been satisfied.
   */
  async signTx(
    proposalId: string,
    signature: string,
    signerPublicKey: string
  ): Promise<boolean> {
    const located = this.findProposal(proposalId);
    if (!located) {
      throw new Error('Proposal not found');
    }

    const updated = await located.wallet.signProposal(
      proposalId,
      signerPublicKey,
      signature
    );
    return updated.data.status === ProposalStatus.READY_TO_EXECUTE;
  }

  getProposal(proposalId: string): SharedWalletProposal | null {
    const located = this.findProposal(proposalId);
    if (!located) {
      return null;
    }

    return {
      proposalId: located.proposal.data.id,
      organizationId: located.registration.organizationId,
      walletAddress: located.proposal.data.walletPublicKey,
      status: located.proposal.data.status,
      requiredWeight: located.proposal.data.requiredWeight,
      currentWeight: located.proposal.getCurrentWeight(located.registration.signerWeights),
      readyToExecute: located.proposal.data.status === ProposalStatus.READY_TO_EXECUTE,
    };
  }

  getOrganizationWallets(organizationId: string): string[] {
    return [...this.wallets.entries()]
      .filter(([, registration]) => registration.organizationId === organizationId)
      .map(([walletAddress]) => walletAddress);
  }

  private getRegisteredWallet(walletAddress: string): RegisteredWallet {
    const registration = this.wallets.get(walletAddress);
    if (!registration) {
      throw new Error(`Shared wallet ${walletAddress} is not registered`);
    }
    return registration;
  }

  private findProposal(proposalId: string):
    | {
        wallet: MultiSigWallet;
        registration: RegisteredWallet;
        proposal: NonNullable<ReturnType<MultiSigWallet['getProposal']>>;
      }
    | null {
    for (const registration of this.wallets.values()) {
      const proposal = registration.wallet.getProposal(proposalId);
      if (proposal) {
        return {
          wallet: registration.wallet,
          registration,
          proposal,
        };
      }
    }
    return null;
  }
}
