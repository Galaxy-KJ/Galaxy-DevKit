/**
 * @fileoverview Unit tests for approval workflow routes
 */

import express from 'express';
import request from 'supertest';
import {
  Keypair,
  TransactionBuilder,
  Networks,
  Operation,
  Asset,
  Account,
} from '@stellar/stellar-sdk';
import { setupApprovalsRoutes } from './index';
import { resetApprovalServiceForTests } from '../../services/approval-service';

jest.mock('../../middleware/auth', () => ({
  authenticate: () => (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    req.user = { userId: 'test-user', email: 'test@galaxy.dev' };
    next();
  },
}));

jest.mock('../../middleware/audit', () => ({
  auditRequest: () => (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));

jest.mock('../../../../../core/wallet/src/multisig/NotificationService', () => ({
  NotificationService: jest.fn().mockImplementation(() => ({
    notifySigners: jest.fn().mockResolvedValue(undefined),
  })),
}));

describe('Approvals routes', () => {
  const masterKey = Keypair.random();
  const signer1 = Keypair.random();
  const signer2 = Keypair.random();

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

  const buildApp = () => {
    const app = express();
    app.use(express.json());
    app.use('/api/v1/approvals', setupApprovalsRoutes());
    return app;
  };

  beforeEach(() => {
    resetApprovalServiceForTests();
  });

  it('proposes a multi-sig transaction', async () => {
    const app = buildApp();
    const response = await request(app)
      .post('/api/v1/approvals/propose')
      .send({
        organizationId: 'org-1',
        walletAddress: masterKey.publicKey(),
        transactionXdr: createTestXdr(),
        creatorPublicKey: masterKey.publicKey(),
        multisigConfig: {
          networkPassphrase: Networks.TESTNET,
          proposalExpirationSeconds: 3600,
          threshold: { masterWeight: 1, low: 1, medium: 2, high: 3 },
          signers: [
            { publicKey: masterKey.publicKey(), weight: 1 },
            { publicKey: signer1.publicKey(), weight: 1 },
            { publicKey: signer2.publicKey(), weight: 1 },
          ],
        },
      });

    expect(response.status).toBe(201);
    expect(response.body.proposalId).toBeTruthy();
  });

  it('rejects invalid signatures', async () => {
    const app = buildApp();
    const propose = await request(app)
      .post('/api/v1/approvals/propose')
      .send({
        organizationId: 'org-1',
        walletAddress: masterKey.publicKey(),
        transactionXdr: createTestXdr(),
        creatorPublicKey: masterKey.publicKey(),
        multisigConfig: {
          networkPassphrase: Networks.TESTNET,
          proposalExpirationSeconds: 3600,
          threshold: { masterWeight: 1, low: 1, medium: 2, high: 3 },
          signers: [{ publicKey: signer1.publicKey(), weight: 1 }],
        },
      });

    const approve = await request(app)
      .post('/api/v1/approvals/approve')
      .send({
        proposalId: propose.body.proposalId,
        signerPublicKey: signer1.publicKey(),
        signature: 'invalid-signature',
      });

    expect(approve.status).toBe(400);
    expect(approve.body.error.code).toBe('INVALID_SIGNATURE');
  });

  it('broadcasts only when approval threshold is met', async () => {
    const app = buildApp();
    const xdr = createTestXdr();
    const txHash = TransactionBuilder.fromXDR(xdr, Networks.TESTNET).hash();

    const propose = await request(app)
      .post('/api/v1/approvals/propose')
      .send({
        organizationId: 'org-1',
        walletAddress: masterKey.publicKey(),
        transactionXdr: xdr,
        creatorPublicKey: masterKey.publicKey(),
        multisigConfig: {
          networkPassphrase: Networks.TESTNET,
          proposalExpirationSeconds: 3600,
          threshold: { masterWeight: 1, low: 1, medium: 2, high: 3 },
          signers: [
            { publicKey: signer1.publicKey(), weight: 1 },
            { publicKey: signer2.publicKey(), weight: 1 },
          ],
        },
      });

    const first = await request(app)
      .post('/api/v1/approvals/approve')
      .send({
        proposalId: propose.body.proposalId,
        signerPublicKey: signer1.publicKey(),
        signature: signer1.sign(txHash).toString('base64'),
      });

    expect(first.status).toBe(200);
    expect(first.body.proposal.readyToExecute).toBe(false);

    const second = await request(app)
      .post('/api/v1/approvals/approve')
      .send({
        proposalId: propose.body.proposalId,
        signerPublicKey: signer2.publicKey(),
        signature: signer2.sign(txHash).toString('base64'),
      });

    expect(second.status).toBe(200);
    expect(second.body.proposal.executionHash).toBeTruthy();
  });
});
