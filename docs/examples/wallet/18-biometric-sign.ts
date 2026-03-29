import { BiometricAuth } from 'packages/core/wallet/auth/src/BiometricAuth';
import { WebAuthNProvider } from 'packages/core/wallet/auth/src/providers/WebAuthNProvider';

import {
  Keypair,
  Networks,
  Horizon,
  TransactionBuilder,
  Operation,
  Asset,
  Memo,
} from '@stellar/stellar-sdk';

// =====================================================
// CONFIG
// =====================================================

// Use TESTNET for safety in examples
const HORIZON_URL = 'https://horizon-testnet.stellar.org';
const NETWORK_PASSPHRASE = Networks.TESTNET;

// Replace with FUNDED testnet account secret
// Get free funds: https://laboratory.stellar.org/#account-creator
const SOURCE_SECRET_KEY =
  process.env.STELLAR_SECRET_KEY || 'SAFETY_PLACEHOLDER_REPLACE_ME';

// =====================================================
// Single Payment Biometric Signing Example
// =====================================================

async function signTransactionWithBiometric() {
  console.log('🔐 Signing transaction with biometric authentication...\n');

  // Setup biometric auth
  const provider = new WebAuthNProvider();
  const biometric = new BiometricAuth(provider);
  await biometric.initialize();

  // Horizon Server (NOT rpc.Server)
  const server = new Horizon.Server(HORIZON_URL);

  const recipientPublicKey =
    'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';

  const amountXLM = '2'; // Send 2 XLM

  console.log('Transaction details:', {
    recipient: recipientPublicKey,
    amount: `${amountXLM} XLM`,
    network: 'Stellar Testnet',
  });

  // =====================================================
  // BIOMETRIC AUTH
  // =====================================================

  console.log('\n👉 Requesting biometric authentication...');

  const authResult = await biometric.authenticateForTransaction(amountXLM);

  if (!authResult.success) {
    console.error('❌ Authentication failed:', authResult.error);

    if (authResult.attemptsRemaining !== undefined) {
      console.log(`Attempts remaining: ${authResult.attemptsRemaining}`);
    }

    return;
  }

  console.log('✅ Biometric authentication successful\n');

  // =====================================================
  // KEY RETRIEVAL (SIMULATED)
  // =====================================================

  console.log('🔑 Retrieving encrypted wallet key...');

  const encryptedKey = await biometric.retrieveEncryptedKey('main-wallet');

  if (!encryptedKey) {
    console.error('❌ Failed to retrieve wallet key');
    return;
  }

  console.log('✅ Wallet key retrieved\n');

  // ⚠ DEMO PURPOSE ONLY
  // In production decrypt biometric-protected key here

  if (SOURCE_SECRET_KEY === 'SAFETY_PLACEHOLDER_REPLACE_ME') {
    throw new Error(
      '❗ Please set STELLAR_SECRET_KEY env variable with funded testnet account'
    );
  }

  const sourceKeypair = Keypair.fromSecret(SOURCE_SECRET_KEY);
  const sourcePublicKey = sourceKeypair.publicKey();

  console.log('Source account:', sourcePublicKey);
  console.log('Building transaction...\n');

  try {
    // Load account sequence
    const sourceAccount = await server.loadAccount(sourcePublicKey);

    // Build payment transaction
    const transaction = new TransactionBuilder(sourceAccount, {
      fee: '100', // stroops
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        Operation.payment({
          destination: recipientPublicKey,
          asset: Asset.native(),
          amount: amountXLM,
        })
      )
      .setTimeout(30)
      .build();

    console.log('✅ Transaction built');

    // Sign
    transaction.sign(sourceKeypair);

    console.log('✅ Transaction signed');
    console.log('Transaction Hash:', transaction.hash().toString('hex'));
    console.log('Transaction XDR:', transaction.toXDR());

    // =====================================================
    // SUBMIT (OPTIONAL)
    // =====================================================

    /*
    const result = await server.submitTransaction(transaction);

    console.log('🚀 Transaction submitted successfully');
    console.log('Ledger:', result.ledger);
    console.log(
      'Explorer:',
      `https://stellar.expert/explorer/testnet/tx/${result.hash}`
    );
    */

    console.log('\n🎉 Signing flow completed successfully!');
  } catch (error) {
    if (error instanceof Error) {
      console.error('❌ Error:', error.message);
    } else {
      console.error('❌ Unknown error occurred');
    }
  }
}

// =====================================================
// MULTI OPERATION BIOMETRIC SIGNING
// =====================================================

async function signMultiOpTransactionWithBiometric() {
  console.log('\n🔐 Signing multi-operation transaction...\n');

  const provider = new WebAuthNProvider();
  const biometric = new BiometricAuth(provider);
  await biometric.initialize();

  const server = new Horizon.Server(HORIZON_URL);

  const recipient1 = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';

  const recipient2 = 'GD2I2F7SWUHBAD7XBIZTF7MBMWQYWJVEFMWTXK76NSYVOY52OJRYNTIY';

  const totalAmount = '5'; // 5 XLM total

  const authResult = await biometric.authenticateForTransaction(totalAmount);

  if (!authResult.success) {
    console.error('❌ Authentication failed');
    return;
  }

  const sourceKeypair = Keypair.fromSecret(SOURCE_SECRET_KEY);
  const sourceAccount = await server.loadAccount(sourceKeypair.publicKey());

  const transaction = new TransactionBuilder(sourceAccount, {
    fee: '200',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        destination: recipient1,
        asset: Asset.native(),
        amount: '2',
      })
    )
    .addOperation(
      Operation.payment({
        destination: recipient2,
        asset: Asset.native(),
        amount: '3',
      })
    )
    .setTimeout(30)
    .build();

  transaction.sign(sourceKeypair);

  console.log('✅ Multi-operation transaction signed');
  console.log('Transaction Hash:', transaction.hash().toString('hex'));
}

// =====================================================
// MEMO SIGNING EXAMPLE
// =====================================================

async function signTransactionWithMemo() {
  console.log('\n🔐 Signing transaction with memo...\n');

  const provider = new WebAuthNProvider();
  const biometric = new BiometricAuth(provider);
  await biometric.initialize();

  const server = new Horizon.Server(HORIZON_URL);

  const recipient = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';

  const authResult = await biometric.authenticateForTransaction('1');

  if (!authResult.success) {
    console.error('❌ Authentication failed');
    return;
  }

  const sourceKeypair = Keypair.fromSecret(SOURCE_SECRET_KEY);
  const sourceAccount = await server.loadAccount(sourceKeypair.publicKey());

  const transaction = new TransactionBuilder(sourceAccount, {
    fee: '100',
    networkPassphrase: NETWORK_PASSPHRASE,
  })
    .addOperation(
      Operation.payment({
        destination: recipient,
        asset: Asset.native(),
        amount: '1',
      })
    )
    .addMemo(Memo.text('Payment via biometric auth'))
    .setTimeout(30)
    .build();

  transaction.sign(sourceKeypair);

  console.log('✅ Transaction with memo signed');
  console.log('Hash:', transaction.hash().toString('hex'));
}

// =====================================================
// RUN DEMO
// =====================================================

signTransactionWithBiometric().catch(console.error);

// Uncomment to test other examples
// signMultiOpTransactionWithBiometric().catch(console.error);
// signTransactionWithMemo().catch(console.error);
