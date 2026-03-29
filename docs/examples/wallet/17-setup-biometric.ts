import  {BiometricAuth}  from 'packages/core/wallet/auth/src/BiometricAuth';
import { WebAuthNProvider } from 'packages/core/wallet/auth/src/providers/WebAuthNProvider';

async function setupBiometricAuth() {
  console.log('Setting up biometric authentication...\n');

  // Create provider (WebAuthN for web, platform-specific for mobile)
  const provider = new WebAuthNProvider({
    rpId: 'your-app.com',
    rpName: 'My Wallet App',
  });

  // Initialize biometric auth
  const biometric = new BiometricAuth(provider, {
    enabled: true,
    biometricType: 'any', // Accept any available biometric
    requireForTransactions: true,
    transactionThreshold: '5000000000', // 5 SOL
    fallbackAuth: 'pin',
    maxAttempts: 5,
  });

  // Check device capabilities
  console.log('Checking device capabilities...');
  const capabilities = await biometric.getCapabilities();

  console.log('Device capabilities:', {
    available: capabilities.available,
    types: capabilities.types,
    security: capabilities.hardwareSecurity,
    enrolled: capabilities.enrolled,
  });

  if (!capabilities.available) {
    console.error('Biometric authentication not available on this device');
    return;
  }

  // Initialize
  try {
    await biometric.initialize();
    console.log('✓ Biometric authentication initialized\n');
  } catch (error) {
    console.error('Failed to initialize:', error.message);
    return;
  }

  // Enroll biometric credential
  console.log('Enrolling biometric credential...');
  try {
    const credential = await biometric.enroll('fingerprint');
    console.log('✓ Credential enrolled:', {
      id: credential.id,
      type: credential.type,
      createdAt: new Date(credential.createdAt).toISOString(),
    });
  } catch (error) {
    console.error('Enrollment failed:', error.message);
    return;
  }

  // Store encryption key securely
  console.log('\nStoring wallet encryption key...');
  const walletKey = 'your-encrypted-private-key-here';

  try {
    await biometric.storeEncryptedKey(walletKey, 'main-wallet');
    console.log('✓ Encryption key stored securely');
  } catch (error) {
    console.error('Failed to store key:', error.message);
  }

  // Set up event listeners
  biometric.on('authenticated', () => {
    console.log('✓ User authenticated successfully');
  });

  biometric.on('failed-attempt', ({ attempts, remaining }) => {
    console.warn(
      `⚠ Authentication failed. Attempts: ${attempts}, Remaining: ${remaining}`
    );
  });

  biometric.on('locked', ({ until, duration }) => {
    const unlockTime = new Date(until).toISOString();
    console.error(`🔒 Account locked until ${unlockTime} (${duration}ms)`);
  });

  biometric.on('security-change', change => {
    console.warn(`⚠ Security change detected: ${change}`);
  });

  console.log('\n✓ Biometric authentication setup complete!');
  return biometric;
}

// Run example
setupBiometricAuth().catch(console.error);

