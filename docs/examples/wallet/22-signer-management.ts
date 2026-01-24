import { MultiSigWallet } from '../../../packages/core/wallet/src/multisig/MultiSigWallet';
import { Horizon, Networks, Keypair, TransactionBuilder, Operation } from '@stellar/stellar-sdk';

/**
 * Managing Signers (Rotation)
 * * To add or remove signers from a multi-sig wallet, you must propose a 
 * 'SetOptions' transaction that is approved by the existing signers.
 * * Scenario: Remove 'Alice' and add 'Dave'.
 */
async function rotateSigners() {
  const server = new Horizon.Server('https://horizon-testnet.stellar.org');
  const networkPassphrase = Networks.TESTNET;
  
  // Existing keys
  const creatorKey = Keypair.fromSecret('SCZ...'); 
  // We want to add Dave
  const daveKey = Keypair.random(); 

  const wallet = new MultiSigWallet(server, {
    // ... existing config ...
    signers: [/* ... */],
    threshold: { masterWeight: 1, low: 1, medium: 2, high: 3 },
    proposalExpirationSeconds: 3600,
    networkPassphrase
  });

  // 1. Build Transaction to Change Signers
  const account = await server.loadAccount(creatorKey.publicKey());
  
  const tx = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase
  })
  // Operation A: Remove Alice (Set weight to 0)
  .addOperation(Operation.setOptions({
    signer: {
      ed25519PublicKey: 'GALICE...', // Alice's Public Key
      weight: 0 
    }
  }))
  // Operation B: Add Dave (Set weight to 1)
  .addOperation(Operation.setOptions({
    signer: {
      ed25519PublicKey: daveKey.publicKey(),
      weight: 1
    }
  }))
  .setTimeout(30)
  .build();

  // 2. Propose the Configuration Change
  console.log('Proposing signer rotation...');
  const proposal = await wallet.proposeTransaction(
    creatorKey.publicKey(),
    tx.toXDR(),
    'HR Update: Replace Alice with Dave'
  );

  // 3. Signers Approve (Need High Threshold usually for SetOptions)
  // ... signatures collection process (similar to Example 06) ...
  
  console.log('Signatures collected. Ready to update on-chain configuration.');
  
  // 4. Execute
  // await wallet.executeProposal(proposal.data.id);
}

rotateSigners();