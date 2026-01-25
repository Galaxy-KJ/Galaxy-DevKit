"use strict";
/**
 * @fileoverview Business logic for Stellar operations
 * @description Contains all Stellar-related business logic and API calls
 * @author Galaxy DevKit Team
 * @version 2.0.0
 * @since 2024-12-01
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.StellarService = void 0;
const stellar_sdk_1 = require("@stellar/stellar-sdk");
const bip39 = __importStar(require("bip39"));
const encryption_utils_1 = require("../utils/encryption.utils");
const ed25519_hd_key_1 = require("ed25519-hd-key");
const supabase_client_1 = require("../utils/supabase-client");
const network_utils_1 = require("../utils/network-utils");
const stellar_utils_1 = require("../utils/stellar-utils");
const claimable_balance_manager_1 = require("../claimable-balances/claimable-balance-manager");
/**
 * Service class for Stellar operations
 * @class StellarService
 * @description Handles all Stellar-related business logic
 */
class StellarService {
    constructor(networkConfig) {
        this.supabase = supabase_client_1.supabaseClient;
        this.networkConfig = networkConfig;
        this.server = new stellar_sdk_1.Horizon.Server(networkConfig.horizonUrl);
        this.networkUtils = new network_utils_1.NetworkUtils();
        this.claimableBalanceManager = new claimable_balance_manager_1.ClaimableBalanceManager(this.server, this.networkConfig.passphrase);
    }
    /**
     * Creates a new Stellar wallet
     * @param config - Wallet configuration
     * @returns Promise<Wallet>
     */
    async createWallet(config = {}, password) {
        try {
            const keypair = stellar_sdk_1.Keypair.random();
            const encryptedPrivateKey = (0, encryption_utils_1.encryptPrivateKey)(keypair.secret(), password);
            const wallet = {
                id: this.generateWalletId(),
                publicKey: keypair.publicKey(),
                privateKey: encryptedPrivateKey,
                network: this.networkConfig,
                createdAt: new Date(),
                updatedAt: new Date(),
                metadata: config.metadata || {},
            };
            const { error } = await this.supabase.from('wallets').insert([wallet]);
            if (error) {
                throw new Error(`Failed to save wallet in Supabase: ${error.message}`);
            }
            return wallet;
        }
        catch (error) {
            throw new Error(`Failed to create wallet: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Creates a wallet from a mnemonic phrase
     * @param mnemonic - BIP39 mnemonic phrase
     * @param config - Wallet configuration
     * @returns Promise<Wallet>
     */
    async createWalletFromMnemonic(mnemonic, password, config = {}) {
        if (!mnemonic) {
            throw new Error('Plz enter Mnemonics');
        }
        if (!password) {
            throw new Error('Plz enter password');
        }
        try {
            if (!bip39.validateMnemonic(mnemonic)) {
                throw new Error('Invalid mnemonic phrase');
            }
            const seed = await bip39.mnemonicToSeed(mnemonic);
            const { key } = (0, ed25519_hd_key_1.derivePath)("m/44'/148'/0'", seed.toString('hex'));
            const keypair = stellar_sdk_1.Keypair.fromRawEd25519Seed(Buffer.from(key));
            const encryptedPrivateKey = (0, encryption_utils_1.encryptPrivateKey)(keypair.secret(), password);
            const wallet = {
                id: this.generateWalletId(),
                publicKey: keypair.publicKey(),
                privateKey: encryptedPrivateKey,
                network: this.networkConfig,
                createdAt: new Date(),
                updatedAt: new Date(),
                metadata: config.metadata || {},
            };
            const { error } = await this.supabase.from('wallets').insert([wallet]);
            if (error) {
                throw new Error(`Failed to save wallet in Supabase: ${error.message}`);
            }
            return wallet;
        }
        catch (error) {
            throw new Error(`Failed to create wallet from mnemonic: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Generates a new BIP39 mnemonic phrase
     * @param strength - Entropy strength (128, 160, 192, 224, 256)
     * @returns string
     */
    generateMnemonic(strength = 256) {
        return bip39.generateMnemonic(strength);
    }
    /**
     * Gets account information from Stellar network
     * @param publicKey - Account public key
     * @returns Promise<AccountInfo>
     */
    async getAccountInfo(publicKey) {
        try {
            if (!this.networkUtils.isValidPublicKey(publicKey)) {
                throw new Error('Invalid public key format');
            }
            const account = await this.server.loadAccount(publicKey);
            const balances = account.balances.map((balance) => {
                if (balance.asset_type === 'native') {
                    return {
                        asset: 'XLM',
                        balance: balance.balance,
                        limit: undefined,
                        buyingLiabilities: balance.buying_liabilities,
                        sellingLiabilities: balance.selling_liabilities,
                    };
                }
                else if (balance.asset_type === 'credit_alphanum4' ||
                    balance.asset_type === 'credit_alphanum12') {
                    return {
                        asset: balance.asset_code || 'UNKNOWN',
                        balance: balance.balance,
                        limit: balance.limit,
                        buyingLiabilities: balance.buying_liabilities,
                        sellingLiabilities: balance.selling_liabilities,
                    };
                }
                return {
                    asset: 'UNKNOWN',
                    balance: '0',
                    limit: undefined,
                    buyingLiabilities: undefined,
                    sellingLiabilities: undefined,
                };
            });
            const accountInfo = {
                accountId: account.accountId(),
                sequence: account.sequenceNumber(),
                balances,
                subentryCount: account.subentry_count.toString(),
                inflationDestination: account.inflation_destination,
                homeDomain: account.home_domain,
                data: account.data_attr,
            };
            return accountInfo;
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('404')) {
                throw new Error(`Account not found: ${publicKey}. The account may not be funded yet.`);
            }
            throw new Error(`Failed to get account info: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Checks if an account exists and is funded on the network
     * @param publicKey - Account public key
     * @returns Promise<boolean>
     */
    async isAccountFunded(publicKey) {
        try {
            await this.server.loadAccount(publicKey);
            return true;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Gets account balance for a specific asset
     * @param publicKey - Account public key
     * @param asset - Asset code (XLM for native)
     * @returns Promise<Balance>
     */
    async getBalance(publicKey, asset = 'XLM') {
        try {
            const accountInfo = await this.getAccountInfo(publicKey);
            const balance = accountInfo.balances.find(b => b.asset === asset);
            if (!balance) {
                throw new Error(`Asset ${asset} not found in account`);
            }
            return balance;
        }
        catch (error) {
            throw new Error(`Failed to get balance: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Sends a payment transaction
     * @param wallet - Source wallet
     * @param params - Payment parameters
     * @returns Promise<PaymentResult>
     */
    async sendPayment(wallet, params, password) {
        try {
            if (!this.networkUtils.isValidPublicKey(params.destination)) {
                throw new Error('Invalid destination address');
            }
            if (parseFloat(params.amount) <= 0) {
                throw new Error('Amount must be greater than 0');
            }
            if (params.asset !== 'XLM') {
                const destinationFunded = await this.isAccountFunded(params.destination);
                if (!destinationFunded) {
                    throw new Error('Destination account must be funded to receive custom assets');
                }
            }
            if (params.memo) {
                (0, stellar_utils_1.validateMemo)(params.memo);
            }
            const decrypted_private_key = (0, encryption_utils_1.decryptPrivateKey)(wallet.privateKey, password);
            const keypair = stellar_sdk_1.Keypair.fromSecret(decrypted_private_key);
            const sourceAccount = await this.server.loadAccount(wallet.publicKey);
            const asset = params.asset === 'XLM'
                ? stellar_sdk_1.Asset.native()
                : new stellar_sdk_1.Asset(params.asset, params.issuer);
            if (params.asset !== 'XLM' && !params.issuer) {
                throw new Error('Issuer is required for non-native assets');
            }
            const fee = await this.estimateFee();
            const transactionBuilder = new stellar_sdk_1.TransactionBuilder(sourceAccount, {
                fee: params.fee?.toString() || fee,
                networkPassphrase: this.networkConfig.passphrase,
            });
            transactionBuilder.addOperation(stellar_sdk_1.Operation.payment({
                destination: params.destination,
                asset: asset,
                amount: params.amount,
            }));
            if (params.memo) {
                transactionBuilder.addMemo(stellar_sdk_1.Memo.text(params.memo));
            }
            transactionBuilder.setTimeout(180);
            const transaction = transactionBuilder.build();
            transaction.sign(keypair);
            const result = await this.submitTrxWithRetry(transaction);
            const paymentResult = {
                hash: result.hash,
                status: result.successful ? 'success' : 'failed',
                ledger: result.ledger.toString(),
                createdAt: new Date(),
            };
            return paymentResult;
        }
        catch (error) {
            throw new Error(`Failed to send payment: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Creates and funds a new account
     * @param sourceWallet - Source wallet with funds
     * @param destinationPublicKey - New account's public key
     * @param startingBalance - Starting balance for the new account
     * @returns Promise<PaymentResult>
     */
    async createAccount(sourceWallet, destinationPublicKey, startingBalance, password) {
        try {
            if (!this.networkUtils.isValidPublicKey(destinationPublicKey)) {
                throw new Error('Invalid destination public key');
            }
            if (parseFloat(startingBalance) < 1) {
                throw new Error('Starting balance must be at least 1 XLM');
            }
            const decrypted_private_key = (0, encryption_utils_1.decryptPrivateKey)(sourceWallet.privateKey, password);
            const keypair = stellar_sdk_1.Keypair.fromSecret(decrypted_private_key);
            const sourceAccount = await this.server.loadAccount(sourceWallet.publicKey);
            const fee = await this.estimateFee();
            const transaction = new stellar_sdk_1.TransactionBuilder(sourceAccount, {
                fee,
                networkPassphrase: this.networkConfig.passphrase,
            })
                .addOperation(stellar_sdk_1.Operation.createAccount({
                destination: destinationPublicKey,
                startingBalance: startingBalance,
            }))
                .setTimeout(180)
                .build();
            transaction.sign(keypair);
            const result = await this.submitTrxWithRetry(transaction);
            return {
                hash: result.hash,
                status: result.successful ? 'success' : 'failed',
                ledger: result.ledger.toString(),
                createdAt: new Date(),
            };
        }
        catch (error) {
            throw new Error(`Failed to create account: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Gets transaction history for an account
     * @param publicKey - Account public key
     * @param limit - Number of transactions to retrieve
     * @returns Promise<TransactionInfo[]>
     */
    async getTransactionHistory(publicKey, limit = 10) {
        try {
            const transactions = await this.server
                .transactions()
                .forAccount(publicKey)
                .order('desc')
                .limit(limit)
                .call();
            const transactionHistory = await Promise.all(transactions.records.map(async (tx) => {
                try {
                    const operations = await this.server
                        .operations()
                        .forTransaction(tx.hash)
                        .call();
                    // Find payment or create_account operation
                    const paymentOp = operations.records.find((op) => op.type === 'payment' || op.type === 'create_account');
                    // Extract destination based on operation type
                    let destination = '';
                    if (paymentOp) {
                        if (paymentOp.type === 'payment') {
                            destination = paymentOp.to || paymentOp.destination || '';
                        }
                        else if (paymentOp.type === 'create_account') {
                            destination = paymentOp.account || '';
                        }
                    }
                    // Extract asset information
                    let asset = 'XLM';
                    if (paymentOp) {
                        if (paymentOp.asset_type === 'native') {
                            asset = 'XLM';
                        }
                        else if (paymentOp.asset_type === 'credit_alphanum4' ||
                            paymentOp.asset_type === 'credit_alphanum12') {
                            asset = paymentOp.asset_code || 'UNKNOWN';
                        }
                    }
                    // Extract amount
                    const amount = paymentOp?.amount || paymentOp?.starting_balance || '0';
                    return {
                        hash: tx.hash,
                        source: tx.source_account,
                        destination,
                        amount,
                        asset,
                        memo: tx.memo || '',
                        status: tx.successful ? 'success' : 'failed',
                        createdAt: new Date(tx.created_at),
                    };
                }
                catch (error) {
                    // If we can't fetch operations, return basic transaction info
                    console.warn(`Failed to fetch operations for transaction ${tx.hash}:`, error);
                    return {
                        hash: tx.hash,
                        source: tx.source_account,
                        destination: '',
                        amount: '0',
                        asset: 'XLM',
                        memo: tx.memo || '',
                        status: tx.successful ? 'success' : 'failed',
                        createdAt: new Date(tx.created_at),
                    };
                }
            }));
            return transactionHistory;
        }
        catch (error) {
            throw new Error(`Failed to get transaction history: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Gets transaction details by hash
     * @param transactionHash - Transaction hash
     * @returns Promise<TransactionInfo>
     */
    async getTransaction(transactionHash) {
        try {
            const tx = await this.server
                .transactions()
                .transaction(transactionHash)
                .call();
            const operations = await this.server
                .operations()
                .forTransaction(transactionHash)
                .call();
            // Find payment or create_account operation
            const paymentOp = operations.records.find((op) => op.type === 'payment' || op.type === 'create_account');
            // Extract destination based on operation type
            let destination = '';
            if (paymentOp) {
                if (paymentOp.type === 'payment') {
                    destination = paymentOp.to || paymentOp.destination || '';
                }
                else if (paymentOp.type === 'create_account') {
                    destination = paymentOp.account || '';
                }
            }
            // Extract asset information
            let asset = 'XLM';
            if (paymentOp) {
                if (paymentOp.asset_type === 'native') {
                    asset = 'XLM';
                }
                else if (paymentOp.asset_type === 'credit_alphanum4' ||
                    paymentOp.asset_type === 'credit_alphanum12') {
                    asset = paymentOp.asset_code || 'UNKNOWN';
                }
            }
            // Extract amount
            const amount = paymentOp?.amount || paymentOp?.starting_balance || '0';
            return {
                hash: tx.hash,
                source: tx.source_account,
                destination,
                amount,
                asset,
                memo: tx.memo || '',
                status: tx.successful ? 'success' : 'failed',
                createdAt: new Date(tx.created_at),
            };
        }
        catch (error) {
            throw new Error(`Failed to get transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async addTrustline(wallet, assetCode, assetIssuer, limit = '922337203685.4775807', // Max
    password) {
        const decrypted = (0, encryption_utils_1.decryptPrivateKey)(wallet.privateKey, password);
        const keypair = stellar_sdk_1.Keypair.fromSecret(decrypted);
        const sourceAccount = await this.server.loadAccount(wallet.publicKey);
        const transaction = new stellar_sdk_1.TransactionBuilder(sourceAccount, {
            fee: stellar_sdk_1.BASE_FEE,
            networkPassphrase: this.networkConfig.passphrase,
        })
            .addOperation(stellar_sdk_1.Operation.changeTrust({
            asset: new stellar_sdk_1.Asset(assetCode, assetIssuer),
            limit: limit,
        }))
            .setTimeout(180)
            .build();
        transaction.sign(keypair);
        const result = await this.server.submitTransaction(transaction);
        return {
            hash: result.hash,
            status: result.successful ? 'success' : 'failed',
            ledger: result.ledger.toString(),
            createdAt: new Date(),
        };
    }
    /**
     * Generates a unique wallet ID
     * @returns string
     */
    generateWalletId() {
        return `wallet_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    /**
     * Gets the current network configuration
     * @returns NetworkConfig
     */
    getNetworkConfig() {
        return this.networkConfig;
    }
    /**
     * Switches to a different network
     * @param networkConfig - New network configuration
     */
    switchNetwork(networkConfig) {
        this.networkConfig = networkConfig;
        this.server = new stellar_sdk_1.Horizon.Server(networkConfig.horizonUrl);
        this.claimableBalanceManager = new claimable_balance_manager_1.ClaimableBalanceManager(this.server, this.networkConfig.passphrase);
    }
    async submitTrxWithRetry(transaction, maxRetries = 3) {
        for (let i = 0; i < maxRetries; i++) {
            try {
                return await this.server.submitTransaction(transaction);
            }
            catch (error) {
                const isRetryable = this.isRetryableError(error);
                if (i === maxRetries - 1 || !isRetryable) {
                    throw error;
                }
                await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
            }
        }
    }
    isRetryableError(error) {
        // Retry on network errors, timeouts, or 5xx server errors
        if (!error)
            return false;
        const message = error.message || '';
        return (message.includes('timeout') ||
            message.includes('ECONNRESET') ||
            message.includes('ETIMEDOUT') ||
            error.response?.status >= 500);
    }
    async estimateFee() {
        try {
            const feeStats = await this.server.feeStats();
            return feeStats.max_fee.mode;
        }
        catch (error) {
            return stellar_sdk_1.BASE_FEE;
        }
    }
    /**
     * Creates a claimable balance
     * @param wallet - Source wallet
     * @param params - Create claimable balance parameters
     * @param password - Wallet password
     * @returns Promise<ClaimableBalanceResult>
     */
    async createClaimableBalance(wallet, params, password) {
        return this.claimableBalanceManager.createClaimableBalance(wallet, params, password);
    }
    /**
     * Claims a claimable balance
     * @param wallet - Claimant wallet
     * @param params - Claim parameters
     * @param password - Wallet password
     * @returns Promise<ClaimableBalanceResult>
     */
    async claimBalance(wallet, params, password) {
        return this.claimableBalanceManager.claimBalance(wallet, params, password);
    }
    /**
     * Gets claimable balance details by ID
     * @param balanceId - Balance ID
     * @returns Promise<ClaimableBalance>
     */
    async getClaimableBalance(balanceId) {
        return this.claimableBalanceManager.getBalanceDetails(balanceId);
    }
    /**
     * Queries claimable balances
     * @param params - Query parameters
     * @returns Promise<ClaimableBalance[]>
     */
    async getClaimableBalances(params = {}) {
        return this.claimableBalanceManager.getClaimableBalances(params);
    }
    /**
     * Gets claimable balances for a specific account (as claimant)
     * @param publicKey - Account public key
     * @param limit - Number of results to return
     * @returns Promise<ClaimableBalance[]>
     */
    async getClaimableBalancesForAccount(publicKey, limit = 10) {
        return this.claimableBalanceManager.getClaimableBalancesForAccount(publicKey, limit);
    }
    /**
     * Gets claimable balances by asset
     * @param asset - Asset to filter by
     * @param limit - Number of results to return
     * @returns Promise<ClaimableBalance[]>
     */
    async getClaimableBalancesByAsset(asset, limit = 10) {
        return this.claimableBalanceManager.getClaimableBalancesByAsset(asset, limit);
    }
    /**
     * Gets claimable balances by claimant
     * @param claimantPublicKey - Claimant public key
     * @param limit - Number of results to return
     * @returns Promise<ClaimableBalance[]>
     */
    async getClaimableBalancesByClaimant(claimantPublicKey, limit = 10) {
        return this.claimableBalanceManager.getClaimableBalances({
            claimant: claimantPublicKey,
            limit,
        });
    }
}
exports.StellarService = StellarService;
//# sourceMappingURL=stellar-service.js.map