/**
 * Type definitions for Stellar testnet configuration
 */

export interface TestNetworkConfig {
  /**
   * Stellar testnet network passphrase
   * Used to sign transactions for testnet
   */
  networkPassphrase: string;

  /**
   * Friendbot faucet URL
   * Used to fund test accounts with XLM
   */
  friendbotUrl: string;

  /**
   * Horizon API URL
   * REST API for Stellar testnet
   */
  horizonUrl: string;

  /**
   * Soroban RPC URL
   * RPC endpoint for smart contract interaction
   */
  sorobanRpcUrl: string;

  /**
   * Flag indicating if this is testnet
   */
  isTestnet: boolean;
}

export interface TestAccount {
  /**
   * Stellar keypair for signing transactions
   */
  keypair: any; // Keypair from stellar-sdk

  /**
   * Public key (account ID)
   * Format: G followed by 55 alphanumeric characters
   */
  publicKey: string;

  /**
   * Secret key for signing
   * Format: S followed by 55 alphanumeric characters
   * KEEP THIS SECRET!
   */
  secretKey: string;

  /**
   * Account details (optional)
   * Populated after fetching from network
   */
  account?: any;
}