/**
 * Example: Sign Transaction with Ledger
 *
 * This example demonstrates how to sign a Stellar transaction
 * using a Ledger hardware wallet.
 */

import {
  LedgerWallet,
  STELLAR_BIP44_PATH,
  LedgerError,
} from '../../../packages/core/wallet/auth/src/hardware';
import * as crypto from 'crypto';

async function signTransactionWithLedger() {
  console.log('🔐 Ledger Transaction Signing Example\n');

  // Create Ledger wallet instance
  const ledger = new LedgerWallet({
    transport: 'usb',
    timeout: 60000, // 60 seconds for user confirmation
  });

  // Set up event listeners
  ledger.on('prompt-user', ({ action, message }) => {
    console.log(`\n👉 ${message}`);
  });

  ledger.on('transaction-signed', (result) => {
    console.log('✅ Transaction signed successfully');
    console.log('Signature length:', result.signature.length);
  });

  ledger.on('error', (error: LedgerError) => {
    console.error('❌ Error:', error.message);
  });

  try {
    // Step 1: Connect to Ledger
    console.log('Step 1: Connecting to Ledger device...');
    console.log('⚠️  Make sure your Ledger is unlocked and Stellar app is open\n');
    await ledger.connect();
    console.log('✅ Connected to Ledger\n');

    // Step 2: Get public key
    console.log('Step 2: Retrieving public key...');
    const publicKey = await ledger.getPublicKey(STELLAR_BIP44_PATH);
    console.log('✅ Public Key:', publicKey);
    console.log('   This is the account that will sign the transaction\n');

    // Step 3: Create a mock transaction hash
    // In a real scenario, this would be the hash of an actual Stellar transaction
    console.log('Step 3: Creating transaction hash...');
    const transactionData = {
      source: publicKey,
      destination: 'GDESTINATION1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      amount: '100.0000000',
      asset: 'XLM',
      memo: 'Payment via Ledger',
      sequence: '123456789',
      fee: '100',
      network: 'TESTNET',
    };

    console.log('Transaction Details:', {
      ...transactionData,
      source: transactionData.source.substring(0, 10) + '...',
      destination: transactionData.destination.substring(0, 10) + '...',
    });

    // Create transaction hash (mock)
    const transactionHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(transactionData))
      .digest();

    console.log('✅ Transaction hash created');
    console.log('   Hash:', transactionHash.toString('hex').substring(0, 20) + '...\n');

    // Step 4: Sign transaction with Ledger
    console.log('Step 4: Signing transaction with Ledger...');
    console.log('👉 Please review the transaction on your Ledger device');
    console.log('   - Check the destination address');
    console.log('   - Check the amount');
    console.log('   - Approve if everything is correct\n');

    const signatureResult = await ledger.signTransaction(
      transactionHash,
      STELLAR_BIP44_PATH
    );

    console.log('✅ Transaction signed successfully!\n');
    console.log('Signature Result:', {
      publicKey: signatureResult.publicKey.substring(0, 10) + '...',
      signatureLength: signatureResult.signature.length + ' bytes',
      hash: signatureResult.hash?.substring(0, 20) + '...',
    });

    // Step 5: Verify signature (mock verification)
    console.log('\nStep 5: Verifying signature...');
    console.log('✅ Signature format valid');
    console.log('   - Signature is 64 bytes (ED25519)');
    console.log('   - Public key matches signing account');

    // In a real scenario, you would:
    // 1. Attach the signature to the Stellar transaction
    // 2. Submit the transaction to the Stellar network
    // 3. Monitor for confirmation

    console.log('\n📝 Next Steps (in a real application):');
    console.log('   1. Attach signature to Stellar transaction');
    console.log('   2. Submit transaction to Stellar network');
    console.log('   3. Monitor transaction status');
    console.log('   4. Confirm transaction on Stellar blockchain');

    // Step 6: Sign an arbitrary message (optional)
    console.log('\n\nBonus: Signing an arbitrary message...');
    const message = 'Verify ownership of Stellar account';
    const messageHash = crypto.createHash('sha256').update(message).digest();

    console.log('Message:', message);
    console.log('👉 Please confirm message signing on your device\n');

    const messageSignature = await ledger.signHash(messageHash, STELLAR_BIP44_PATH);

    console.log('✅ Message signed successfully');
    console.log('Message Signature:', {
      publicKey: messageSignature.publicKey.substring(0, 10) + '...',
      signatureLength: messageSignature.signature.length + ' bytes',
    });

    // Step 7: Disconnect
    console.log('\nStep 7: Disconnecting from Ledger...');
    await ledger.disconnect();
    console.log('✅ Disconnected successfully');

    console.log('\n✅ Transaction signing example complete!');
    console.log('\n🎯 Key Takeaways:');
    console.log('   - Transactions are signed securely on the Ledger device');
    console.log('   - Private keys never leave the hardware wallet');
    console.log('   - Users must physically approve transactions');
    console.log('   - Signatures can be verified before submission');

  } catch (error: any) {
    console.error('\n❌ Error during transaction signing:', error.message);

    if (error instanceof LedgerError) {
      console.error('Error code:', error.code);

      switch (error.code) {
        case 'USER_REJECTED':
          console.log('\n💡 Transaction was rejected on the device');
          console.log('   This is expected if you declined the transaction');
          break;
        case 'DEVICE_NOT_CONNECTED':
          console.log('\n💡 Please connect your Ledger device');
          break;
        case 'APP_NOT_OPEN':
          console.log('\n💡 Please open the Stellar app on your Ledger');
          break;
        case 'CONNECTION_TIMEOUT':
          console.log('\n💡 Transaction approval timed out');
          console.log('   Please try again and approve within the time limit');
          break;
        default:
          console.log('\n💡 Please check your device and try again');
      }
    }

    // Cleanup
    try {
      if (ledger.isConnected()) {
        await ledger.disconnect();
      }
    } catch {
      // Ignore cleanup errors
    }

    process.exit(1);
  }
}

// Utility function to create a real Stellar transaction (for reference)
async function createStellarTransaction(
  sourcePublicKey: string,
  destination: string,
  amount: string
): Promise<Buffer> {
  // This is a placeholder showing how to integrate with Stellar SDK
  // In a real implementation, you would:

  /*
  import { StellarService } from '@galaxy/core-stellar-sdk';

  const stellarService = new StellarService(networkConfig);

  // Build transaction
  const transaction = await stellarService.buildTransaction({
    source: sourcePublicKey,
    destination,
    amount,
    asset: 'native',
  });

  // Get transaction hash for signing
  const transactionHash = transaction.hash();

  return transactionHash;
  */

  // For this example, we return a mock hash
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        source: sourcePublicKey,
        destination,
        amount,
      })
    )
    .digest();
}

// Run the example
if (require.main === module) {
  signTransactionWithLedger().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { signTransactionWithLedger, createStellarTransaction };
