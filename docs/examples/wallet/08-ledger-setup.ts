/**
 * Example: Ledger Hardware Wallet Setup
 *
 * This example demonstrates how to connect to a Ledger device
 * and retrieve account information for Stellar.
 */

import {
  LedgerWallet,
  detectLedgerDevices,
  isLedgerSupported,
  STELLAR_BIP44_PATH,
} from '../../../packages/core/wallet/auth/src/hardware';

async function setupLedger() {
  console.log('🔐 Ledger Hardware Wallet Setup Example\n');

  // Step 1: Check if Ledger is supported in current environment
  console.log('Step 1: Checking Ledger support...');
  const supported = isLedgerSupported();

  if (!supported) {
    console.error('❌ Ledger is not supported in this environment');
    process.exit(1);
  }
  console.log('✅ Ledger is supported\n');

  // Step 2: Detect available Ledger devices
  console.log('Step 2: Detecting Ledger devices...');
  const devicesDetected = await detectLedgerDevices();

  if (!devicesDetected) {
    console.log('⚠️  No Ledger devices detected');
    console.log('Please connect your Ledger device via USB');
    process.exit(1);
  }
  console.log('✅ Ledger device detected\n');

  // Step 3: Create Ledger wallet instance
  console.log('Step 3: Creating Ledger wallet instance...');
  const ledger = new LedgerWallet({
    transport: 'usb',
    derivationPath: STELLAR_BIP44_PATH,
    timeout: 30000,
    autoReconnect: true,
    maxReconnectAttempts: 3,
  });
  console.log('✅ Ledger wallet instance created\n');

  // Step 4: Set up event listeners
  console.log('Step 4: Setting up event listeners...');

  ledger.on('connecting', () => {
    console.log('🔄 Connecting to Ledger device...');
  });

  ledger.on('connected', (deviceInfo) => {
    console.log('✅ Connected to Ledger device');
    console.log('Device Info:', {
      model: deviceInfo.model,
      firmwareVersion: deviceInfo.firmwareVersion,
      appVersion: deviceInfo.appVersion,
      stellarAppOpen: deviceInfo.isStellarAppOpen,
    });
  });

  ledger.on('disconnected', () => {
    console.log('❌ Ledger device disconnected');
  });

  ledger.on('error', (error) => {
    console.error('❌ Ledger error:', error.message);
    console.error('Error code:', error.code);
  });

  ledger.on('prompt-user', ({ action, message }) => {
    console.log(`\n👉 ${message}`);
  });

  console.log('✅ Event listeners configured\n');

  try {
    // Step 5: Connect to Ledger device
    console.log('Step 5: Connecting to Ledger device...');
    console.log('⚠️  Please make sure:');
    console.log('   1. Your Ledger device is connected via USB');
    console.log('   2. Your Ledger device is unlocked');
    console.log('   3. The Stellar app is open on your device\n');

    await ledger.connect();

    // Step 6: Get device information
    console.log('\nStep 6: Retrieving device information...');
    const deviceInfo = await ledger.getDeviceInfo();
    console.log('Device Information:', {
      model: deviceInfo.model,
      firmwareVersion: deviceInfo.firmwareVersion,
      appVersion: deviceInfo.appVersion,
      stellarAppOpen: deviceInfo.isStellarAppOpen,
    });

    if (!deviceInfo.isStellarAppOpen) {
      console.log('\n⚠️  Stellar app is not open on your device');
      console.log('Please open the Stellar app and try again');
      await ledger.disconnect();
      process.exit(1);
    }

    // Step 7: Get public key (default account)
    console.log('\nStep 7: Retrieving public key...');
    const publicKey = await ledger.getPublicKey(STELLAR_BIP44_PATH, false);
    console.log('✅ Public Key:', publicKey);
    console.log('Derivation Path:', STELLAR_BIP44_PATH);

    // Step 8: Display address on device for verification
    console.log('\nStep 8: Displaying address on device...');
    console.log('👉 Please verify the address on your Ledger device');
    const verifiedPublicKey = await ledger.displayAddress(STELLAR_BIP44_PATH);
    console.log('✅ Address verified on device:', verifiedPublicKey);

    // Step 9: Get connection status
    console.log('\nStep 9: Checking connection status...');
    const status = ledger.getConnectionStatus();
    console.log('Connection Status:', {
      connected: status.connected,
      lastConnectedAt: status.lastConnectedAt,
    });

    // Step 10: Disconnect
    console.log('\nStep 10: Disconnecting from Ledger...');
    await ledger.disconnect();
    console.log('✅ Disconnected successfully');

    console.log('\n✅ Ledger setup complete!');
    console.log('\n📝 Summary:');
    console.log('   - Ledger device detected and connected');
    console.log('   - Stellar app verified');
    console.log(`   - Public key retrieved: ${publicKey.substring(0, 10)}...`);
    console.log('   - Address verified on device');

  } catch (error: any) {
    console.error('\n❌ Error during Ledger setup:', error.message);

    if (error.code) {
      console.error('Error code:', error.code);

      // Provide helpful suggestions based on error type
      switch (error.code) {
        case 'DEVICE_NOT_CONNECTED':
          console.log('\n💡 Suggestion: Please connect your Ledger device via USB');
          break;
        case 'APP_NOT_OPEN':
          console.log('\n💡 Suggestion: Please open the Stellar app on your Ledger device');
          break;
        case 'DEVICE_LOCKED':
          console.log('\n💡 Suggestion: Please unlock your Ledger device by entering your PIN');
          break;
        case 'CONNECTION_TIMEOUT':
          console.log('\n💡 Suggestion: Check your USB connection and try again');
          break;
        default:
          console.log('\n💡 Suggestion: Please check your device and try again');
      }
    }

    // Ensure cleanup
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

// Run the example
if (require.main === module) {
  setupLedger().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { setupLedger };
