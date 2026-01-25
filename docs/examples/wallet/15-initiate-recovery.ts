/**
 * Example: Initiate Recovery Process
 * 
 * This example demonstrates:
 * - Initiating a wallet recovery
 * - Guardian approval workflow
 * - Time-lock mechanism
 * - Recovery cancellation
 */

import { SocialRecovery } from '@galaxy/core-wallet/recovery';
import { Server, Keypair, Networks } from '@stellar/stellar-sdk';

const NETWORK_PASSPHRASE = Networks.TESTNET;
const HORIZON_URL = 'https://horizon-testnet.stellar.org';

async function initiateRecovery() {
  console.log('\n🔐 Initiating Wallet Recovery...\n');

  // Initialize (in production, load from stored configuration)
  const server = new Server(HORIZON_URL);
  const encryptionKey = 'your-secure-encryption-key-32-chars-long!!';

  // Wallet keys (in production, these would be from your wallet)
  const currentWalletOwner = Keypair.random();
  const newWalletOwner = Keypair.random();

  console.log('📋 Wallet Information:');
  console.log(`   Current Owner: ${currentWalletOwner.publicKey()}`);
  console.log(`   New Owner: ${newWalletOwner.publicKey()}\n`);

  // Initialize recovery system (with existing guardians)
  const guardian1 = Keypair.random();
  const guardian2 = Keypair.random();
  const guardian3 = Keypair.random();

  const recovery = new SocialRecovery(
    {
      guardians: [
        {
          publicKey: guardian1.publicKey(),
          name: 'Guardian 1',
          addedAt: new Date(),
          verified: true,
          status: 'active' as any,
        },
        {
          publicKey: guardian2.publicKey(),
          name: 'Guardian 2',
          addedAt: new Date(),
          verified: true,
          status: 'active' as any,
        },
        {
          publicKey: guardian3.publicKey(),
          name: 'Guardian 3',
          addedAt: new Date(),
          verified: true,
          status: 'active' as any,
        },
      ],
      threshold: 2,
      timeLockHours: 48,
      enableTesting: true,
    },
    server,
    NETWORK_PASSPHRASE,
    encryptionKey
  );

  // Step 1: Initiate recovery
  console.log('🚀 Step 1: Initiating recovery request...');
  const recoveryRequest = await recovery.initiateRecovery(
    currentWalletOwner.publicKey(),
    newWalletOwner.publicKey(),
    true // Test mode (dry-run)
  );

  console.log(`✅ Recovery initiated`);
  console.log(`   Request ID: ${recoveryRequest.id}`);
  console.log(`   Status: ${recoveryRequest.status}`);
  console.log(`   Executes At: ${recoveryRequest.executesAt.toISOString()}`);
  console.log(`   Test Mode: ${recoveryRequest.testMode}\n`);

  // Step 2: Guardians approve
  console.log('👥 Step 2: Guardian approvals...');
  
  // Guardian 1 approves
  console.log('   Guardian 1 approving...');
  const approval1 = await recovery.guardianApprove(
    recoveryRequest.id,
    guardian1.publicKey(),
    guardian1.secret()
  );
  console.log(`   ✅ Guardian 1 approved at ${approval1.approvedAt.toISOString()}`);

  // Guardian 2 approves
  console.log('   Guardian 2 approving...');
  const approval2 = await recovery.guardianApprove(
    recoveryRequest.id,
    guardian2.publicKey(),
    guardian2.secret()
  );
  console.log(`   ✅ Guardian 2 approved at ${approval2.approvedAt.toISOString()}\n`);

  // Check status
  const updatedRequest = recovery.getRecoveryRequest(recoveryRequest.id);
  console.log('📊 Recovery Status:');
  console.log(`   Status: ${updatedRequest?.status}`);
  console.log(`   Approvals: ${updatedRequest?.approvals.length}/${recovery.getGuardians().length}`);
  console.log(`   Threshold Reached: ${updatedRequest?.status === 'approved'}\n`);

  if (updatedRequest?.status === 'approved') {
    console.log('⏰ Time-lock period started');
    console.log(`   Recovery will execute at: ${updatedRequest.executesAt.toISOString()}`);
    console.log(`   Time remaining: ${Math.round((updatedRequest.executesAt.getTime() - Date.now()) / (1000 * 60 * 60))} hours\n`);
  }

  return { recovery, recoveryRequest };
}

async function cancelRecoveryExample() {
  console.log('\n🚫 Example: Cancelling Recovery\n');

  const { recovery, recoveryRequest } = await initiateRecovery();

  // Cancel recovery (owner can cancel before execution)
  console.log('Cancelling recovery request...');
  await recovery.cancelRecovery(
    recoveryRequest.id,
    recoveryRequest.walletPublicKey
  );

  const cancelledRequest = recovery.getRecoveryRequest(recoveryRequest.id);
  console.log(`✅ Recovery cancelled`);
  console.log(`   Status: ${cancelledRequest?.status}`);
  console.log(`   Cancelled At: ${cancelledRequest?.cancelledAt?.toISOString()}`);
  console.log(`   Cancelled By: ${cancelledRequest?.cancelledBy}\n`);
}

async function testRecoveryExample() {
  console.log('\n🧪 Example: Testing Recovery (Dry-Run)\n');

  const server = new Server(HORIZON_URL);
  const encryptionKey = 'your-secure-encryption-key-32-chars-long!!';

  const guardian1 = Keypair.random();
  const guardian2 = Keypair.random();
  const guardian3 = Keypair.random();

  const recovery = new SocialRecovery(
    {
      guardians: [
        {
          publicKey: guardian1.publicKey(),
          addedAt: new Date(),
          verified: true,
          status: 'active' as any,
        },
        {
          publicKey: guardian2.publicKey(),
          addedAt: new Date(),
          verified: true,
          status: 'active' as any,
        },
        {
          publicKey: guardian3.publicKey(),
          addedAt: new Date(),
          verified: true,
          status: 'active' as any,
        },
      ],
      threshold: 2,
      timeLockHours: 48,
      enableTesting: true,
    },
    server,
    NETWORK_PASSPHRASE,
    encryptionKey
  );

  const walletOwner = Keypair.random();
  const newOwner = Keypair.random();

  console.log('Running recovery test...');
  const testResult = await recovery.testRecovery(
    walletOwner.publicKey(),
    newOwner.publicKey()
  );

  console.log('📊 Test Results:');
  console.log(`   Success: ${testResult.success}`);
  console.log(`   Test ID: ${testResult.testId}`);
  console.log(`   Guardians Notified: ${testResult.guardiansNotified}`);
  console.log(`   Approvals Received: ${testResult.approvalsReceived}`);
  console.log(`   Threshold Reached: ${testResult.thresholdReached}`);
  console.log(`   Time-lock Simulated: ${testResult.timeLockSimulated}`);
  if (testResult.warnings) {
    console.log(`   Warnings: ${testResult.warnings.join(', ')}`);
  }
  console.log('');
}

// Run examples
if (require.main === module) {
  initiateRecovery()
    .then(() => {
      return cancelRecoveryExample();
    })
    .then(() => {
      return testRecoveryExample();
    })
    .then(() => {
      console.log('✅ All examples completed\n');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error:', error);
      process.exit(1);
    });
}

export { initiateRecovery, cancelRecoveryExample, testRecoveryExample };
