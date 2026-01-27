/**
 * Test Account Management
 * 
 * Manages test accounts on Stellar testnet.
 * Features:
 * - Create new accounts
 * - Fund accounts via Friendbot
 * - Store and retrieve account credentials
 * - Import existing accounts
 */

import { Keypair, Account } from 'stellar-sdk';
import axios from 'axios';
import { networkConfig } from './network-config';
import type { TestAccount } from './types';

/**
 * Test Account Manager
 * 
 * Handles creation, funding, and management of test accounts
 * on the Stellar testnet.
 */
export class TestAccountManager {
  /**
   * Map of test accounts by name
   * Example: { 'lender': TestAccount, 'borrower': TestAccount }
   */
  private testAccounts: Map<string, TestAccount> = new Map();

  /**
   * Friendbot faucet URL
   * Used to fund new accounts with test XLM
   */
  private friendbotUrl: string;

  constructor(friendbotUrl: string = networkConfig.getFriendbotUrl()) {
    this.friendbotUrl = friendbotUrl;
  }

  /**
   * Create a new test account and fund it via Friendbot
   * 
   * Steps:
   * 1. Generate random keypair
   * 2. Fund account via Friendbot (receives 10,000 test XLM)
   * 3. Store account details
   * 4. Return account info
   * 
   * @param name - Friendly name for this account (default: 'test-account')
   * @returns TestAccount with keypair and public/secret keys
   * @throws Error if Friendbot funding fails
   */
  async createFundedAccount(name: string = 'test-account'): Promise<TestAccount> {
    try {
      // Step 1: Generate random keypair for new account
      const keypair = Keypair.random();
      const publicKey = keypair.publicKey();

      console.log(`🔑 Generated keypair for ${name}`);
      console.log(`   Public Key: ${publicKey}`);

      // Step 2: Fund account via Friendbot
      console.log(`💰 Funding account via Friendbot...`);
      const response = await axios.get(
        `${this.friendbotUrl}?addr=${publicKey}`
      );

      if (response.status !== 200) {
        throw new Error(
          `Friendbot returned status ${response.status}: ${response.statusText}`
        );
      }

      // Step 3: Create TestAccount object
      const testAccount: TestAccount = {
        keypair,
        publicKey,
        secretKey: keypair.secret(),
      };

      // Step 4: Store account
      this.testAccounts.set(name, testAccount);

      console.log(`✅ Created and funded account: ${name}`);
      console.log(`   Balance: 10,000 XLM (from Friendbot)`);

      return testAccount;
    } catch (error) {
      console.error(`❌ Failed to create test account:`, error);
      throw new Error(`Failed to create test account: ${error}`);
    }
  }

  /**
   * Get a test account by name
   * 
   * @param name - Name of the account
   * @returns TestAccount if found, undefined otherwise
   */
  getAccount(name: string): TestAccount | undefined {
    return this.testAccounts.get(name);
  }

  /**
   * Get all test accounts
   * 
   * @returns Map of all created accounts
   */
  getAllAccounts(): Map<string, TestAccount> {
    return this.testAccounts;
  }

  /**
   * List all account names
   * 
   * @returns Array of account names
   */
  listAccountNames(): string[] {
    return Array.from(this.testAccounts.keys());
  }

  /**
   * Check if an account exists
   * 
   * @param name - Account name to check
   * @returns true if account exists
   */
  hasAccount(name: string): boolean {
    return this.testAccounts.has(name);
  }

  /**
   * Import an account from a secret key
   * 
   * Use this to import existing accounts or use known test accounts.
   * 
   * @param name - Friendly name for this account
   * @param secretKey - Secret key (starts with 'S')
   * @returns TestAccount
   */
  importAccount(name: string, secretKey: string): TestAccount {
    try {
      const keypair = Keypair.fromSecret(secretKey);
      const testAccount: TestAccount = {
        keypair,
        publicKey: keypair.publicKey(),
        secretKey,
      };
      this.testAccounts.set(name, testAccount);
      console.log(`✅ Imported account: ${name}`);
      return testAccount;
    } catch (error) {
      throw new Error(`Invalid secret key: ${error}`);
    }
  }

  /**
   * Get a specific account's public key
   * 
   * @param name - Account name
   * @returns Public key (account ID)
   */
  getPublicKey(name: string): string | undefined {
    return this.testAccounts.get(name)?.publicKey;
  }

  /**
   * Get a specific account's keypair
   * 
   * @param name - Account name
   * @returns Keypair for signing transactions
   */
  getKeypair(name: string): any | undefined {
    return this.testAccounts.get(name)?.keypair;
  }

  /**
   * Clear all test accounts
   * Use this in afterAll() or cleanup methods
   */
  clearAccounts(): void {
    this.testAccounts.clear();
    console.log('🗑️  Cleared all test accounts');
  }

  /**
   * Get account summary
   * Useful for debugging
   * 
   * @returns Object with account information
   */
  getSummary(): { name: string; publicKey: string }[] {
    return Array.from(this.testAccounts.entries()).map(([name, account]) => ({
      name,
      publicKey: account.publicKey,
    }));
  }
}