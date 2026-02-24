/**
 * @fileoverview Type definitions for Invisible Wallet System
 * @description Contains all interfaces and types for invisible wallet functionality
 * @author @ryzen_xp
 * @version 1.0.0
 * @since 2024-12-01
 */
import { NetworkConfig } from '../../../stellar-sdk/src/types/stellar-types.js';
/**
 * Configuration for a supported asset (e.g., USDC)
 */
export interface AssetConfig {
    code: string;
    issuer: string;
    /** Automatically add trustline on wallet creation */
    autoTrustline?: boolean;
    /** Amount of XLM to swap into this asset on setup (e.g., '10') */
    initialSwapAmount?: string;
}
/** Pre-configured USDC issuers per network */
export declare const USDC_CONFIG: {
    readonly testnet: {
        readonly code: "USDC";
        readonly issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
    };
    readonly mainnet: {
        readonly code: "USDC";
        readonly issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
    };
};
export interface InvisibleWalletConfig {
    userId: string;
    email?: string;
    network: NetworkConfig;
    autoBackup?: boolean;
    sessionTimeout?: number;
    biometricEnabled?: boolean;
    /** Assets to enable on wallet creation (trustlines + optional initial swap) */
    enabledAssets?: AssetConfig[];
}
export interface InvisibleWallet {
    id: string;
    userId: string;
    publicKey: string;
    encryptedPrivateKey: string;
    encryptedSeed?: string;
    network: NetworkConfig;
    createdAt: Date;
    updatedAt: Date;
    lastAccessedAt?: Date;
    metadata: Record<string, unknown>;
    backupStatus: BackupStatus;
}
export interface BackupStatus {
    isBackedUp: boolean;
    lastBackupAt?: Date;
    backupMethod?: 'cloud' | 'local' | 'none';
    backupLocation?: string;
}
export interface WalletSession {
    walletId: string;
    userId: string;
    sessionToken: string;
    expiresAt: Date;
    createdAt: Date;
    isActive: boolean;
    deviceInfo?: DeviceInfo;
}
export interface DeviceInfo {
    deviceId?: string;
    deviceName?: string;
    platform?: string;
    browser?: string;
    ipAddress?: string;
}
export interface KeyDerivationParams {
    iterations: number;
    keyLength: number;
    digest: string;
    salt?: Buffer;
}
export interface EncryptedData {
    ciphertext: string;
    iv: string;
    salt: string;
    authTag: string;
    algorithm: string;
}
export interface WalletRecoveryOptions {
    email?: string;
    phoneNumber?: string;
    securityQuestions?: SecurityQuestion[];
    recoveryPhrase?: string;
}
export interface SecurityQuestion {
    question: string;
    answerHash: string;
}
export interface WalletCreationResult {
    wallet: InvisibleWallet;
    session: WalletSession;
    backupRecommendation: string;
}
export interface WalletUnlockResult {
    success: boolean;
    session?: WalletSession;
    error?: string;
}
export interface WalletOperationResult {
    success: boolean;
    data?: any;
    error?: string;
    timestamp: Date;
}
export declare enum PasswordStrength {
    WEAK = "weak",
    MEDIUM = "medium",
    STRONG = "strong",
    VERY_STRONG = "very_strong"
}
export declare enum WalletStatus {
    ACTIVE = "active",
    LOCKED = "locked",
    SUSPENDED = "suspended",
    ARCHIVED = "archived"
}
export declare enum AuthMethod {
    PASSWORD = "password",
    BIOMETRIC = "biometric",
    PIN = "pin",
    PASSKEY = "passkey"
}
export declare enum WalletEventType {
    CREATED = "created",
    UNLOCKED = "unlocked",
    LOCKED = "locked",
    TRANSACTION_SENT = "transaction_sent",
    TRUSTLINE_ADDED = "trustline_added",
    SWAP_EXECUTED = "swap_executed",
    TRANSACTION_SIGNED = "transaction_signed",
    BACKUP_CREATED = "backup_created",
    PASSWORD_CHANGED = "password_changed",
    RECOVERY_INITIATED = "recovery_initiated"
}
/**
 * Parameters for adding a trustline to an invisible wallet
 */
export interface TrustlineParams {
    assetCode: string;
    assetIssuer: string;
    limit?: string;
}
/**
 * Parameters for executing a swap from an invisible wallet
 */
export interface InvisibleSwapParams {
    sendAssetCode: string;
    sendAssetIssuer?: string;
    destAssetCode: string;
    destAssetIssuer?: string;
    amount: string;
    type: 'strict_send' | 'strict_receive';
    maxSlippage?: number;
}
/**
 * Result of a swap execution from the invisible wallet
 */
export interface InvisibleSwapResult {
    inputAmount: string;
    outputAmount: string;
    price: string;
    priceImpact: string;
    transactionHash: string;
    highImpactWarning?: boolean;
}
/**
 * Result of signing an external transaction
 */
export interface SignTransactionResult {
    signedXdr: string;
    hash: string;
}
/**
 * Result of setting up a wallet with USDC support
 */
export interface SetupWithUsdcResult {
    wallet: WalletCreationResult;
    trustlineHash: string;
    swap?: InvisibleSwapResult;
}
export interface WalletEvent {
    id: string;
    walletId: string;
    userId: string;
    eventType: WalletEventType;
    timestamp: Date;
    metadata?: Record<string, unknown>;
}
//# sourceMappingURL=wallet.types.d.ts.map