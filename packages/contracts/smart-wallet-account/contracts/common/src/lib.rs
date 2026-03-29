#![no_std]
use soroban_sdk::{contracterror, contracttype, Bytes, BytesN};

// ─── WebAuthn (passkey) signature ────────────────────────────────────────────

/// Payload produced by a WebAuthn authenticator (P-256 / secp256r1).
#[contracttype]
#[derive(Clone, Debug)]
pub struct Signature {
    pub authenticator_data: Bytes,
    pub client_data_json: Bytes,
    /// Base64url-decoded credential ID that identifies the passkey.
    pub id: Bytes,
    /// 64-byte compact ECDSA signature (R ‖ S, big-endian).
    pub signature: BytesN<64>,
}

// ─── Session-key (Ed25519) signature ─────────────────────────────────────────

/// Payload produced by an in-memory Ed25519 session key registered via
/// `add_session_signer`.  No WebAuthn round-trip is required for each tx;
/// the biometric happened once at session-creation time.
#[contracttype]
#[derive(Clone, Debug)]
pub struct SessionSig {
    /// Credential ID of the session key (matches the key stored by `add_session_signer`).
    pub id: Bytes,
    /// 64-byte Ed25519 signature over the 32-byte Soroban auth-entry hash
    /// (`signature_payload` in `__check_auth`).
    pub signature: BytesN<64>,
}

// ─── Discriminated union ──────────────────────────────────────────────────────

/// Top-level signature type for the smart-wallet `__check_auth`.
///
/// The wallet supports two signer kinds:
/// - `WebAuthn`   — admin passkey (secp256r1 / P-256).  Requires a biometric
///                  prompt for every signed transaction.
/// - `SessionKey` — short-lived Ed25519 key registered on-chain via
///                  `add_session_signer`.  Allows many transactions within a
///                  time window without repeated biometric prompts.
#[contracttype]
#[derive(Clone, Debug)]
pub enum AccountSignature {
    WebAuthn(Signature),
    SessionKey(SessionSig),
}

// ─── Signer kinds ─────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug)]
pub enum SignerKind {
    Admin,
    Session,
}

// ─── Stored signer ────────────────────────────────────────────────────────────

/// A signer entry stored in the wallet's contract storage.
///
/// `public_key` is variable-length `Bytes` to accommodate both key types:
/// - Admin  (`SignerKind::Admin`)   → 65 bytes (SEC-1 uncompressed P-256: `0x04 ‖ X ‖ Y`).
/// - Session (`SignerKind::Session`) → 32 bytes (raw Ed25519 public key).
///
/// `ttl_ledgers` is the session lifetime originally requested via
/// `add_session_signer`.  It is stored so that `extend_signer_ttl` can
/// accurately renew the TTL on each successful auth without over-extending.
/// Admin signers set this to `0` (sentinel — TTL is managed by constants).
#[contracttype]
#[derive(Clone, Debug)]
pub struct Signer {
    pub public_key: Bytes,
    pub kind: SignerKind,
    /// Session TTL in ledgers (0 for admin signers).
    pub ttl_ledgers: u32,
}

// ─── Storage keys ─────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug)]
pub enum WalletDataKey {
    Signer(Bytes),
    WalletAddress,
    AdminSignerCount,
}

#[contracttype]
#[derive(Clone, Debug)]
pub enum FactoryDataKey {
    WalletWasmHash,
    Deployed(Bytes),
}

// ─── Errors ───────────────────────────────────────────────────────────────────

#[contracterror]
#[derive(Clone, Debug, Copy, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum WalletError {
    SignerNotFound = 1,
    SignerAlreadyExists = 2,
    LastAdminSigner = 3,
    ChallengeMismatch = 4,
    AlreadyInitialized = 5,
    NotAuthorized = 6,
    InvalidPublicKey = 7,
    InvalidClientData = 8,
}
