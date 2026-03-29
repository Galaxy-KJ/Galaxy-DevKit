"use strict";
/**
 * @fileoverview Network utilities for Stellar operations
 * @description Helper functions for network-related operations
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NetworkUtils = void 0;
const stellar_sdk_1 = require("@stellar/stellar-sdk");
/**
 * Network utility class
 * @class NetworkUtils
 * @description Provides helper methods for network operations
 */
class NetworkUtils {
    /**
     * Validates if a string is a valid Stellar public key
     * @param publicKey - Public key to validate
     * @returns boolean
     */
    isValidPublicKey(publicKey) {
        try {
            return stellar_sdk_1.StrKey.isValidEd25519PublicKey(publicKey);
        }
        catch {
            return false;
        }
    }
    /**
     * Validates if a string is a valid Stellar secret key
     * @param secretKey - Secret key to validate
     * @returns boolean
     */
    isValidSecretKey(secretKey) {
        try {
            return stellar_sdk_1.StrKey.isValidEd25519SecretSeed(secretKey);
        }
        catch {
            return false;
        }
    }
    /**
     * Gets network configuration by name
     * @param networkName - Network name ('public' or 'testnet')
     * @returns NetworkConfig
     */
    getNetworkConfig(networkName) {
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
    createCustomNetwork(horizonUrl, passphrase, network = 'testnet') {
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
    static isTestnet(passphrase) {
        return passphrase === stellar_sdk_1.Networks.TESTNET;
    }
    /**
     * Determines if the network is public based on passphrase
     * @param passphrase - Network passphrase
     * @returns boolean
     */
    isPublic(passphrase) {
        return passphrase === stellar_sdk_1.Networks.PUBLIC;
    }
    /**
     * Gets the appropriate friendbot URL for testnet funding
     * @returns string
     */
    getFriendbotUrl() {
        return 'https://friendbot.stellar.org';
    }
    /**
     * Funds a testnet account using Friendbot
     * @param publicKey - Public key to fund
     * @returns Promise<boolean>
     */
    async fundTestnetAccount(publicKey) {
        try {
            if (!this.isValidPublicKey(publicKey)) {
                throw new Error('Invalid public key');
            }
            const friendbotUrl = this.getFriendbotUrl();
            const response = await fetch(`${friendbotUrl}?addr=${encodeURIComponent(publicKey)}`);
            if (!response.ok) {
                throw new Error(`Friendbot request failed: ${response.statusText}`);
            }
            return true;
        }
        catch (error) {
            throw new Error(`Failed to fund testnet account: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Encodes raw public key bytes to Stellar format
     * @param rawPublicKey - Raw public key bytes
     * @returns string
     */
    encodePublicKey(rawPublicKey) {
        return stellar_sdk_1.StrKey.encodeEd25519PublicKey(rawPublicKey);
    }
    /**
     * Encodes raw secret key bytes to Stellar format
     * @param rawSecretKey - Raw secret key bytes
     * @returns string
     */
    encodeSecretKey(rawSecretKey) {
        return stellar_sdk_1.StrKey.encodeEd25519SecretSeed(rawSecretKey);
    }
    /**
     * Decodes a Stellar public key to raw bytes
     * @param publicKey - Stellar public key
     * @returns Buffer
     */
    decodePublicKey(publicKey) {
        return stellar_sdk_1.StrKey.decodeEd25519PublicKey(publicKey);
    }
    /**
     * Decodes a Stellar secret key to raw bytes
     * @param secretKey - Stellar secret key
     * @returns Buffer
     */
    decodeSecretKey(secretKey) {
        return stellar_sdk_1.StrKey.decodeEd25519SecretSeed(secretKey);
    }
    /**
     * Validates a Stellar address (account ID)
     * @param address - Address to validate
     * @returns boolean
     */
    isValidAddress(address) {
        return this.isValidPublicKey(address);
    }
    /**
     * Validates a muxed account address
     * @param address - Muxed address to validate
     * @returns boolean
     */
    isValidMuxedAccount(address) {
        try {
            return stellar_sdk_1.StrKey.isValidMed25519PublicKey(address);
        }
        catch {
            return false;
        }
    }
    /**
     * Gets explorer URL for a transaction
     * @param txHash - Transaction hash
     * @param network - Network type
     * @returns string
     */
    getExplorerUrl(txHash, network = 'public') {
        const baseUrl = network === 'public'
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
    getAccountExplorerUrl(publicKey, network = 'public') {
        const baseUrl = network === 'public'
            ? 'https://stellar.expert/explorer/public'
            : 'https://stellar.expert/explorer/testnet';
        return `${baseUrl}/account/${publicKey}`;
    }
    /**
     * Checks network connectivity
     * @param horizonUrl - Horizon server URL
     * @returns Promise<boolean>
     */
    async checkNetworkConnectivity(horizonUrl) {
        try {
            const response = await fetch(horizonUrl);
            return response.ok;
        }
        catch {
            return false;
        }
    }
    /**
     * Gets network health status
     * @param horizonUrl - Horizon server URL
     * @returns Promise<object>
     */
    async getNetworkHealth(horizonUrl) {
        const startTime = Date.now();
        try {
            const response = await fetch(horizonUrl);
            const latency = Date.now() - startTime;
            return {
                isHealthy: response.ok,
                latency,
            };
        }
        catch (error) {
            return {
                isHealthy: false,
                error: error instanceof Error ? error.message : 'Unknown error',
            };
        }
    }
}
exports.NetworkUtils = NetworkUtils;
/**
 * Predefined network configurations
 */
NetworkUtils.NETWORKS = {
    PUBLIC: {
        name: 'mainnet',
        horizonUrl: 'https://horizon.stellar.org',
        passphrase: stellar_sdk_1.Networks.PUBLIC,
        network: 'mainnet',
    },
    TESTNET: {
        name: 'testnet',
        horizonUrl: 'https://horizon-testnet.stellar.org',
        passphrase: stellar_sdk_1.Networks.TESTNET,
        network: 'testnet',
    },
};
//# sourceMappingURL=network-utils.js.map