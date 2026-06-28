/**
 * @fileoverview Unit tests for SharedWalletService
 */

import {
  Keypair,
  TransactionBuilder,
  Networks,
  Operation,
  Asset,
  Account,
} from '@stellar/stellar-sdk';
import { SharedWalletService } from '../shared-wallet.service';
import { MultiSigConfig, ProposalStatus } from '../multisig/types';

jest.mock('../multisig/NotificationService');

describe('SharedWalletService', () => {
  let service: SharedWalletService;
  const masterKey = Keypair.random();
  const signer1 = Keypair.random();
  const signer2 = Keypair.random();

  const config: MultiSigConfig = {
    networkPassphrase: Networks.TESTNET,
    proposalExpirationSeconds: 3600,
    threshold: {
      masterWeight: 1,
      low: 1,
      medium: 2,
      high: 3,
    },
    signers: [
      { publicKey: masterKey.publicKey(), weight: 1 },
      { publicKey: signer1.publicKey(), weight: 1 },
      { publicKey: signer2.publicKey(), weight: 1 },
    ],
  };

  beforeEach(() => {
    service = new SharedWalletService();
    service.registerWallet({
      organizationId: 'org-1',
      walletAddress: masterKey.publicKey(),
      config,
    });
  });

  const createTestXdr = () => {
    const account = new Account(masterKey.publicKey(), '1');
    return new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.payment({
          destination: Keypair.random().publicKey(),
          asset: Asset.native(),
          amount: '10',
        })
      )
      .setTimeout(30)
      .build()
      .toXDR();
  };

  it('proposes transaction templates and returns proposal id', async () => {
    const proposalId = await service.proposeTx(masterKey.publicKey(), createTestXdr());
    expect(proposalId).toBeTruthy();

    const proposal = service.getProposal(proposalId);
    expect(proposal?.organizationId).toBe('org-1');
    expect(proposal?.status).toBe(ProposalStatus.PENDING);
  });

  it('holds signatures until threshold is met', async () => {
    const xdr = createTestXdr();
    const proposalId = await service.proposeTx(masterKey.publicKey(), xdr);
    const tx = TransactionBuilder.fromXDR(xdr, Networks.TESTNET);
    const txHash = tx.hash();

    const sig1 = signer1.sign(txHash).toString('base64');
    const readyAfterFirst = await service.signTx(proposalId, sig1, signer1.publicKey());
    expect(readyAfterFirst).toBe(false);

    const sig2 = signer2.sign(txHash).toString('base64');
    const readyAfterSecond = await service.signTx(proposalId, sig2, signer2.publicKey());
    expect(readyAfterSecond).toBe(true);

    const proposal = service.getProposal(proposalId);
    expect(proposal?.readyToExecute).toBe(true);
    expect(proposal?.currentWeight).toBeGreaterThanOrEqual(proposal?.requiredWeight ?? 0);
  });

  it('rejects invalid signatures', async () => {
    const proposalId = await service.proposeTx(masterKey.publicKey(), createTestXdr());
    await expect(
      service.signTx(proposalId, 'invalid-signature', signer1.publicKey())
    ).rejects.toThrow('Invalid signature');
  });

  it('maps wallets to organization workspaces', () => {
    expect(service.getOrganizationWallets('org-1')).toEqual([masterKey.publicKey()]);
  });
});
