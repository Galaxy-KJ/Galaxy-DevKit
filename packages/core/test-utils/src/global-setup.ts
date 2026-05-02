const { Keypair } = require('@stellar/stellar-sdk');
const { fundWithFriendbot } = require('./testnet-helpers');
const os = require('os');

/**
 * Global setup for Jest integration tests.
 * Funds accounts for each worker to avoid SequenceNumber conflicts.
 */
async function globalSetup() {
  console.log('\n--- Global Integration Test Setup ---');
  
  // Determine how many workers Jest is using
  const numWorkers = process.env.JEST_WORKER_ID ? 1 : (os.cpus().length || 4);
  
  console.log(`Funding ${numWorkers} worker accounts in parallel...`);
  
  const workerKeypairs = Array.from({ length: numWorkers }, () => Keypair.random());
  
  await Promise.all(workerKeypairs.map(async (kp) => {
    console.log(`Funding worker account: ${kp.publicKey()}`);
    return fundWithFriendbot(kp.publicKey());
  }));
  
  const workerAccounts = workerKeypairs.map(kp => kp.secret());
  
  // Store these in environment variables for workers to pick up
  process.env.GALAXY_TEST_WORKER_ACCOUNTS = JSON.stringify(workerAccounts);
  
  console.log('--- Setup Complete ---\n');
}

module.exports = globalSetup;
