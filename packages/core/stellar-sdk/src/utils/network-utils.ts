/**
 * @fileoverview Network utilities for Stellar operations
 * @description Helper functions for network-related operations
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */

import { Networks, StrKey } from '@stellar/stellar-sdk';
import { NetworkConfig } from '../types/stellar-types.js';

/**
 * Network utility class
 * @class NetworkUtils
 * @description Provides helper methods for network operations
 */
export class NetworkUtils {
  /**
   * Predefined network configurations
   */
  static readonly NETWORKS = {
    PUBLIC: {
      name: 'mainnet',
      horizonUrl: 'https://horizon.stellar.org',
      passphrase: Networks.PUBLIC,
      network: 'mainnet',
    } as NetworkConfig,
    TESTNET: {
      name: 'testnet',
      horizonUrl: 'https://horizon-testnet.stellar.org',
      passphrase: Networks.TESTNET,
      network: 'testnet',
    } as NetworkConfig,
  };

  /**
   * Validates if a string is a valid Stellar public key
   * @param publicKey - Public key to validate
   * @returns boolean
   */
  isValidPublicKey(publicKey: string): boolean {
    try {
      return StrKey.isValidEd25519PublicKey(publicKey);
    } catch {
      return false;
    }
  }

  /**
   * Validates if a string is a valid Stellar secret key
   * @param secretKey - Secret key to validate
   * @returns boolean
   */
  isValidSecretKey(secretKey: string): boolean {
    try {
      return StrKey.isValidEd25519SecretSeed(secretKey);
    } catch {
      return false;
    }
  }

  /**
   * Gets network configuration by name
   * @param networkName - Network name ('public' or 'testnet')
   * @returns NetworkConfig
   */
  getNetworkConfig(networkName: 'public' | 'testnet'): NetworkConfig {
    return networkName === 'public'
      ? NetworkUtils.NETWORKS.PUBLIC
      : NetworkUtils.NETWORKS.TESTNET;
  }

  /**
   * Creates a custom network configuration
   * @param horizonUrl - Horizon server URL
   * @param passphrase - Network passphrase
   * @param name - Network name
   * @returns NetworkConfig
   */
  createCustomNetwork(
    horizonUrl: string,
    passphrase: string,
    network: 'testnet' | 'mainnet' = 'testnet'
  ): NetworkConfig {
    return {
      horizonUrl,
      passphrase,
      network,
    };
  }

  /**
   * Determines if the network is testnet based on passphrase
   * @param passphrase - Network passphrase
   * @returns boolean
   */
  static isTestnet(passphrase: string): boolean {
    return passphrase === Networks.TESTNET;
  }

  /**
   * Determines if the network is public based on passphrase
   * @param passphrase - Network passphrase
   * @returns boolean
   */
  isPublic(passphrase: string): boolean {
    return passphrase === Networks.PUBLIC;
  }

  /**
   * Gets the appropriate friendbot URL for testnet funding
   * @returns string
   */
  getFriendbotUrl(): string {
    return 'https://friendbot.stellar.org';
  }

  /**
   * Funds a testnet account using Friendbot
   * @param publicKey - Public key to fund
   * @returns Promise<boolean>
   */
  async fundTestnetAccount(publicKey: string): Promise<boolean> {
    try {
      if (!this.isValidPublicKey(publicKey)) {
        throw new Error('Invalid public key');
      }

      const friendbotUrl = this.getFriendbotUrl();
      const response = await fetch(
        `${friendbotUrl}?addr=${encodeURIComponent(publicKey)}`
      );

      if (!response.ok) {
        throw new Error(`Friendbot request failed: ${response.statusText}`);
      }

      return true;
    } catch (error) {
      throw new Error(
        `Failed to fund testnet account: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Encodes raw public key bytes to Stellar format
   * @param rawPublicKey - Raw public key bytes
   * @returns string
   */
  encodePublicKey(rawPublicKey: Buffer): string {
    return StrKey.encodeEd25519PublicKey(rawPublicKey);
  }

  /**
   * Encodes raw secret key bytes to Stellar format
   * @param rawSecretKey - Raw secret key bytes
   * @returns string
   */
  encodeSecretKey(rawSecretKey: Buffer): string {
    return StrKey.encodeEd25519SecretSeed(rawSecretKey);
  }

  /**
   * Decodes a Stellar public key to raw bytes
   * @param publicKey - Stellar public key
   * @returns Buffer
   */
  decodePublicKey(publicKey: string): Buffer {
    return StrKey.decodeEd25519PublicKey(publicKey);
  }

  /**
   * Decodes a Stellar secret key to raw bytes
   * @param secretKey - Stellar secret key
   * @returns Buffer
   */
  decodeSecretKey(secretKey: string): Buffer {
    return StrKey.decodeEd25519SecretSeed(secretKey);
  }

  /**
   * Validates a Stellar address (account ID)
   * @param address - Address to validate
   * @returns boolean
   */
  isValidAddress(address: string): boolean {
    return this.isValidPublicKey(address);
  }

  /**
   * Validates a muxed account address
   * @param address - Muxed address to validate
   * @returns boolean
   */
  isValidMuxedAccount(address: string): boolean {
    try {
      return StrKey.isValidMed25519PublicKey(address);
    } catch {
      return false;
    }
  }

  /**
   * Gets explorer URL for a transaction
   * @param txHash - Transaction hash
   * @param network - Network type
   * @returns string
   */
  getExplorerUrl(
    txHash: string,
    network: 'public' | 'testnet' = 'public'
  ): string {
    const baseUrl =
      network === 'public'
        ? 'https://stellar.expert/explorer/public'
        : 'https://stellar.expert/explorer/testnet';
    return `${baseUrl}/tx/${txHash}`;
  }

  /**
   * Gets explorer URL for an account
   * @param publicKey - Account public key
   * @param network - Network type
   * @returns string
   */
  getAccountExplorerUrl(
    publicKey: string,
    network: 'public' | 'testnet' = 'public'
  ): string {
    const baseUrl =
      network === 'public'
        ? 'https://stellar.expert/explorer/public'
        : 'https://stellar.expert/explorer/testnet';
    return `${baseUrl}/account/${publicKey}`;
  }

  /**
   * Checks network connectivity
   * @param horizonUrl - Horizon server URL
   * @returns Promise<boolean>
   */
  async checkNetworkConnectivity(horizonUrl: string): Promise<boolean> {
    try {
      const response = await fetch(horizonUrl);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Gets network health status
   * @param horizonUrl - Horizon server URL
   * @returns Promise<object>
   */
  async getNetworkHealth(horizonUrl: string): Promise<{
    isHealthy: boolean;
    latency?: number;
    error?: string;
  }> {
    const startTime = Date.now();
    try {
      const response = await fetch(horizonUrl);
      const latency = Date.now() - startTime;

      return {
        isHealthy: response.ok,
        latency,
      };
    } catch (error) {
      return {
        isHealthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
