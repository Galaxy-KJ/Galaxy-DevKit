/**
 * Stellar Testnet Configuration
 * 
 * Provides network endpoints and configuration for Stellar testnet.
 * Use this to connect to the Stellar Development Foundation's testnet.
 */


import Server from 'stellar-sdk';
import { Networks, Horizon } from 'stellar-sdk';
import type { TestNetworkConfig } from './types';

/**
 * Stellar Testnet Configuration Constants
 * 
 * These are the official Stellar Development Foundation testnet endpoints.
 * Testnet is used for development and testing. No real money involved.
 */
export const STELLAR_TESTNET_CONFIG: TestNetworkConfig = {
  // Network passphrase for signing transactions
  // Every transaction must be signed with the correct passphrase
  networkPassphrase: Networks.TESTNET,

  // Friendbot faucet URL for funding test accounts
  // Send a GET request with ?addr=ACCOUNT_ID to fund with 10,000 XLM
  friendbotUrl: 'https://friendbot.stellar.org',

  // Horizon REST API for account info, transactions, etc.
  horizonUrl: 'https://horizon-testnet.stellar.org',

  // Soroban RPC for smart contract deployment and invocation
  sorobanRpcUrl: 'https://soroban-testnet.stellar.org:443',

  // Flag to identify this as testnet
  isTestnet: true,
};

/**
 * Network Configuration Manager
 * 
 * Handles all testnet network operations and configuration.
 */
export class NetworkConfiguration {
  private config: TestNetworkConfig;

  private server: Horizon.Server;

  constructor(config: TestNetworkConfig = STELLAR_TESTNET_CONFIG) {
    this.config = config;
    // Create Horizon server instance for REST API calls
    this.server = new Server(config.horizonUrl, {
      // Allow HTTP in testnet (only use HTTPS in production)
      allowHttp: config.isTestnet,
    });
  }

  /**
   * Get the current network configuration
   */
  getConfig(): TestNetworkConfig {
    return this.config;
  }

  /**
   * Get the Horizon server instance
   * Used for REST API operations like fetching account info
   */
  getServer(): InstanceType<typeof Server> {
    return this.server;
  }

  /**
   * Get the network passphrase
   * Used to sign transactions
   */
  getNetworkPassphrase(): string {
    return this.config.networkPassphrase;
  }

  /**
   * Get the Soroban RPC URL
   * Used for smart contract operations
   */
  getSorobanRpcUrl(): string {
    return this.config.sorobanRpcUrl;
  }

  /**
   * Get the Friendbot faucet URL
   * Used to fund test accounts
   */
  getFriendbotUrl(): string {
    return this.config.friendbotUrl;
  }

  /**
   * Get the Horizon URL
   */
  getHorizonUrl(): string {
    return this.config.horizonUrl;
  }

  /**
   * Validate network connection
   * Tests if we can connect to Horizon
   */
  async validateConnection(): Promise<boolean> {
    try {
      await this.server.root();
      return true;
    } catch (error) {
      console.error('❌ Network connection failed:', error);
      return false;
    }
  }

  /**
   * Check if Friendbot is accessible
   * Validates faucet endpoint
   */
  async validateFriendbot(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.friendbotUrl}/`);
      return response.ok;
    } catch (error) {
      console.error('❌ Friendbot connection failed:', error);
      return false;
    }
  }

  /**
   * Get network status summary
   * Returns object with connection info
   */
  async getNetworkStatus(): Promise<{
    isConnected: boolean;
    isFriendbot: boolean;
    horizon: string;
    soroban: string;
  }> {
    return {
      isConnected: await this.validateConnection(),
      isFriendbot: await this.validateFriendbot(),
      horizon: this.config.horizonUrl,
      soroban: this.config.sorobanRpcUrl,
    };
  }
}

/**
 * Singleton instance of network configuration
 * Use this throughout your tests
 */
export const networkConfig = new NetworkConfiguration();