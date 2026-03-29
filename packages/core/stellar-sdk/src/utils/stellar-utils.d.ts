/**
 * @fileoverview Utility functions for Stellar operations
 * @description Contains helper functions and utilities for Stellar operations
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */
/**
 * Validates a Stellar public key
 * @param publicKey - The public key to validate
 * @returns boolean
 */
export declare const isValidPublicKey: (publicKey: string) => boolean;
/**
 * Validates a Stellar secret key
 * @param secretKey - The secret key to validate
 * @returns boolean
 */
export declare const isValidSecretKey: (secretKey: string) => boolean;
/**
 * Generates a random Stellar keypair
 * @returns Object with publicKey and secretKey
 */
export declare const generateKeypair: () => {
    publicKey: string;
    secretKey: string;
};
/**
 * Converts Stellar amount to stroops (smallest unit)
 * @param amount - Amount in XLM
 * @returns number of stroops
 */
export declare const toStroops: (amount: string | number) => number;
/**
 * Converts stroops to XLM amount
 * @param stroops - Amount in stroops
 * @returns string representation of XLM amount
 */
export declare const fromStroops: (stroops: number) => string;
/**
 * Formats a Stellar address for display
 * @param address - Stellar address
 * @param startChars - Number of characters to show at start
 * @param endChars - Number of characters to show at end
 * @returns formatted address
 */
export declare const formatAddress: (address: string, startChars?: number, endChars?: number) => string;
/**
 * Validates a Stellar memo
 * @param memo - Memo to validate
 * @returns boolean
 */
export declare const isValidMemo: (memo: string) => boolean;
/**
 * Converts network name to passphrase
 * @param network - Network name
 * @returns network passphrase
 */
export declare const getNetworkPassphrase: (network: "testnet" | "mainnet") => string;
/**
 * Gets Horizon server URL for network
 * @param network - Network name
 * @returns Horizon server URL
 */
export declare const getHorizonUrl: (network: "testnet" | "mainnet") => string;
/**
 * Validates if an amount is positive
 * @param amount - Amount to validate
 * @returns boolean
 */
export declare const isValidAmount: (amount: string | number) => boolean;
/**
 * Formats balance for display
 * @param balance - Balance amount
 * @param decimals - Number of decimal places
 * @returns formatted balance string
 */
export declare const formatBalance: (balance: string | number, decimals?: number) => string;
/**
 * Checks if two addresses are the same
 * @param address1 - First address
 * @param address2 - Second address
 * @returns boolean
 */
export declare const isSameAddress: (address1: string, address2: string) => boolean;
/**
 * Generates a transaction memo
 * @param text - Memo text
 * @returns memo object
 */
export declare const createMemo: (text: string) => {
    type: string;
    value: string;
};
/**
 * Calculates transaction fee based on operations
 * @param operationCount - Number of operations
 * @param baseFee - Base fee per operation
 * @returns total fee
 */
export declare const calculateFee: (operationCount: number, baseFee?: number) => number;
/**
 * Validates asset code format
 * @param assetCode - Asset code to validate
 * @returns boolean
 */
export declare const isValidAssetCode: (assetCode: string) => boolean;
/**
 * Validates a Stellar wallet memo.
 * @param memo - Memo to validate
 * @throws Error if memo is invalid
 */
export declare function validateMemo(memo: string): void;
//# sourceMappingURL=stellar-utils.d.ts.map