/**
 * @fileoverview Business logic for Stellar operations
 * @description Contains all Stellar-related business logic and API calls
 * @author Galaxy DevKit Team
 * @version 2.0.0
 * @since 2024-12-01
 */
import { Asset } from '@stellar/stellar-sdk';
import { Wallet, WalletConfig, NetworkConfig, AccountInfo, Balance, PaymentParams, PaymentResult, TransactionInfo } from '../types/stellar-types';
import type { CreateClaimableBalanceParams, ClaimBalanceParams, QueryClaimableBalancesParams, ClaimableBalanceResult, ClaimableBalance } from '../claimable-balances/types';
/**
 * Service class for Stellar operations
 * @class StellarService
 * @description Handles all Stellar-related business logic
 */
export declare class StellarService {
    private server;
    private networkConfig;
    private supabase;
    private networkUtils;
    private claimableBalanceManager;
    constructor(networkConfig: NetworkConfig);
    /**
     * Creates a new Stellar wallet
     * @param config - Wallet configuration
     * @returns Promise<Wallet>
     */
    createWallet(config: Partial<WalletConfig> | undefined, password: string): Promise<Wallet>;
    /**
     * Creates a wallet from a mnemonic phrase
     * @param mnemonic - BIP39 mnemonic phrase
     * @param config - Wallet configuration
     * @returns Promise<Wallet>
     */
    createWalletFromMnemonic(mnemonic: string, password: string, config?: Partial<WalletConfig>): Promise<Wallet>;
    /**
     * Generates a new BIP39 mnemonic phrase
     * @param strength - Entropy strength (128, 160, 192, 224, 256)
     * @returns string
     */
    generateMnemonic(strength?: number): string;
    /**
     * Gets account information from Stellar network
     * @param publicKey - Account public key
     * @returns Promise<AccountInfo>
     */
    getAccountInfo(publicKey: string): Promise<AccountInfo>;
    /**
     * Checks if an account exists and is funded on the network
     * @param publicKey - Account public key
     * @returns Promise<boolean>
     */
    isAccountFunded(publicKey: string): Promise<boolean>;
    /**
     * Gets account balance for a specific asset
     * @param publicKey - Account public key
     * @param asset - Asset code (XLM for native)
     * @returns Promise<Balance>
     */
    getBalance(publicKey: string, asset?: string): Promise<Balance>;
    /**
     * Sends a payment transaction
     * @param wallet - Source wallet
     * @param params - Payment parameters
     * @returns Promise<PaymentResult>
     */
    sendPayment(wallet: Wallet, params: PaymentParams, password: string): Promise<PaymentResult>;
    /**
     * Creates and funds a new account
     * @param sourceWallet - Source wallet with funds
     * @param destinationPublicKey - New account's public key
     * @param startingBalance - Starting balance for the new account
     * @returns Promise<PaymentResult>
     */
    createAccount(sourceWallet: Wallet, destinationPublicKey: string, startingBalance: string, password: string): Promise<PaymentResult>;
    /**
     * Gets transaction history for an account
     * @param publicKey - Account public key
     * @param limit - Number of transactions to retrieve
     * @returns Promise<TransactionInfo[]>
     */
    getTransactionHistory(publicKey: string, limit?: number): Promise<TransactionInfo[]>;
    /**
     * Gets transaction details by hash
     * @param transactionHash - Transaction hash
     * @returns Promise<TransactionInfo>
     */
    getTransaction(transactionHash: string): Promise<TransactionInfo>;
    addTrustline(wallet: Wallet, assetCode: string, assetIssuer: string, limit: string | undefined, // Max
    password: string): Promise<PaymentResult>;
    /**
     * Generates a unique wallet ID
     * @returns string
     */
    private generateWalletId;
    /**
     * Gets the current network configuration
     * @returns NetworkConfig
     */
    getNetworkConfig(): NetworkConfig;
    /**
     * Switches to a different network
     * @param networkConfig - New network configuration
     */
    switchNetwork(networkConfig: NetworkConfig): void;
    private submitTrxWithRetry;
    private isRetryableError;
    estimateFee(): Promise<string>;
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
    getClaimableBalance(balanceId: string): Promise<ClaimableBalance>;
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
     * Gets claimable balances by claimant
     * @param claimantPublicKey - Claimant public key
     * @param limit - Number of results to return
     * @returns Promise<ClaimableBalance[]>
     */
    getClaimableBalancesByClaimant(claimantPublicKey: string, limit?: number): Promise<ClaimableBalance[]>;
}
//# sourceMappingURL=stellar-service.d.ts.map