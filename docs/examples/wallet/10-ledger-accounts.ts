/**
 * Example: Multiple Ledger Accounts
 *
 * This example demonstrates how to manage multiple Stellar accounts
 * using BIP44 derivation paths with Ledger hardware wallet.
 */

import {
  LedgerWallet,
  buildStellarPath,
  validateStellarPath,
  LedgerAccount,
} from '../../../packages/core/wallet/auth/src/hardware';

async function manageLedgerAccounts() {
  console.log('🔐 Ledger Multiple Accounts Example\n');

  // Create Ledger wallet instance
  const ledger = new LedgerWallet({
    transport: 'usb',
    timeout: 30000,
  });

  // Set up event listeners
  ledger.on('connecting', () => {
    console.log('🔄 Connecting to Ledger...');
  });

  ledger.on('connected', (deviceInfo) => {
    console.log('✅ Connected to Ledger');
    console.log(`   Firmware: ${deviceInfo.firmwareVersion}`);
  });

  ledger.on('accounts-retrieved', (accounts) => {
    console.log(`✅ Retrieved ${accounts.length} accounts`);
  });

  try {
    // Step 1: Connect to Ledger
    console.log('Step 1: Connecting to Ledger device...');
    console.log('⚠️  Make sure your Ledger is unlocked and Stellar app is open\n');
    await ledger.connect();
    console.log();

    // Step 2: Understanding BIP44 Derivation Paths
    console.log('Step 2: Understanding BIP44 Derivation Paths');
    console.log('─────────────────────────────────────────────');
    console.log('BIP44 path format: m / purpose\' / coin_type\' / account\' / change / address_index');
    console.log('Stellar uses: m / 44\' / 148\' / account\' / 0 / 0');
    console.log('');
    console.log('Examples:');
    console.log('  Account 0: 44\'/148\'/0\'  (default)');
    console.log('  Account 1: 44\'/148\'/1\'');
    console.log('  Account 2: 44\'/148\'/2\'');
    console.log('');

    // Step 3: Validate derivation paths
    console.log('Step 3: Validating derivation paths...');
    const paths = [
      "44'/148'/0'",
      "44'/148'/1'",
      "44'/148'/2'",
      "44'/0'/0'", // Invalid (wrong coin type)
    ];

    paths.forEach((path) => {
      const isValid = validateStellarPath(path);
      console.log(`  ${path.padEnd(15)} - ${isValid ? '✅ Valid' : '❌ Invalid'}`);
    });
    console.log();

    // Step 4: Retrieve multiple accounts
    console.log('Step 4: Retrieving multiple accounts from Ledger...');
    console.log('👉 This will retrieve accounts 0-4 (no device confirmation needed)\n');

    const accounts = await ledger.getAccounts(0, 5);

    console.log('✅ Retrieved accounts:\n');
    accounts.forEach((account) => {
      console.log(`Account ${account.index}:`);
      console.log(`  Derivation Path: ${account.derivationPath}`);
      console.log(`  Public Key: ${account.publicKey}`);
      console.log(`  Status: ${account.balance ? 'Funded' : 'Not yet funded'}`);
      console.log();
    });

    // Step 5: Get specific account with custom derivation path
    console.log('Step 5: Getting specific account (Account 10)...');
    const accountPath = buildStellarPath(10);
    console.log(`  Derivation Path: ${accountPath}`);

    const account10PublicKey = await ledger.getPublicKey(accountPath);
    console.log(`  Public Key: ${account10PublicKey}\n`);

    // Step 6: Display account on device for verification
    console.log('Step 6: Verifying account on device...');
    console.log('👉 Please verify Account 0 address on your Ledger device\n');

    const verifiedAddress = await ledger.displayAddress(buildStellarPath(0));
    console.log('✅ Address verified on device');
    console.log(`  Address: ${verifiedAddress}\n`);

    // Step 7: Work with account cache
    console.log('Step 7: Using account cache...');
    const cachedAccount = ledger.getCachedAccount(buildStellarPath(0));

    if (cachedAccount) {
      console.log('✅ Account found in cache:');
      console.log('  Public Key:', cachedAccount.publicKey);
      console.log('  Index:', cachedAccount.index);
      console.log('  (No device interaction needed for cached accounts)');
    } else {
      console.log('⚠️  Account not in cache');
    }
    console.log();

    // Step 8: Generate accounts with custom indices
    console.log('Step 8: Generating custom account list...');
    const customIndices = [0, 5, 10, 15, 20];

    console.log('Custom accounts:');
    for (const index of customIndices) {
      const path = buildStellarPath(index);
      console.log(`  Account ${index.toString().padStart(2)}: ${path}`);
    }
    console.log();

    // Step 9: Best practices
    console.log('Step 9: Account Management Best Practices');
    console.log('────────────────────────────────────────────');
    console.log('✅ DO:');
    console.log('  - Start with account 0 for primary account');
    console.log('  - Use sequential account numbers (0, 1, 2, ...)');
    console.log('  - Cache account information to reduce device queries');
    console.log('  - Verify addresses on device for important accounts');
    console.log('  - Keep track of which accounts are funded');
    console.log('');
    console.log('❌ DON\'T:');
    console.log('  - Use random account indices');
    console.log('  - Create too many unused accounts');
    console.log('  - Forget to back up your Ledger recovery phrase');
    console.log('  - Share public keys without verifying them first');
    console.log();

    // Step 10: Practical use cases
    console.log('Step 10: Practical Use Cases');
    console.log('───────────────────────────');
    console.log('Account 0: Personal funds (default)');
    console.log('Account 1: Business transactions');
    console.log('Account 2: Savings account');
    console.log('Account 3: DeFi operations');
    console.log('Account 4: Testing and development');
    console.log();

    // Clear cache example
    console.log('Step 11: Cache management...');
    console.log('Current cache size:', accounts.length);
    ledger.clearAccountCache();
    console.log('✅ Cache cleared');
    const clearedCache = ledger.getCachedAccount(buildStellarPath(0));
    console.log('Cache after clear:', clearedCache ? 'Not empty' : 'Empty');
    console.log();

    // Disconnect
    console.log('Step 12: Disconnecting from Ledger...');
    await ledger.disconnect();
    console.log('✅ Disconnected successfully');

    // Summary
    console.log('\n✅ Multiple Accounts Example Complete!');
    console.log('\n📝 Summary:');
    console.log(`   - Retrieved ${accounts.length} accounts from Ledger`);
    console.log('   - Verified address on device');
    console.log('   - Demonstrated account caching');
    console.log('   - Showed custom derivation paths');

    console.log('\n🎯 Key Concepts:');
    console.log('   - BIP44 derivation enables hierarchical account structure');
    console.log('   - Each account has a unique public/private key pair');
    console.log('   - Accounts are deterministic (same seed = same accounts)');
    console.log('   - Sequential account numbers are recommended');
    console.log('   - Cache reduces device interactions');

  } catch (error: any) {
    console.error('\n❌ Error during account management:', error.message);

    if (error.code) {
      console.error('Error code:', error.code);

      switch (error.code) {
        case 'DEVICE_NOT_CONNECTED':
          console.log('\n💡 Please connect your Ledger device');
          break;
        case 'APP_NOT_OPEN':
          console.log('\n💡 Please open the Stellar app on your Ledger');
          break;
        case 'USER_REJECTED':
          console.log('\n💡 Address verification was rejected');
          console.log('   This is expected if you declined on the device');
          break;
        case 'INVALID_DERIVATION_PATH':
          console.log('\n💡 The derivation path is invalid for Stellar');
          console.log('   Use format: 44\'/148\'/account\'');
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

/**
 * Advanced: Account Discovery
 * Scan for funded accounts on the blockchain
 */
async function discoverFundedAccounts(
  ledger: LedgerWallet,
  maxAccounts: number = 20
): Promise<LedgerAccount[]> {
  console.log(`\nDiscovering funded accounts (scanning ${maxAccounts} accounts)...`);

  const fundedAccounts: LedgerAccount[] = [];

  for (let i = 0; i < maxAccounts; i++) {
    const path = buildStellarPath(i);
    const publicKey = await ledger.getPublicKey(path);

    // In a real implementation, you would check the Stellar network
    // to see if this account is funded
    // Example:
    // const isFunded = await stellarService.isAccountFunded(publicKey);
    // if (isFunded) {
    //   const balance = await stellarService.getBalance(publicKey);
    //   fundedAccounts.push({ publicKey, derivationPath: path, index: i, balance });
    // }

    console.log(`  Checking account ${i}... (${publicKey.substring(0, 10)}...)`);

    // For this example, we'll just add all accounts
    fundedAccounts.push({
      publicKey,
      derivationPath: path,
      index: i,
    });
  }

  console.log(`✅ Found ${fundedAccounts.length} accounts\n`);
  return fundedAccounts;
}

// Run the example
if (require.main === module) {
  manageLedgerAccounts().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { manageLedgerAccounts, discoverFundedAccounts };
