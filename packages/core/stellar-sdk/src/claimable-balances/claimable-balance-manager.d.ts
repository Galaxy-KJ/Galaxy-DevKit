/**
 * @fileoverview Claimable Balance Manager
 * @description Manages creation, claiming, and querying of claimable balances
 * @author Galaxy DevKit Team
 * @version 1.0.0
 * @since 2024-12-01
 */
import { Asset, Horizon } from '@stellar/stellar-sdk';
import { ClaimableBalance, CreateClaimableBalanceParams, ClaimBalanceParams, QueryClaimableBalancesParams, ClaimableBalanceResult } from './types.js';
import { Wallet } from '../types/stellar-types.js';
/**
 * Claimable Balance Manager class
 * @class ClaimableBalanceManager
 * @description Handles all claimable balance operations
 */
export declare class ClaimableBalanceManager {
    private server;
    private networkPassphrase;
    private networkUtils;
    constructor(server: Horizon.Server, networkPassphrase: string);
    /**
     * Creates a claimable balance
     * @param wallet - Source wallet
     * @param params - Create claimable balance parameters
     * @param password - Wallet password
     * @returns Promise<ClaimableBalanceResult>
     */
    createClaimableBalance(wallet: Wallet, params: CreateClaimableBalanceParams, password: string): Promise<ClaimableBalanceResult>;
    /**
     * Claims a claimable balance
     * @param wallet - Claimant wallet
     * @param params - Claim parameters
     * @param password - Wallet password
     * @returns Promise<ClaimableBalanceResult>
     */
    claimBalance(wallet: Wallet, params: ClaimBalanceParams, password: string): Promise<ClaimableBalanceResult>;
    /**
     * Gets claimable balance details by ID
     * @param balanceId - Balance ID
     * @returns Promise<ClaimableBalance>
     */
    getBalanceDetails(balanceId: string): Promise<ClaimableBalance>;
    /**
     * Queries claimable balances
     * @param params - Query parameters
     * @returns Promise<ClaimableBalance[]>
     */
    getClaimableBalances(params?: QueryClaimableBalancesParams): Promise<ClaimableBalance[]>;
    /**
     * Gets claimable balances for a specific account (as claimant)
     * @param publicKey - Account public key
     * @param limit - Number of results to return
     * @returns Promise<ClaimableBalance[]>
     */
    getClaimableBalancesForAccount(publicKey: string, limit?: number): Promise<ClaimableBalance[]>;
    /**
     * Gets claimable balances by asset
     * @param asset - Asset to filter by
     * @param limit - Number of results to return
     * @returns Promise<ClaimableBalance[]>
     */
    getClaimableBalancesByAsset(asset: Asset, limit?: number): Promise<ClaimableBalance[]>;
    /**
     * Validates create claimable balance parameters
     * @param params - Parameters to validate
     * @throws Error if invalid
     */
    private validateCreateParams;
    /**
     * Validates balance ID format
     * @param balanceId - Balance ID to validate
     * @returns boolean
     */
    private isValidBalanceId;
    /**
     * Extracts balance ID from transaction result
     * @param result - Transaction result
     * @returns Promise<Balance ID>
     */
    private extractBalanceId;
    /**
     * Maps Horizon API balance to our ClaimableBalance type
     * @param horizonBalance - Horizon API balance
     * @returns ClaimableBalance
     */
    private mapHorizonBalanceToClaimableBalance;
    /**
     * Maps Horizon predicate to our ClaimPredicate type
     * @param horizonPredicate - Horizon predicate
     * @returns ClaimPredicate
     */
    private mapHorizonPredicateToPredicate;
    /**
     * Estimates transaction fee
     * @returns Promise<string>
     */
    private estimateFee;
}
//# sourceMappingURL=claimable-balance-manager.d.ts.map