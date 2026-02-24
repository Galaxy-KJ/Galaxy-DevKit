// @ts-nocheck
/** Pre-configured USDC issuers per network */
export const USDC_CONFIG = {
    testnet: {
        code: 'USDC',
        issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
    },
    mainnet: {
        code: 'USDC',
        issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    },
};
export var PasswordStrength;
(function (PasswordStrength) {
    PasswordStrength["WEAK"] = "weak";
    PasswordStrength["MEDIUM"] = "medium";
    PasswordStrength["STRONG"] = "strong";
    PasswordStrength["VERY_STRONG"] = "very_strong";
})(PasswordStrength || (PasswordStrength = {}));
export var WalletStatus;
(function (WalletStatus) {
    WalletStatus["ACTIVE"] = "active";
    WalletStatus["LOCKED"] = "locked";
    WalletStatus["SUSPENDED"] = "suspended";
    WalletStatus["ARCHIVED"] = "archived";
})(WalletStatus || (WalletStatus = {}));
export var AuthMethod;
(function (AuthMethod) {
    AuthMethod["PASSWORD"] = "password";
    AuthMethod["BIOMETRIC"] = "biometric";
    AuthMethod["PIN"] = "pin";
    AuthMethod["PASSKEY"] = "passkey";
})(AuthMethod || (AuthMethod = {}));
export var WalletEventType;
(function (WalletEventType) {
    WalletEventType["CREATED"] = "created";
    WalletEventType["UNLOCKED"] = "unlocked";
    WalletEventType["LOCKED"] = "locked";
    WalletEventType["TRANSACTION_SENT"] = "transaction_sent";
    WalletEventType["TRUSTLINE_ADDED"] = "trustline_added";
    WalletEventType["SWAP_EXECUTED"] = "swap_executed";
    WalletEventType["TRANSACTION_SIGNED"] = "transaction_signed";
    WalletEventType["BACKUP_CREATED"] = "backup_created";
    WalletEventType["PASSWORD_CHANGED"] = "password_changed";
    WalletEventType["RECOVERY_INITIATED"] = "recovery_initiated";
})(WalletEventType || (WalletEventType = {}));
//# sourceMappingURL=wallet.types.js.map