"use strict";
/**
 * @fileoverview Claimable Balance Manager
 * @description Manages creation, claiming, and querying of claimable balances
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaimableBalanceManager = void 0;
const stellar_sdk_1 = require("@stellar/stellar-sdk");
const predicate_builder_1 = require("./predicate-builder");
const encryption_utils_1 = require("../utils/encryption.utils");
const network_utils_1 = require("../utils/network-utils");
/**
 * Claimable Balance Manager class
 * @class ClaimableBalanceManager
 * @description Handles all claimable balance operations
 */
class ClaimableBalanceManager {
    constructor(server, networkPassphrase) {
        this.server = server;
        this.networkPassphrase = networkPassphrase;
        this.networkUtils = new network_utils_1.NetworkUtils();
    }
    /**
     * Creates a claimable balance
     * @param wallet - Source wallet
     * @param params - Create claimable balance parameters
     * @param password - Wallet password
     * @returns Promise<ClaimableBalanceResult>
     */
    async createClaimableBalance(wallet, params, password) {
        try {
            // Validate parameters
            this.validateCreateParams(params);
            // Decrypt private key
            const decryptedPrivateKey = (0, encryption_utils_1.decryptPrivateKey)(wallet.privateKey, password);
            const keypair = stellar_sdk_1.Keypair.fromSecret(decryptedPrivateKey);
            // Load source account
            const sourceAccount = await this.server.loadAccount(wallet.publicKey);
            // Build claimants with Stellar predicates
            const stellarClaimants = params.claimants.map((claimant) => ({
                destination: claimant.destination,
                predicate: (0, predicate_builder_1.toStellarPredicate)(claimant.predicate),
            }));
            // Estimate fee
            const fee = params.fee || (await this.estimateFee());
            // Build transaction
            const transactionBuilder = new stellar_sdk_1.TransactionBuilder(sourceAccount, {
                fee: fee.toString(),
                networkPassphrase: this.networkPassphrase,
            });
            // Add create claimable balance operation
            transactionBuilder.addOperation(stellar_sdk_1.Operation.createClaimableBalance({
                asset: params.asset,
                amount: params.amount,
                claimants: stellarClaimants,
            }));
            // Add memo if provided
            if (params.memo) {
                transactionBuilder.addMemo(stellar_sdk_1.Memo.text(params.memo));
            }
            transactionBuilder.setTimeout(180);
            // Sign and submit transaction
            const transaction = transactionBuilder.build();
            transaction.sign(keypair);
            const result = await this.server.submitTransaction(transaction);
            // Extract balance ID from transaction result
            const balanceId = await this.extractBalanceId(result);
            return {
                balanceId,
                hash: result.hash,
                status: result.successful ? 'success' : 'failed',
                ledger: result.ledger.toString(),
                createdAt: new Date(),
            };
        }
        catch (error) {
            throw new Error(`Failed to create claimable balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Claims a claimable balance
     * @param wallet - Claimant wallet
     * @param params - Claim parameters
     * @param password - Wallet password
     * @returns Promise<ClaimableBalanceResult>
     */
    async claimBalance(wallet, params, password) {
        try {
            if (!this.isValidBalanceId(params.balanceId)) {
                throw new Error('Invalid balance ID format');
            }
            // Decrypt private key
            const decryptedPrivateKey = (0, encryption_utils_1.decryptPrivateKey)(wallet.privateKey, password);
            const keypair = stellar_sdk_1.Keypair.fromSecret(decryptedPrivateKey);
            // Load account
            const account = await this.server.loadAccount(wallet.publicKey);
            // Estimate fee
            const fee = params.fee || (await this.estimateFee());
            // Build transaction
            const transactionBuilder = new stellar_sdk_1.TransactionBuilder(account, {
                fee: fee.toString(),
                networkPassphrase: this.networkPassphrase,
            });
            // Add claim operation
            transactionBuilder.addOperation(stellar_sdk_1.Operation.claimClaimableBalance({
                balanceId: params.balanceId,
            }));
            // Add memo if provided
            if (params.memo) {
                transactionBuilder.addMemo(stellar_sdk_1.Memo.text(params.memo));
            }
            transactionBuilder.setTimeout(180);
            // Sign and submit transaction
            const transaction = transactionBuilder.build();
            transaction.sign(keypair);
            const result = await this.server.submitTransaction(transaction);
            return {
                balanceId: params.balanceId,
                hash: result.hash,
                status: result.successful ? 'success' : 'failed',
                ledger: result.ledger.toString(),
                createdAt: new Date(),
            };
        }
        catch (error) {
            throw new Error(`Failed to claim balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Gets claimable balance details by ID
     * @param balanceId - Balance ID
     * @returns Promise<ClaimableBalance>
     */
    async getBalanceDetails(balanceId) {
        try {
            if (!this.isValidBalanceId(balanceId)) {
                throw new Error('Invalid balance ID format');
            }
            const balance = await this.server
                .claimableBalances()
                .claimableBalance(balanceId)
                .call();
            return this.mapHorizonBalanceToClaimableBalance(balance);
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('404')) {
                throw new Error(`Claimable balance not found: ${balanceId}`);
            }
            throw new Error(`Failed to get balance details: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Queries claimable balances
     * @param params - Query parameters
     * @returns Promise<ClaimableBalance[]>
     */
    async getClaimableBalances(params = {}) {
        try {
            let callBuilder = this.server.claimableBalances();
            // Filter by claimant
            if (params.claimant) {
                if (!this.networkUtils.isValidPublicKey(params.claimant)) {
                    throw new Error('Invalid claimant public key');
                }
                callBuilder = callBuilder.claimant(params.claimant);
            }
            // Filter by asset
            if (params.asset) {
                callBuilder = callBuilder.asset(params.asset);
            }
            // Filter by sponsor
            if (params.sponsor) {
                if (!this.networkUtils.isValidPublicKey(params.sponsor)) {
                    throw new Error('Invalid sponsor public key');
                }
                callBuilder = callBuilder.sponsor(params.sponsor);
            }
            // Set limit
            if (params.limit) {
                callBuilder = callBuilder.limit(params.limit);
            }
            // Set cursor for pagination
            if (params.cursor) {
                callBuilder = callBuilder.cursor(params.cursor);
            }
            const response = await callBuilder.call();
            return response.records.map((balance) => this.mapHorizonBalanceToClaimableBalance(balance));
        }
        catch (error) {
            throw new Error(`Failed to query claimable balances: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Gets claimable balances for a specific account (as claimant)
     * @param publicKey - Account public key
     * @param limit - Number of results to return
     * @returns Promise<ClaimableBalance[]>
     */
    async getClaimableBalancesForAccount(publicKey, limit = 10) {
        if (!this.networkUtils.isValidPublicKey(publicKey)) {
            throw new Error('Invalid public key format');
        }
        return this.getClaimableBalances({
            claimant: publicKey,
            limit,
        });
    }
    /**
     * Gets claimable balances by asset
     * @param asset - Asset to filter by
     * @param limit - Number of results to return
     * @returns Promise<ClaimableBalance[]>
     */
    async getClaimableBalancesByAsset(asset, limit = 10) {
        return this.getClaimableBalances({
            asset,
            limit,
        });
    }
    /**
     * Validates create claimable balance parameters
     * @param params - Parameters to validate
     * @throws Error if invalid
     */
    validateCreateParams(params) {
        if (!params.asset) {
            throw new Error('Asset is required');
        }
        if (!params.amount || parseFloat(params.amount) <= 0) {
            throw new Error('Amount must be greater than 0');
        }
        if (!params.claimants || params.claimants.length === 0) {
            throw new Error('At least one claimant is required');
        }
        // Validate each claimant
        params.claimants.forEach((claimant, index) => {
            if (!this.networkUtils.isValidPublicKey(claimant.destination)) {
                throw new Error(`Invalid claimant destination at index ${index}`);
            }
            try {
                (0, predicate_builder_1.validatePredicate)(claimant.predicate);
            }
            catch (error) {
                throw new Error(`Invalid predicate for claimant at index ${index}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        });
    }
    /**
     * Validates balance ID format
     * @param balanceId - Balance ID to validate
     * @returns boolean
     */
    isValidBalanceId(balanceId) {
        // Balance ID is a 64-character hex string
        return /^[0-9a-f]{64}$/i.test(balanceId);
    }
    /**
     * Extracts balance ID from transaction result
     * @param result - Transaction result
     * @returns Promise<Balance ID>
     */
    async extractBalanceId(result) {
        try {
            // Query operations for this transaction to get the balance ID
            const operations = await this.server
                .operations()
                .forTransaction(result.hash)
                .call();
            // Find the createClaimableBalance operation
            const createOp = operations.records.find((op) => op.type === 'create_claimable_balance');
            if (createOp && createOp.balance_id) {
                return createOp.balance_id;
            }
            // If balance_id is not directly available, it might be in the response
            if (result.balance_id) {
                return result.balance_id;
            }
            throw new Error('Could not extract balance ID from transaction result. Please query the operation to get the balance ID.');
        }
        catch (error) {
            throw new Error(`Failed to extract balance ID: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Maps Horizon API balance to our ClaimableBalance type
     * @param horizonBalance - Horizon API balance
     * @returns ClaimableBalance
     */
    mapHorizonBalanceToClaimableBalance(horizonBalance) {
        const asset = horizonBalance.asset_type === 'native'
            ? stellar_sdk_1.Asset.native()
            : new stellar_sdk_1.Asset(horizonBalance.asset_code, horizonBalance.asset_issuer);
        const claimants = horizonBalance.claimants.map((c) => ({
            destination: c.destination,
            predicate: this.mapHorizonPredicateToPredicate(c.predicate),
        }));
        return {
            id: horizonBalance.id,
            asset,
            amount: horizonBalance.amount,
            sponsor: horizonBalance.sponsor,
            claimants,
            lastModified: horizonBalance.last_modified_time,
            lastModifiedLedger: parseInt(horizonBalance.last_modified_ledger, 10),
        };
    }
    /**
     * Maps Horizon predicate to our ClaimPredicate type
     * @param horizonPredicate - Horizon predicate
     * @returns ClaimPredicate
     */
    mapHorizonPredicateToPredicate(horizonPredicate) {
        if (horizonPredicate.unconditional) {
            return { unconditional: true };
        }
        if (horizonPredicate.not) {
            return { not: this.mapHorizonPredicateToPredicate(horizonPredicate.not) };
        }
        if (horizonPredicate.and) {
            return {
                and: horizonPredicate.and.map((p) => this.mapHorizonPredicateToPredicate(p)),
            };
        }
        if (horizonPredicate.or) {
            return {
                or: horizonPredicate.or.map((p) => this.mapHorizonPredicateToPredicate(p)),
            };
        }
        if (horizonPredicate.abs_before) {
            const timestamp = new Date(parseInt(horizonPredicate.abs_before, 10) * 1000);
            return { abs_before: timestamp.toISOString() };
        }
        if (horizonPredicate.rel_before) {
            return { rel_before: horizonPredicate.rel_before };
        }
        return { unconditional: true }; // Default fallback
    }
    /**
     * Estimates transaction fee
     * @returns Promise<string>
     */
    async estimateFee() {
        try {
            const feeStats = await this.server.feeStats();
            return feeStats.max_fee.mode;
        }
        catch (error) {
            return stellar_sdk_1.BASE_FEE;
        }
    }
}
exports.ClaimableBalanceManager = ClaimableBalanceManager;
//# sourceMappingURL=claimable-balance-manager.js.map