import { MultiSigWallet } from '../../../packages/core/wallet/src/multisig/MultiSigWallet';
import { MultiSigConfig } from '../../../packages/core/wallet/src/multisig/types';
import { Horizon, Networks, Keypair } from '@stellar/stellar-sdk';

/**
 * * This example demonstrates how to configure a Stellar account to become a multi-sig account.
 * It sets the weights for specific signers and defines the low, medium, and high thresholds.
 */
async function setupMultiSig() {
  // 1. connection setup
  const server = new Horizon.Server('https://horizon-testnet.stellar.org');
  const networkPassphrase = Networks.TESTNET;

  // 2. Define the wallet keys
  // In a real app, these would come from secure storage or user input
  const creatorKey = Keypair.fromSecret('SCZ...'); // Current master key
  const signerA = Keypair.random(); // Alice
  const signerB = Keypair.random(); // Bob
  const signerC = Keypair.random(); // Charlie

  console.log('Creator Public Key:', creatorKey.publicKey());
  console.log('Signer A (Alice):', signerA.publicKey());
  console.log('Signer B (Bob):', signerB.publicKey());
  console.log('Signer C (Charlie):', signerC.publicKey());

  // 3. Define the Multi-Sig Configuration
  const config: MultiSigConfig = {
    networkPassphrase,
    // Define who holds power
    signers: [
      { publicKey: creatorKey.publicKey(), weight: 1, name: 'Creator' },
      { publicKey: signerA.publicKey(), weight: 1, name: 'Alice' },
      { publicKey: signerB.publicKey(), weight: 1, name: 'Bob' },
      { publicKey: signerC.publicKey(), weight: 2, name: 'Charlie (Admin)' }
    ],
    // Define thresholds for operations
    // Low: Allow trustlines (1)
    // Medium: Allow payments (2)
    // High: Allow changing signers (3)
    threshold: {
      masterWeight: 1, // Keep master key active with weight 1
      low: 1,
      medium: 2,
      high: 3
    },
    proposalExpirationSeconds: 86400 // 24 hours
  };

  // 4. Initialize Wallet Wrapper
  const wallet = new MultiSigWallet(server, config);

  try {
    console.log('Submitting on-chain configuration transaction...');
    
    // This will execute a SetOptions transaction to apply weights and thresholds
    const txHash = await wallet.setupOnChain(creatorKey.secret());
    
    console.log('Success! Wallet is now Multi-Sig.');
    console.log('Transaction Hash:', txHash);
  } catch (error) {
    console.error('Failed to setup multi-sig:', error);
  }
}

setupMultiSig();