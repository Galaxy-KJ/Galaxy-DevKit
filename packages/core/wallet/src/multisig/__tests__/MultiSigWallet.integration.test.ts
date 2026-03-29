/**
 * @fileoverview Integration tests for MultiSig Workflow
 */

import { 
  Keypair, 
  TransactionBuilder, 
  Networks, 
  Operation,
  Horizon,
  Asset,
  Account
} from '@stellar/stellar-sdk';
import { MultiSigWallet } from '../MultiSigWallet';
import { ProposalStatus } from '../types';

describe('MultiSigWallet Integration Workflow', () => {
  // Setup Keys
  const creator = Keypair.random();
  const signerA = Keypair.random();
  const signerB = Keypair.random();
  
  // Setup Mocks
  const mockSubmitTransaction = jest.fn();
  const mockServer = {
    loadAccount: jest.fn(),
    submitTransaction: mockSubmitTransaction,
  } as unknown as Horizon.Server;

  // Config: Threshold 2, Signers: Creator(1), A(1), B(1)
  const config = {
    networkPassphrase: Networks.TESTNET,
    proposalExpirationSeconds: 3600,
    threshold: { masterWeight: 1, low: 1, medium: 2, high: 3 },
    signers: [
      { publicKey: creator.publicKey(), weight: 1 },
      { publicKey: signerA.publicKey(), weight: 1 },
      { publicKey: signerB.publicKey(), weight: 1 },
    ]
  };

  const wallet = new MultiSigWallet(mockServer, config);

  it('performs a full lifecycle: Propose -> Sign -> Execute', async () => {
    // 1. Create XDR
    const account = new Account(creator.publicKey(), '100');

    const tx = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: Networks.TESTNET,
    })
    .addOperation(Operation.payment({
      destination: Keypair.random().publicKey(),
      asset: Asset.native(),
      amount: '50'
    }))
    .setTimeout(30)
    .build();

    const xdr = tx.toXDR();

    // 2. Propose Transaction
    const proposal = await wallet.proposeTransaction(creator.publicKey(), xdr, 'Integration Test Payment');
    
    expect(proposal.data.status).toBe(ProposalStatus.PENDING);
    expect(proposal.data.requiredWeight).toBe(2);

    // 3. Signer A signs (Current weight: 0 -> 1)
    const txHash = proposal.getTransaction(Networks.TESTNET).hash();
    const sigA = signerA.sign(txHash).toString('base64');
    
    await wallet.signProposal(proposal.data.id, signerA.publicKey(), sigA);
    
    expect(proposal.data.status).toBe(ProposalStatus.PENDING);
    expect(proposal.data.signatures.length).toBe(1);

    // 4. Signer B signs (Current weight: 1 -> 2)
    const sigB = signerB.sign(txHash).toString('base64');
    
    await wallet.signProposal(proposal.data.id, signerB.publicKey(), sigB);

    expect(proposal.data.status).toBe(ProposalStatus.READY_TO_EXECUTE);
    expect(proposal.data.signatures.length).toBe(2);

    // 5. Execute
    mockSubmitTransaction.mockResolvedValue({ hash: 'success_hash_999' });
    
    const result = await wallet.executeProposal(proposal.data.id);

    expect(result).toBe('success_hash_999');
    expect(proposal.data.status).toBe(ProposalStatus.EXECUTED);

    // Verify what was sent to the server has 2 signatures
    const submittedTx = mockSubmitTransaction.mock.calls[0][0];
    expect(submittedTx.signatures.length).toBe(2);
  });
});