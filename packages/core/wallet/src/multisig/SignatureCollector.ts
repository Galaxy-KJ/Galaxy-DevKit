/**
 * @fileoverview Signature Collector
 * @description Validates and aggregates signatures for proposals
 */

import { Keypair, Transaction, FeeBumpTransaction } from '@stellar/stellar-sdk';
import { ProposalSignature } from './types';

export class SignatureCollector {
  
  /**
   * Validates a signature against the transaction hash and signer's public key
   */
  static validateSignature(
    transaction: Transaction | FeeBumpTransaction,
    signerPublicKey: string,
    signatureBase64: string,
    networkPassphrase: string
  ): boolean {
    try {
      const keypair = Keypair.fromPublicKey(signerPublicKey);
      const hash = transaction.hash(); 
      return keypair.verify(hash, Buffer.from(signatureBase64, 'base64'));
    } catch (error) {
      console.error('Signature validation failed:', error);
      return false;
    }
  }

  /**
   * Applies collected signatures to a Stellar Transaction object
   */
  static applySignatures(
    transaction: Transaction | FeeBumpTransaction,
    signatures: ProposalSignature[]
  ): Transaction | FeeBumpTransaction {
    
    signatures.forEach(sig => {
      // addSignature takes (publicKey: string, signature: string | Buffer)
      // The SDK calculates the hint from the public key automatically.
      transaction.addSignature(sig.signerPublicKey, sig.signature);
    });

    return transaction;
  }
}