"use strict";
/**
 * @fileoverview Utility functions for Stellar operations
 * @description Contains helper functions and utilities for Stellar operations
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidAssetCode = exports.calculateFee = exports.createMemo = exports.isSameAddress = exports.formatBalance = exports.isValidAmount = exports.getHorizonUrl = exports.getNetworkPassphrase = exports.isValidMemo = exports.formatAddress = exports.fromStroops = exports.toStroops = exports.generateKeypair = exports.isValidSecretKey = exports.isValidPublicKey = void 0;
exports.validateMemo = validateMemo;
const stellar_sdk_1 = require("@stellar/stellar-sdk");
/**
 * Validates a Stellar public key
 * @param publicKey - The public key to validate
 * @returns boolean
 */
const isValidPublicKey = (publicKey) => {
    try {
        stellar_sdk_1.Keypair.fromPublicKey(publicKey);
        return true;
    }
    catch {
        return false;
    }
};
exports.isValidPublicKey = isValidPublicKey;
/**
 * Validates a Stellar secret key
 * @param secretKey - The secret key to validate
 * @returns boolean
 */
const isValidSecretKey = (secretKey) => {
    try {
        stellar_sdk_1.Keypair.fromSecret(secretKey);
        return true;
    }
    catch {
        return false;
    }
};
exports.isValidSecretKey = isValidSecretKey;
/**
 * Generates a random Stellar keypair
 * @returns Object with publicKey and secretKey
 */
const generateKeypair = () => {
    const keypair = stellar_sdk_1.Keypair.random();
    return {
        publicKey: keypair.publicKey(),
        secretKey: keypair.secret(),
    };
};
exports.generateKeypair = generateKeypair;
/**
 * Converts Stellar amount to stroops (smallest unit)
 * @param amount - Amount in XLM
 * @returns number of stroops
 */
const toStroops = (amount) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return Math.floor(numAmount * 10000000); // 1 XLM = 10,000,000 stroops
};
exports.toStroops = toStroops;
/**
 * Converts stroops to XLM amount
 * @param stroops - Amount in stroops
 * @returns string representation of XLM amount
 */
const fromStroops = (stroops) => {
    return (stroops / 10000000).toFixed(7);
};
exports.fromStroops = fromStroops;
/**
 * Formats a Stellar address for display
 * @param address - Stellar address
 * @param startChars - Number of characters to show at start
 * @param endChars - Number of characters to show at end
 * @returns formatted address
 */
const formatAddress = (address, startChars = 4, endChars = 4) => {
    if (address.length <= startChars + endChars) {
        return address;
    }
    return `${address.slice(0, startChars)}...${address.slice(-endChars)}`;
};
exports.formatAddress = formatAddress;
/**
 * Validates a Stellar memo
 * @param memo - Memo to validate
 * @returns boolean
 */
const isValidMemo = (memo) => {
    return memo.length <= 28; // Stellar memo text limit
};
exports.isValidMemo = isValidMemo;
/**
 * Converts network name to passphrase
 * @param network - Network name
 * @returns network passphrase
 */
const getNetworkPassphrase = (network) => {
    return network === 'testnet'
        ? 'Test SDF Network ; September 2015'
        : 'Public Global Stellar Network ; September 2015';
};
exports.getNetworkPassphrase = getNetworkPassphrase;
/**
 * Gets Horizon server URL for network
 * @param network - Network name
 * @returns Horizon server URL
 */
const getHorizonUrl = (network) => {
    return network === 'testnet'
        ? 'https://horizon-testnet.stellar.org'
        : 'https://horizon.stellar.org';
};
exports.getHorizonUrl = getHorizonUrl;
/**
 * Validates if an amount is positive
 * @param amount - Amount to validate
 * @returns boolean
 */
const isValidAmount = (amount) => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    return !isNaN(numAmount) && numAmount > 0;
};
exports.isValidAmount = isValidAmount;
/**
 * Formats balance for display
 * @param balance - Balance amount
 * @param decimals - Number of decimal places
 * @returns formatted balance string
 */
const formatBalance = (balance, decimals = 7) => {
    const numBalance = typeof balance === 'string' ? parseFloat(balance) : balance;
    return numBalance.toFixed(decimals);
};
exports.formatBalance = formatBalance;
/**
 * Checks if two addresses are the same
 * @param address1 - First address
 * @param address2 - Second address
 * @returns boolean
 */
const isSameAddress = (address1, address2) => {
    return address1.toLowerCase() === address2.toLowerCase();
};
exports.isSameAddress = isSameAddress;
/**
 * Generates a transaction memo
 * @param text - Memo text
 * @returns memo object
 */
const createMemo = (text) => {
    if (!(0, exports.isValidMemo)(text)) {
        throw new Error('Memo text is too long (max 28 characters)');
    }
    return { type: 'text', value: text };
};
exports.createMemo = createMemo;
/**
 * Calculates transaction fee based on operations
 * @param operationCount - Number of operations
 * @param baseFee - Base fee per operation
 * @returns total fee
 */
const calculateFee = (operationCount, baseFee = 100) => {
    return operationCount * baseFee;
};
exports.calculateFee = calculateFee;
/**
 * Validates asset code format
 * @param assetCode - Asset code to validate
 * @returns boolean
 */
const isValidAssetCode = (assetCode) => {
    // Asset codes must be 1-12 characters, alphanumeric
    return /^[A-Z0-9]{1,12}$/.test(assetCode);
};
exports.isValidAssetCode = isValidAssetCode;
/**
 * Validates a Stellar wallet memo.
 * @param memo - Memo to validate
 * @throws Error if memo is invalid
 */
function validateMemo(memo) {
    if (!memo || typeof memo !== 'string') {
        throw new Error('Memo must be a non-empty string');
    }
    // Reject control characters
    if (/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/.test(memo)) {
        throw new Error('Memo contains invalid control characters');
    }
    // Validate allowed memo format (alphanumeric, spaces, hyphens, underscores, and dots)
    if (!/^[a-zA-Z0-9 _.\-]*$/.test(memo)) {
        throw new Error('Invalid Stellar memo format');
    }
    // Check memo byte length (Stellar limit = 28 bytes)
    const memoBytes = new TextEncoder().encode(memo).length;
    if (memoBytes > 28) {
        throw new Error('Memo exceeds maximum length of 28 bytes');
    }
}
//# sourceMappingURL=stellar-utils.js.map