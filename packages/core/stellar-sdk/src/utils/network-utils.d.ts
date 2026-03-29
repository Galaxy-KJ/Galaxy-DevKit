/**
 * @fileoverview Network utilities for Stellar operations
 * @description Helper functions for network-related operations
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */
import { NetworkConfig } from '../types/stellar-types.js';
/**
 * Network utility class
 * @class NetworkUtils
 * @description Provides helper methods for network operations
 */
export declare class NetworkUtils {
    /**
     * Predefined network configurations
     */
    static readonly NETWORKS: {
        PUBLIC: NetworkConfig;
        TESTNET: NetworkConfig;
    };
    /**
     * Validates if a string is a valid Stellar public key
     * @param publicKey - Public key to validate
     * @returns boolean
     */
    isValidPublicKey(publicKey: string): boolean;
    /**
     * Validates if a string is a valid Stellar secret key
     * @param secretKey - Secret key to validate
     * @returns boolean
     */
    isValidSecretKey(secretKey: string): boolean;
    /**
     * Gets network configuration by name
     * @param networkName - Network name ('public' or 'testnet')
     * @returns NetworkConfig
     */
    getNetworkConfig(networkName: 'public' | 'testnet'): NetworkConfig;
    /**
     * Creates a custom network configuration
     * @param horizonUrl - Horizon server URL
     * @param passphrase - Network passphrase
     * @param name - Network name
     * @returns NetworkConfig
     */
    createCustomNetwork(horizonUrl: string, passphrase: string, network?: 'testnet' | 'mainnet'): NetworkConfig;
    /**
     * Determines if the network is testnet based on passphrase
     * @param passphrase - Network passphrase
     * @returns boolean
     */
    static isTestnet(passphrase: string): boolean;
    /**
     * Determines if the network is public based on passphrase
     * @param passphrase - Network passphrase
     * @returns boolean
     */
    isPublic(passphrase: string): boolean;
    /**
     * Gets the appropriate friendbot URL for testnet funding
     * @returns string
     */
    getFriendbotUrl(): string;
    /**
     * Funds a testnet account using Friendbot
     * @param publicKey - Public key to fund
     * @returns Promise<boolean>
     */
    fundTestnetAccount(publicKey: string): Promise<boolean>;
    /**
     * Encodes raw public key bytes to Stellar format
     * @param rawPublicKey - Raw public key bytes
     * @returns string
     */
    encodePublicKey(rawPublicKey: Buffer): string;
    /**
     * Encodes raw secret key bytes to Stellar format
     * @param rawSecretKey - Raw secret key bytes
     * @returns string
     */
    encodeSecretKey(rawSecretKey: Buffer): string;
    /**
     * Decodes a Stellar public key to raw bytes
     * @param publicKey - Stellar public key
     * @returns Buffer
     */
    decodePublicKey(publicKey: string): Buffer;
    /**
     * Decodes a Stellar secret key to raw bytes
     * @param secretKey - Stellar secret key
     * @returns Buffer
     */
    decodeSecretKey(secretKey: string): Buffer;
    /**
     * Validates a Stellar address (account ID)
     * @param address - Address to validate
     * @returns boolean
     */
    isValidAddress(address: string): boolean;
    /**
     * Validates a muxed account address
     * @param address - Muxed address to validate
     * @returns boolean
     */
    isValidMuxedAccount(address: string): boolean;
    /**
     * Gets explorer URL for a transaction
     * @param txHash - Transaction hash
     * @param network - Network type
     * @returns string
     */
    getExplorerUrl(txHash: string, network?: 'public' | 'testnet'): string;
    /**
     * Gets explorer URL for an account
     * @param publicKey - Account public key
     * @param network - Network type
     * @returns string
     */
    getAccountExplorerUrl(publicKey: string, network?: 'public' | 'testnet'): string;
    /**
     * Checks network connectivity
     * @param horizonUrl - Horizon server URL
     * @returns Promise<boolean>
     */
    checkNetworkConnectivity(horizonUrl: string): Promise<boolean>;
    /**
     * Gets network health status
     * @param horizonUrl - Horizon server URL
     * @returns Promise<object>
     */
    getNetworkHealth(horizonUrl: string): Promise<{
        isHealthy: boolean;
        latency?: number;
        error?: string;
    }>;
}
//# sourceMappingURL=network-utils.d.ts.map