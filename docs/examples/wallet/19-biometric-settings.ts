import { BiometricAuth } from "packages/core/wallet/auth/src/BiometricAuth";
import { WebAuthNProvider } from "packages/core/wallet/auth/src/providers/WebAuthNProvider";

async function manageBiometricSettings() {
  console.log('Managing biometric settings...\n');

  const provider = new WebAuthNProvider();
  const biometric = new BiometricAuth(provider);
  await biometric.initialize();

  // View current configuration
  console.log('Current configuration:');
  console.log(biometric.getConfig());
  console.log();

  // Update transaction threshold
  console.log('Updating transaction threshold to 10 SOL...');
  biometric.updateConfig({
    transactionThreshold: '10000000000', // 10 SOL
  });
  console.log('✓ Threshold updated\n');

  // Adjust max attempts
  console.log('Adjusting max authentication attempts to 3...');
  biometric.updateConfig({
    maxAttempts: 3,
  });
  console.log('✓ Max attempts updated\n');

  // Change fallback method
  console.log('Changing fallback authentication to password...');
  biometric.updateConfig({
    fallbackAuth: 'password',
  });
  console.log('✓ Fallback method updated\n');

  // View all enrolled credentials
  console.log('Enrolled credentials:');
  const credentials = biometric.getCredentials();
  credentials.forEach((cred, index) => {
    console.log(`  ${index + 1}. ID: ${cred.id}`);
    console.log(`     Type: ${cred.type}`);
    console.log(`     Created: ${new Date(cred.createdAt).toISOString()}`);
    console.log(`     Last used: ${new Date(cred.lastUsed).toISOString()}`);
  });
  console.log();

  // Enroll additional biometric
  console.log('Enrolling additional biometric (Face ID)...');
  try {
    const newCred = await biometric.enroll('face');
    console.log('✓ Face ID enrolled:', newCred.id);
  } catch (error) {
    console.error('Enrollment failed:', error.message);
  }
  console.log();

  // Remove a credential
  if (credentials.length > 0) {
    const credToRemove = credentials[0];
    console.log(`Removing credential ${credToRemove.id}...`);

    const removed = await biometric.removeCredential(credToRemove.id);
    if (removed) {
      console.log('✓ Credential removed');
    }
  }
  console.log();

  // Temporarily disable biometric auth
  console.log('Temporarily disabling biometric authentication...');
  biometric.disable();
  console.log('✓ Biometric auth disabled');
  console.log('  Enabled:', biometric.getConfig().enabled);
  console.log();

  // Re-enable biometric auth
  console.log('Re-enabling biometric authentication...');
  biometric.enable();
  console.log('✓ Biometric auth enabled');
  console.log('  Enabled:', biometric.getConfig().enabled);
  console.log();

  // Check for security changes
  console.log('Checking for security changes...');
  const hasChanges = await biometric.detectSecurityChange();
  if (hasChanges) {
    console.warn('⚠ Security changes detected!');
  } else {
    console.log('✓ No security changes detected');
  }
  console.log();

  // Reset failed attempts (admin function)
  console.log('Resetting failed authentication attempts...');
  biometric.resetFailedAttempts();
  console.log('✓ Failed attempts reset');
  console.log();

  // Final configuration
  console.log('Final configuration:');
  console.log(biometric.getConfig());

  console.log('\n✓ Settings management complete!');
}

manageBiometricSettings().catch(console.error);
