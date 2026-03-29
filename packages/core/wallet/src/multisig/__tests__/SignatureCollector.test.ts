/**
 * @fileoverview Unit tests for SignatureCollector
 */

import { Keypair, TransactionBuilder, Networks, Operation, Transaction, Asset, Account } from '@stellar/stellar-sdk';
import { SignatureCollector } from '../SignatureCollector';
import { ProposalSignature } from '../types';

describe('SignatureCollector', () => {
  const sourceKey = Keypair.random();
  const signerKey = Keypair.random();
  let transaction: Transaction;
  let signature: string;

  beforeEach(() => {
    const account = new Account(sourceKey.publicKey(), '123');
    
    transaction = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(Operation.payment({
        destination: Keypair.random().publicKey(),
        asset: Asset.native(), 
        amount: '10',
      }))
      .setTimeout(30)
      .build();

    // Generate a valid signature
    signature = signerKey.sign(transaction.hash()).toString('base64');
  });

  describe('validateSignature', () => {
    it('should return true for a valid signature', () => {
      const isValid = SignatureCollector.validateSignature(
        transaction,
        signerKey.publicKey(),
        signature,
        Networks.TESTNET
      );
      expect(isValid).toBe(true);
    });

    it('should return false for an invalid signature (wrong data)', () => {
      const otherKey = Keypair.random();
      const invalidSig = otherKey.sign(Buffer.from('wrong data')).toString('base64');

      const isValid = SignatureCollector.validateSignature(
        transaction,
        signerKey.publicKey(),
        invalidSig,
        Networks.TESTNET
      );
      expect(isValid).toBe(false);
    });

    it('should return false if the signature does not match the public key', () => {
      const otherKey = Keypair.random();
      // Signed by 'otherKey', but checking against 'signerKey' public key
      const invalidSig = otherKey.sign(transaction.hash()).toString('base64');

      const isValid = SignatureCollector.validateSignature(
        transaction,
        signerKey.publicKey(),
        invalidSig,
        Networks.TESTNET
      );
      expect(isValid).toBe(false);
    });
  });

  describe('applySignatures', () => {
    it('should add signatures to the transaction object', () => {
      const signatures: ProposalSignature[] = [
        {
          signerPublicKey: signerKey.publicKey(),
          signature: signature,
          signedAt: new Date(),
        },
      ];

      const signedTx = SignatureCollector.applySignatures(transaction, signatures);
      
      // Stellar SDK stores signatures in the 'signatures' array
      expect(signedTx.signatures).toHaveLength(1);
      
      // Verify the hint matches the last 4 bytes of the signer's public key
      const hint = signedTx.signatures[0].hint();
      const expectedHint = signerKey.signatureHint();
      expect(hint.equals(expectedHint)).toBe(true);
    });
  });
});