/**
 * Example: Setup Social Recovery
 * 
 * This example demonstrates:
 * - Setting up social recovery for a wallet
 * - Adding and verifying guardians
 * - Configuring recovery parameters
 * - Adding emergency contacts
 */

import { SocialRecovery } from '@galaxy/core-wallet/recovery';
import { Server, Keypair, Networks } from '@stellar/stellar-sdk';

const NETWORK_PASSPHRASE = Networks.TESTNET;
const HORIZON_URL = 'https://horizon-testnet.stellar.org';

async function setupSocialRecovery() {
  console.log('\n🔐 Setting up Social Recovery System...\n');

  // Initialize Stellar server
  const server = new Server(HORIZON_URL);
  const encryptionKey = 'your-secure-encryption-key-32-chars-long!!'; // In production, use secure key management

  // Generate guardian keypairs (in production, these would be real guardian wallets)
  const guardian1 = Keypair.random();
  const guardian2 = Keypair.random();
  const guardian3 = Keypair.random();
  const guardian4 = Keypair.random();

  console.log('📋 Guardian Public Keys:');
  console.log(`  Guardian 1: ${guardian1.publicKey()}`);
  console.log(`  Guardian 2: ${guardian2.publicKey()}`);
  console.log(`  Guardian 3: ${guardian3.publicKey()}`);
  console.log(`  Guardian 4: ${guardian4.publicKey()}\n`);

  // Initialize recovery system
  const recovery = new SocialRecovery(
    {
      guardians: [
        {
          publicKey: guardian1.publicKey(),
          name: 'Alice (Family)',
          addedAt: new Date(),
          verified: false,
          status: 'pending' as any,
        },
        {
          publicKey: guardian2.publicKey(),
          name: 'Bob (Friend)',
          addedAt: new Date(),
          verified: false,
          status: 'pending' as any,
        },
        {
          publicKey: guardian3.publicKey(),
          name: 'Charlie (Colleague)',
          addedAt: new Date(),
          verified: false,
          status: 'pending' as any,
        },
      ],
      threshold: 2, // Need 2 out of 3 guardians (60% threshold)
      timeLockHours: 48, // 48-hour time-lock before execution
      notificationMethod: 'email',
      enableTesting: true, // Enable dry-run testing
      minGuardians: 3,
      maxGuardians: 10,
    },
    server,
    NETWORK_PASSPHRASE,
    encryptionKey
  );

  console.log('✅ Recovery system initialized');
  console.log(`   Threshold: 2 out of ${recovery.getGuardians().length} guardians`);
  console.log(`   Time-lock: 48 hours\n`);

  // Add additional guardian
  console.log('➕ Adding additional guardian...');
  const newGuardian = await recovery.addGuardian(
    guardian4.publicKey(),
    'Diana (Trusted Contact)',
    'diana@example.com' // Encrypted contact information
  );
  console.log(`✅ Guardian added: ${newGuardian.name} (${newGuardian.publicKey.substring(0, 8)}...)\n`);

  // Verify guardians
  console.log('🔍 Verifying guardians...');
  for (const guardian of recovery.getGuardians()) {
    if (!guardian.verified) {
      await recovery.verifyGuardian(guardian.publicKey());
      console.log(`✅ Verified: ${guardian.name || guardian.publicKey.substring(0, 8)}`);
    }
  }
  console.log('');

  // Add emergency contacts
  console.log('📞 Adding emergency contacts...');
  const emergencyContact1 = await recovery.addEmergencyContact(
    'Emergency Contact 1',
    'emergency1@example.com',
    'Family'
  );
  const emergencyContact2 = await recovery.addEmergencyContact(
    'Emergency Contact 2',
    '+1234567890',
    'Friend'
  );
  console.log(`✅ Added ${recovery.getEmergencyContacts().length} emergency contacts\n`);

  // Display final configuration
  console.log('📊 Final Recovery Configuration:');
  console.log(`   Total Guardians: ${recovery.getGuardians().length}`);
  console.log(`   Active Guardians: ${recovery.getGuardians().filter(g => g.status === 'active').length}`);
  console.log(`   Verified Guardians: ${recovery.getGuardians().filter(g => g.verified).length}`);
  console.log(`   Threshold: 2 approvals required`);
  console.log(`   Time-lock: 48 hours`);
  console.log(`   Emergency Contacts: ${recovery.getEmergencyContacts().length}\n`);

  console.log('✅ Social recovery setup complete!\n');
  console.log('💡 Next steps:');
  console.log('   1. Share guardian public keys with your guardians');
  console.log('   2. Test recovery process (see 15-initiate-recovery.ts)');
  console.log('   3. Store recovery configuration securely\n');

  return recovery;
}

// Example: Guardian selection best practices
function guardianSelectionTips() {
  console.log('\n📚 Guardian Selection Best Practices:\n');
  console.log('1. Minimum 3 guardians recommended');
  console.log('2. Choose diverse set: family, friends, trusted contacts');
  console.log('3. Select active people who will respond promptly');
  console.log('4. Consider geographic diversity');
  console.log('5. Ensure guardians understand the recovery process');
  console.log('6. Only select people you trust completely\n');
}

// Run example
if (require.main === module) {
  setupSocialRecovery()
    .then(() => {
      guardianSelectionTips();
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Error:', error);
      process.exit(1);
    });
}

export { setupSocialRecovery, guardianSelectionTips };
