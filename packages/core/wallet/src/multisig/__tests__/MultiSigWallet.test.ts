/**
 * @fileoverview Unit tests for MultiSigWallet Core Logic
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
import { MultiSigConfig, ProposalStatus } from '../types';
import { NotificationService } from '../NotificationService';

// Mock NotificationService
jest.mock('../NotificationService');

describe('MultiSigWallet', () => {
  let wallet: MultiSigWallet;
  let mockServer: jest.Mocked<Horizon.Server>;
  let config: MultiSigConfig;
  let notificationService: NotificationService;

  const masterKey = Keypair.random();
  const signer1 = Keypair.random();
  const signer2 = Keypair.random();
  const signer3 = Keypair.random();

  beforeEach(() => {
    // Mock Horizon Server
    mockServer = {
      loadAccount: jest.fn(),
      submitTransaction: jest.fn(),
    } as unknown as jest.Mocked<Horizon.Server>;

    notificationService = new NotificationService();

    config = {
      networkPassphrase: Networks.TESTNET,
      proposalExpirationSeconds: 3600,
      threshold: {
        masterWeight: 1,
        low: 1,
        medium: 2,
        high: 3
      },
      signers: [
        { publicKey: masterKey.publicKey(), weight: 1 },
        { publicKey: signer1.publicKey(), weight: 1 },
        { publicKey: signer2.publicKey(), weight: 1 },
        { publicKey: signer3.publicKey(), weight: 1 },
      ]
    };

    wallet = new MultiSigWallet(mockServer, config, notificationService);
  });

  const createTestXdr = () => {
    const account = new Account(masterKey.publicKey(), '1');

    const tx = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: Networks.TESTNET,
    })
    .addOperation(Operation.payment({
      destination: Keypair.random().publicKey(),
      asset: Asset.native(),
      amount: '10'
    }))
    .setTimeout(30)
    .build();
    return tx.toXDR();
  };

  describe('proposeTransaction', () => {
    it('should create a new proposal with PENDING status', async () => {
      const xdr = createTestXdr();
      const proposal = await wallet.proposeTransaction(masterKey.publicKey(), xdr, 'Test Payment');

      expect(proposal).toBeDefined();
      expect(proposal.data.status).toBe(ProposalStatus.PENDING);
      expect(proposal.data.description).toBe('Test Payment');
      expect(wallet.getProposal(proposal.data.id)).toBeDefined();
      expect(notificationService.notifySigners).toHaveBeenCalled();
    });
  });

  describe('signProposal', () => {
    it('should accept valid signatures and update status to READY_TO_EXECUTE when threshold met', async () => {
      const xdr = createTestXdr();
      const proposal = await wallet.proposeTransaction(masterKey.publicKey(), xdr);
      const txHash = proposal.getTransaction(Networks.TESTNET).hash();

      // Signer 1 signs (Weight: 1, Required: 2) -> Still Pending
      const sig1 = signer1.sign(txHash).toString('base64');
      await wallet.signProposal(proposal.data.id, signer1.publicKey(), sig1);
      
      expect(proposal.data.status).toBe(ProposalStatus.PENDING);
      expect(proposal.data.signatures).toHaveLength(1);

      // Signer 2 signs (Weight: 1+1=2, Required: 2) -> Ready
      const sig2 = signer2.sign(txHash).toString('base64');
      await wallet.signProposal(proposal.data.id, signer2.publicKey(), sig2);

      expect(proposal.data.status).toBe(ProposalStatus.READY_TO_EXECUTE);
    });

    it('should reject duplicate signatures from the same signer', async () => {
      const xdr = createTestXdr();
      const proposal = await wallet.proposeTransaction(masterKey.publicKey(), xdr);
      const txHash = proposal.getTransaction(Networks.TESTNET).hash();
      const sig = signer1.sign(txHash).toString('base64');

      await wallet.signProposal(proposal.data.id, signer1.publicKey(), sig);

      await expect(
        wallet.signProposal(proposal.data.id, signer1.publicKey(), sig)
      ).rejects.toThrow('Signer has already signed');
    });

    it('should reject invalid signatures', async () => {
      const xdr = createTestXdr();
      const proposal = await wallet.proposeTransaction(masterKey.publicKey(), xdr);
      const invalidSig = Buffer.from('bad_signature').toString('base64');

      await expect(
        wallet.signProposal(proposal.data.id, signer1.publicKey(), invalidSig)
      ).rejects.toThrow('Invalid signature');
    });
  });

  describe('executeProposal', () => {
    it('should submit transaction to server when threshold is met', async () => {
      const xdr = createTestXdr();
      const proposal = await wallet.proposeTransaction(masterKey.publicKey(), xdr);
      const txHash = proposal.getTransaction(Networks.TESTNET).hash();

      // Sign to meet threshold
      await wallet.signProposal(proposal.data.id, signer1.publicKey(), signer1.sign(txHash).toString('base64'));
      await wallet.signProposal(proposal.data.id, signer2.publicKey(), signer2.sign(txHash).toString('base64'));

      // Mock success response
      (mockServer.submitTransaction as jest.Mock).mockResolvedValue({ hash: 'tx_hash_123' });

      const resultHash = await wallet.executeProposal(proposal.data.id);

      expect(resultHash).toBe('tx_hash_123');
      expect(proposal.data.status).toBe(ProposalStatus.EXECUTED);
      expect(mockServer.submitTransaction).toHaveBeenCalled();
    });

    it('should fail if trying to execute a PENDING proposal', async () => {
      const xdr = createTestXdr();
      const proposal = await wallet.proposeTransaction(masterKey.publicKey(), xdr);
      
      // Only 1 signature (threshold not met)
      const txHash = proposal.getTransaction(Networks.TESTNET).hash();
      await wallet.signProposal(proposal.data.id, signer1.publicKey(), signer1.sign(txHash).toString('base64'));

      await expect(wallet.executeProposal(proposal.data.id)).rejects.toThrow('Proposal is not ready');
    });
  });

  describe('cancelProposal', () => {
    it('should allow signer to cancel pending proposal', async () => {
      const xdr = createTestXdr();
      const proposal = await wallet.proposeTransaction(masterKey.publicKey(), xdr);

      await wallet.cancelProposal(proposal.data.id, signer1.publicKey());

      expect(proposal.data.status).toBe(ProposalStatus.CANCELLED);
    });

    it('should prevent cancellation of executed proposals', async () => {
       const xdr = createTestXdr();
       const proposal = await wallet.proposeTransaction(masterKey.publicKey(), xdr);
       
       // Force state to executed for test
       proposal.data.status = ProposalStatus.EXECUTED;

       await expect(
         wallet.cancelProposal(proposal.data.id, signer1.publicKey())
       ).rejects.toThrow('Cannot cancel executed proposal');
    });
  });
});