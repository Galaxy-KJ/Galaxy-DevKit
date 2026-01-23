/**
 * Example: Guardian Approval Flow
 * 
 * This example demonstrates:
 * - Guardian receiving approval request
 * - Guardian reviewing recovery details
 * - Guardian approving recovery
 * - Multi-guardian approval workflow
 */

import { SocialRecovery } from '@galaxy/core-wallet/recovery';
import { Server, Keypair, Networks } from '@stellar/stellar-sdk';

const NETWORK_PASSPHRASE = Networks.TESTNET;
const HORIZON_URL = 'https://horizon-testnet.stellar.org';

/**
 * Simulates a guardian receiving and processing a recovery approval request
 */
async function guardianApprovalFlow() {
  console.log('\n👥 Guardian Approval Flow Example...\n');

  const server = new Server(HORIZON_URL);
  const encryptionKey = 'your-secure-encryption-key-32-chars-long!!';

  // Setup: Wallet owner, new owner, and guardians
  const walletOwner = Keypair.random();
  const newOwner = Keypair.random();
  const guardian1 = Keypair.random();
  const guardian2 = Keypair.random();
  const guardian3 = Keypair.random();

  // Initialize recovery system
  const recovery = new SocialRecovery(
    {
      guardians: [
        {
          publicKey: guardian1.publicKey(),
          name: 'Alice (Guardian)',
          addedAt: new Date(),
          verified: true,
          status: 'active' as any,
        },
        {
          publicKey: guardian2.publicKey(),
          name: 'Bob (Guardian)',
          addedAt: new Date(),
          verified: true,
          status: 'active' as any,
        },
        {
          publicKey: guardian3.publicKey(),
          name: 'Charlie (Guardian)',
          addedAt: new Date(),
          verified: true,
          status: 'active' as any,
        },
      ],
      threshold: 2, // Need 2 out of 3
      timeLockHours: 48,
      enableTesting: true,
    },
    server,
    NETWORK_PASSPHRASE,
    encryptionKey
  );

  // Step 1: Recovery is initiated (by wallet owner or recovery service)
  console.log('📨 Step 1: Recovery request initiated');
  const recoveryRequest = await recovery.initiateRecovery(
    walletOwner.publicKey(),
    newOwner.publicKey(),
    true // Test mode
  );
  console.log(`   Request ID: ${recoveryRequest.id}`);
  console.log(`   Wallet: ${recoveryRequest.walletPublicKey.substring(0, 12)}...`);
  console.log(`   New Owner: ${recoveryRequest.newOwnerKey.substring(0, 12)}...`);
  console.log(`   Executes At: ${recoveryRequest.executesAt.toISOString()}\n`);

  // Step 2: Guardian 1 receives notification and reviews
  console.log('👤 Step 2: Guardian 1 (Alice) reviewing request...');
  console.log('   📧 Notification received: Recovery approval required');
  console.log('   🔍 Reviewing recovery details...');
  console.log('   ✅ Details verified - legitimate recovery request\n');

  // Step 3: Guardian 1 approves
  console.log('✅ Step 3: Guardian 1 approving...');
  const approval1 = await recovery.guardianApprove(
    recoveryRequest.id,
    guardian1.publicKey(),
    guardian1.secret()
  );
  console.log(`   ✅ Approved by ${approval1.guardianPublicKey.substring(0, 12)}...`);
  console.log(`   ⏰ Approved at: ${approval1.approvedAt.toISOString()}\n`);

  // Check current status
  let currentRequest = recovery.getRecoveryRequest(recoveryRequest.id);
  console.log('📊 Current Status:');
  console.log(`   Approvals: ${currentRequest?.approvals.length}/${recovery.getGuardians().length}`);
  console.log(`   Threshold: ${recovery.getGuardians().length > 0 ? Math.ceil(recovery.getGuardians().length * 0.6) : 0}`);
  console.log(`   Status: ${currentRequest?.status}\n`);

  // Step 4: Guardian 2 receives notification
  console.log('👤 Step 4: Guardian 2 (Bob) reviewing request...');
  console.log('   📧 Notification received: Recovery approval required');
  console.log('   🔍 Reviewing recovery details...');
  console.log('   ⚠️  Noticing this is a legitimate request\n');

  // Step 5: Guardian 2 approves (threshold reached)
  console.log('✅ Step 5: Guardian 2 approving...');
  const approval2 = await recovery.guardianApprove(
    recoveryRequest.id,
    guardian2.publicKey(),
    guardian2.secret()
  );
  console.log(`   ✅ Approved by ${approval2.guardianPublicKey.substring(0, 12)}...\n`);

  // Check updated status
  currentRequest = recovery.getRecoveryRequest(recoveryRequest.id);
  console.log('📊 Updated Status:');
  console.log(`   Approvals: ${currentRequest?.approvals.length}/${recovery.getGuardians().length}`);
  console.log(`   Status: ${currentRequest?.status}`);
  console.log(`   Threshold Reached: ${currentRequest?.status === 'approved'}\n`);

  if (currentRequest?.status === 'approved') {
    console.log('🎯 Threshold Reached!');
    console.log('   ⏰ Time-lock period started');
    console.log(`   📅 Recovery will execute at: ${currentRequest.executesAt.toISOString()}`);
    console.log('   📧 Wallet owner notified of threshold reached');
    console.log('   ⚠️  24-hour warning will be sent before execution\n');
  }

  // Step 6: Guardian 3 (optional - threshold already reached)
  console.log('👤 Step 6: Guardian 3 (Charlie) - Optional approval');
  console.log('   ℹ️  Threshold already reached, but Guardian 3 can still approve\n');
  
  const approval3 = await recovery.guardianApprove(
    recoveryRequest.id,
    guardian3.publicKey(),
    guardian3.secret()
  );
  console.log(`   ✅ Guardian 3 also approved\n`);

  // Final status
  const finalRequest = recovery.getRecoveryRequest(recoveryRequest.id);
  console.log('📊 Final Status:');
  console.log(`   Total Approvals: ${finalRequest?.approvals.length}`);
  console.log(`   Status: ${finalRequest?.status}`);
  console.log(`   All Guardians Approved: ${finalRequest?.approvals.length === recovery.getGuardians().length}\n`);

  return { recovery, recoveryRequest };
}

/**
 * Example: Guardian rejecting/cancelling (via owner)
 */
async function guardianRejectionExample() {
  console.log('\n🚫 Example: Recovery Cancellation\n');

  const { recovery, recoveryRequest } = await guardianApprovalFlow();

  // Owner cancels after seeing recovery initiated
  console.log('📧 Wallet owner receives notification of recovery initiation');
  console.log('   ⚠️  Owner did not initiate this recovery!');
  console.log('   🚫 Owner cancels recovery...\n');

  await recovery.cancelRecovery(
    recoveryRequest.id,
    recoveryRequest.walletPublicKey
  );

  const cancelledRequest = recovery.getRecoveryRequest(recoveryRequest.id);
  console.log('✅ Recovery cancelled');
  console.log(`   Status: ${cancelledRequest?.status}`);
  console.log(`   Cancelled By: ${cancelledRequest?.cancelledBy?.substring(0, 12)}...`);
  console.log(`   📧 All guardians notified of cancellation\n`);
}

/**
 * Example: Multi-guardian coordination
 */
async function multiGuardianCoordination() {
  console.log('\n🤝 Multi-Guardian Coordination Example\n');

  const server = new Server(HORIZON_URL);
  const encryptionKey = 'your-secure-encryption-key-32-chars-long!!';

  const walletOwner = Keypair.random();
  const newOwner = Keypair.random();

  // Create 5 guardians
  const guardians = Array.from({ length: 5 }, () => Keypair.random());

  const recovery = new SocialRecovery(
    {
      guardians: guardians.map((g, i) => ({
        publicKey: g.publicKey(),
        name: `Guardian ${i + 1}`,
        addedAt: new Date(),
        verified: true,
        status: 'active' as any,
      })),
      threshold: 3, // Need 3 out of 5 (60%)
      timeLockHours: 48,
      enableTesting: true,
    },
    server,
    NETWORK_PASSPHRASE,
    encryptionKey
  );

  const recoveryRequest = await recovery.initiateRecovery(
    walletOwner.publicKey(),
    newOwner.publicKey(),
    true
  );

  console.log('📊 Recovery Configuration:');
  console.log(`   Total Guardians: ${recovery.getGuardians().length}`);
  console.log(`   Threshold: ${Math.ceil(recovery.getGuardians().length * 0.6)} approvals needed\n`);

  // Simulate guardians approving in sequence
  console.log('👥 Guardians approving...');
  for (let i = 0; i < 3; i++) {
    await recovery.guardianApprove(
      recoveryRequest.id,
      guardians[i].publicKey(),
      guardians[i].secret()
    );
    const current = recovery.getRecoveryRequest(recoveryRequest.id);
    console.log(`   ✅ Guardian ${i + 1} approved (${current?.approvals.length}/${recovery.getGuardians().length})`);
    
    if (current?.status === 'approved') {
      console.log(`   🎯 Threshold reached after ${i + 1} approvals!\n`);
      break;
    }
  }

  const final = recovery.getRecoveryRequest(recoveryRequest.id);
  console.log('📊 Final Status:');
  console.log(`   Approvals: ${final?.approvals.length}`);
  console.log(`   Status: ${final?.status}\n`);
}

// Run examples
if (require.main === module) {
  guardianApprovalFlow()
    .then(() => {
      return guardianRejectionExample();
    })
    .then(() => {
      return multiGuardianCoordination();
    })
    .then(() => {
      console.log('✅ All guardian approval examples completed\n');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error:', error);
      process.exit(1);
    });
}

export { guardianApprovalFlow, guardianRejectionExample, multiGuardianCoordination };
