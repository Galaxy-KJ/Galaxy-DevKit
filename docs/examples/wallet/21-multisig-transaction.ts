import { MultiSigWallet } from '../../../packages/core/wallet/src/multisig/MultiSigWallet';
import { Horizon, Networks, Keypair, TransactionBuilder, Operation, Asset, Account } from '@stellar/stellar-sdk';

/**
 *Multi-Sig Transaction Lifecycle
 * * Workflow:
 * 1. Creator proposes a payment transaction.
 * 2. Proposal is stored (PENDING).
 * 3. Signers review and sign the proposal.
 * 4. Once threshold is met, the transaction is executed.
 */
async function runTransactionWorkflow() {
  const server = new Horizon.Server('https://horizon-testnet.stellar.org');
  const networkPassphrase = Networks.TESTNET;

  // Keys (Assuming these match the on-chain configuration from Example 05)
  const creatorKey = Keypair.fromSecret('SCZ...'); 
  const signerA = Keypair.fromSecret('SA...'); 
  const signerB = Keypair.fromSecret('SB...'); 

  // Initialize Wallet
  const wallet = new MultiSigWallet(server, {
    signers: [
      { publicKey: creatorKey.publicKey(), weight: 1 },
      { publicKey: signerA.publicKey(), weight: 1 },
      { publicKey: signerB.publicKey(), weight: 1 }
    ],
    threshold: { masterWeight: 1, low: 1, medium: 2, high: 3 },
    proposalExpirationSeconds: 3600,
    networkPassphrase
  });

  // ---------------------------------------------------------
  // Step 1: Create the Transaction XDR
  // ---------------------------------------------------------
  // Note: We are creating the XDR but NOT signing it yet.
  const account = await server.loadAccount(creatorKey.publicKey());
  
  const tx = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase
  })
  .addOperation(Operation.payment({
    destination: 'GB...', // Some destination
    asset: Asset.native(),
    amount: '50'
  }))
  .setTimeout(30)
  .build();

  const xdr = tx.toXDR();

  // ---------------------------------------------------------
  // Step 2: Propose Transaction
  // ---------------------------------------------------------
  console.log('Creating proposal...');
  const proposal = await wallet.proposeTransaction(
    creatorKey.publicKey(),
    xdr,
    'Payment to Supplier - Invoice #1024'
  );

  console.log(`Proposal Created: ${proposal.data.id} [Status: ${proposal.data.status}]`);
  console.log(`Required Weight: ${proposal.data.requiredWeight}`);

  // ---------------------------------------------------------
  // Step 3: Collection Phase (Signers Review & Sign)
  // ---------------------------------------------------------
  
  // Alice reviews and signs
  console.log('Alice signing...');
  const txHash = tx.hash();
  const sigA = signerA.sign(txHash).toString('base64');
  await wallet.signProposal(proposal.data.id, signerA.publicKey(), sigA);
  
  console.log(`Status after Alice: ${proposal.data.status}`); // Still PENDING (Weight 1 < 2)

  // Bob reviews and signs
  console.log('Bob signing...');
  const sigB = signerB.sign(txHash).toString('base64');
  await wallet.signProposal(proposal.data.id, signerB.publicKey(), sigB);

  console.log(`Status after Bob: ${proposal.data.status}`); // READY_TO_EXECUTE (Weight 2 >= 2)

  // ---------------------------------------------------------
  // Step 4: Execution
  // ---------------------------------------------------------
  if (proposal.data.status === 'ready_to_execute') {
    console.log('Threshold met. Executing on-chain...');
    try {
      const resultHash = await wallet.executeProposal(proposal.data.id);
      console.log('Transaction Executed Successfully!');
      console.log('Hash:', resultHash);
    } catch (e) {
      console.error('Execution failed:', e);
    }
  }
}

runTransactionWorkflow();