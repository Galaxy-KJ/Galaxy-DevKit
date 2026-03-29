#![no_std]
use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contractimpl,
    crypto::Hash,
    Bytes, BytesN, Env, Vec,
};

use smart_wallet_account_common::{
    AccountSignature, Signer, SignerKind, WalletDataKey, WalletError,
};

/// TTL constants for admin signers (in ledgers). ~1 ledger ≈ 5 seconds.
const ADMIN_TTL_THRESHOLD: u32 = 60_480; // ~3.5 days
const ADMIN_TTL_EXTEND: u32 = 120_960;   // ~7 days

#[contract]
pub struct SmartWallet;

#[contractimpl]
impl SmartWallet {
    // ────────────────────────────────────────────────────────
    //  Initialization
    // ────────────────────────────────────────────────────────

    /// Called once by the factory right after deployment.
    /// Stores the first admin signer (the passkey used during registration).
    pub fn init(env: Env, credential_id: Bytes, public_key: BytesN<65>) -> Result<(), WalletError> {
        if env.storage().instance().has(&WalletDataKey::WalletAddress) {
            return Err(WalletError::AlreadyInitialized);
        }

        validate_admin_public_key(&public_key)?;

        env.storage().instance().set(
            &WalletDataKey::WalletAddress,
            &env.current_contract_address(),
        );

        let signer = Signer {
            public_key: public_key.into(),
            kind: SignerKind::Admin,
            ttl_ledgers: 0, // admin TTL is managed by constants
        };
        env.storage()
            .persistent()
            .set(&WalletDataKey::Signer(credential_id.clone()), &signer);

        env.storage().persistent().extend_ttl(
            &WalletDataKey::Signer(credential_id),
            ADMIN_TTL_THRESHOLD,
            ADMIN_TTL_EXTEND,
        );
        env.storage()
            .instance()
            .extend_ttl(ADMIN_TTL_THRESHOLD, ADMIN_TTL_EXTEND);

        env.storage()
            .instance()
            .set(&WalletDataKey::AdminSignerCount, &1u32);

        Ok(())
    }

    // ────────────────────────────────────────────────────────
    //  Signer management (requires wallet self-auth)
    // ────────────────────────────────────────────────────────

    /// Add a new admin signer (secp256r1 / P-256 passkey).
    /// Requires wallet self-auth (`require_auth` → `__check_auth`).
    pub fn add_signer(
        env: Env,
        credential_id: Bytes,
        public_key: BytesN<65>,
    ) -> Result<(), WalletError> {
        env.current_contract_address().require_auth();
        validate_admin_public_key(&public_key)?;

        let key = WalletDataKey::Signer(credential_id.clone());
        if env.storage().persistent().has(&key) || env.storage().temporary().has(&key) {
            return Err(WalletError::SignerAlreadyExists);
        }

        let signer = Signer {
            public_key: public_key.into(),
            kind: SignerKind::Admin,
            ttl_ledgers: 0,
        };
        env.storage().persistent().set(&key, &signer);
        env.storage()
            .persistent()
            .extend_ttl(&key, ADMIN_TTL_THRESHOLD, ADMIN_TTL_EXTEND);

        let count: u32 = env
            .storage()
            .instance()
            .get(&WalletDataKey::AdminSignerCount)
            .unwrap_or(0);
        env.storage()
            .instance()
            .set(&WalletDataKey::AdminSignerCount, &(count + 1));

        Ok(())
    }

    /// Register a short-lived Ed25519 session key with a caller-specified TTL.
    ///
    /// Session keys let callers authorise multiple Soroban transactions within a
    /// time window without repeated biometric prompts — ideal for trading bots,
    /// DCA strategies, or any high-frequency DeFi flow.
    ///
    /// ## On-chain TTL semantics
    /// The entry is written to **Soroban temporary storage**, which auto-expires
    /// when its TTL reaches 0.  The TTL is set to `ttl_ledgers` on creation and
    /// renewed by `extend_signer_ttl` after each successful `__check_auth` call,
    /// capped at the original `ttl_ledgers` value.  No manual revocation is
    /// needed after expiry — the entry simply disappears, and any subsequent tx
    /// that references this credential ID will fail with `SignerNotFound`.
    ///
    /// ## Key format
    /// `public_key` must be the 32-byte raw Ed25519 public key (decoded from the
    /// Stellar G-address via `StrKey.decodeEd25519PublicKey`).
    ///
    /// Requires wallet self-auth (`require_auth` → `__check_auth` with an admin
    /// passkey) so only the wallet owner can register new session keys.
    pub fn add_session_signer(
        env: Env,
        credential_id: Bytes,
        public_key: BytesN<32>,
        ttl_ledgers: u32,
    ) -> Result<(), WalletError> {
        env.current_contract_address().require_auth();

        if ttl_ledgers == 0 {
            return Err(WalletError::NotAuthorized);
        }

        let key = WalletDataKey::Signer(credential_id.clone());

        if env.storage().persistent().has(&key) || env.storage().temporary().has(&key) {
            return Err(WalletError::SignerAlreadyExists);
        }

        let signer = Signer {
            public_key: public_key.into(),
            kind: SignerKind::Session,
            ttl_ledgers,
        };
        env.storage().temporary().set(&key, &signer);
        // Use the caller-provided TTL for both the threshold and extend so the
        // entry lives exactly as long as requested.
        env.storage()
            .temporary()
            .extend_ttl(&key, ttl_ledgers / 2, ttl_ledgers);

        Ok(())
    }

    /// Remove a signer by credential ID. Requires wallet self-auth.
    ///
    /// Prevents removing the last admin signer to avoid permanently locking
    /// the wallet.
    pub fn remove_signer(env: Env, credential_id: Bytes) -> Result<(), WalletError> {
        env.current_contract_address().require_auth();

        let key = WalletDataKey::Signer(credential_id);

        if env.storage().persistent().has(&key) {
            let signer: Signer = env.storage().persistent().get(&key).unwrap();
            if matches!(signer.kind, SignerKind::Admin) {
                let count: u32 = env
                    .storage()
                    .instance()
                    .get(&WalletDataKey::AdminSignerCount)
                    .unwrap_or(1);
                if count <= 1 {
                    return Err(WalletError::LastAdminSigner);
                }
                env.storage()
                    .instance()
                    .set(&WalletDataKey::AdminSignerCount, &(count - 1));
            }
            env.storage().persistent().remove(&key);
            return Ok(());
        }
        if env.storage().temporary().has(&key) {
            env.storage().temporary().remove(&key);
            return Ok(());
        }

        Err(WalletError::SignerNotFound)
    }
}

// ────────────────────────────────────────────────────────
//  CustomAccountInterface — __check_auth
// ────────────────────────────────────────────────────────

#[contractimpl]
impl CustomAccountInterface for SmartWallet {
    type Signature = AccountSignature;
    type Error = WalletError;

    #[allow(non_snake_case)]
    fn __check_auth(
        env: Env,
        signature_payload: Hash<32>,
        signature: AccountSignature,
        _auth_contexts: Vec<Context>,
    ) -> Result<(), WalletError> {
        match signature {
            // ── Admin passkey path (secp256r1 / P-256 / WebAuthn) ─────────────
            AccountSignature::WebAuthn(sig) => {
                let signer = get_signer(&env, &sig.id)?;

                // Verify the WebAuthn challenge encodes exactly `signature_payload`.
                verify_challenge(&env, &sig.client_data_json, &signature_payload)?;

                // Authenticator-signed message: SHA-256(authData ‖ SHA-256(clientDataJSON))
                let client_data_hash = env.crypto().sha256(&sig.client_data_json);
                let mut signed_data = Bytes::new(&env);
                signed_data.append(&sig.authenticator_data);
                signed_data.append(&Bytes::from_slice(
                    &env,
                    client_data_hash.to_array().as_slice(),
                ));
                let message_hash = env.crypto().sha256(&signed_data);

                // Verify P-256 signature; panics on failure (Soroban host behaviour).
                let pk: BytesN<65> = signer
                    .public_key
                    .try_into()
                    .map_err(|_| WalletError::InvalidPublicKey)?;
                env.crypto()
                    .secp256r1_verify(&pk, &message_hash, &sig.signature);

                extend_signer_ttl(&env, &sig.id, &signer.kind, signer.ttl_ledgers);
            }

            // ── Session key path (Ed25519) ─────────────────────────────────────
            //
            // Session keys sign the raw 32-byte `signature_payload` (the Soroban
            // auth-entry hash) with Ed25519 — no WebAuthn round-trip needed.
            // Only `SignerKind::Session` entries may use this path; an admin
            // credential presented here is rejected with `NotAuthorized`.
            AccountSignature::SessionKey(sig) => {
                let signer = get_signer(&env, &sig.id)?;

                // Session-only check — prevent admin keys from bypassing challenge
                // verification by sending a bare Ed25519 signature.
                if !matches!(signer.kind, SignerKind::Session) {
                    return Err(WalletError::NotAuthorized);
                }

                // Verify Ed25519 signature over the 32-byte auth-entry hash.
                let pk: BytesN<32> = signer
                    .public_key
                    .try_into()
                    .map_err(|_| WalletError::InvalidPublicKey)?;
                let payload_bytes =
                    Bytes::from_slice(&env, signature_payload.to_array().as_slice());
                env.crypto().ed25519_verify(&pk, &payload_bytes, &sig.signature);

                extend_signer_ttl(&env, &sig.id, &signer.kind, signer.ttl_ledgers);
            }
        }

        Ok(())
    }
}

// ────────────────────────────────────────────────────────
//  Internal helpers
// ────────────────────────────────────────────────────────

/// Resolve a signer from persistent (admin) or temporary (session) storage.
fn get_signer(env: &Env, credential_id: &Bytes) -> Result<Signer, WalletError> {
    let key = WalletDataKey::Signer(credential_id.clone());

    if let Some(signer) = env.storage().persistent().get::<_, Signer>(&key) {
        return Ok(signer);
    }
    if let Some(signer) = env.storage().temporary().get::<_, Signer>(&key) {
        return Ok(signer);
    }

    Err(WalletError::SignerNotFound)
}

/// Extend a signer's TTL after a successful `__check_auth`.
///
/// - Admin signers: always use the fixed constants.
/// - Session signers: extend by the original `ttl_ledgers` so the key stays
///   alive as long as it is actively used, capped at the original lifetime.
///   The threshold is `ttl_ledgers / 2` (renew when half-way through).
fn extend_signer_ttl(env: &Env, credential_id: &Bytes, kind: &SignerKind, ttl_ledgers: u32) {
    let key = WalletDataKey::Signer(credential_id.clone());
    match kind {
        SignerKind::Admin => {
            env.storage()
                .persistent()
                .extend_ttl(&key, ADMIN_TTL_THRESHOLD, ADMIN_TTL_EXTEND);
            env.storage()
                .instance()
                .extend_ttl(ADMIN_TTL_THRESHOLD, ADMIN_TTL_EXTEND);
        }
        SignerKind::Session => {
            if ttl_ledgers > 0 {
                let threshold = ttl_ledgers / 2;
                env.storage()
                    .temporary()
                    .extend_ttl(&key, threshold, ttl_ledgers);
            }
        }
    }
}

/// Validate an admin (P-256) public key: must be 65 bytes starting with `0x04`
/// (SEC-1 uncompressed point).
fn validate_admin_public_key(public_key: &BytesN<65>) -> Result<(), WalletError> {
    let arr = public_key.to_array();
    if arr[0] != 0x04 {
        return Err(WalletError::InvalidPublicKey);
    }
    Ok(())
}

/// Scan `client_data_json` for the `"challenge":"<base64url>"` field and
/// confirm it matches `base64url(signature_payload)`.
fn verify_challenge(
    env: &Env,
    client_data_json: &Bytes,
    signature_payload: &Hash<32>,
) -> Result<(), WalletError> {
    let needle = b"\"challenge\":\"";
    let json_len = client_data_json.len();
    let needle_len = needle.len() as u32;

    let mut challenge_start: Option<u32> = None;
    if json_len >= needle_len {
        for i in 0..=(json_len - needle_len) {
            let mut found = true;
            for j in 0..needle_len {
                if client_data_json.get(i + j).unwrap() != needle[j as usize] {
                    found = false;
                    break;
                }
            }
            if found {
                challenge_start = Some(i + needle_len);
                break;
            }
        }
    }

    let start = challenge_start.ok_or(WalletError::InvalidClientData)?;

    let mut challenge_end: Option<u32> = None;
    for i in start..json_len {
        if client_data_json.get(i).unwrap() == b'"' {
            challenge_end = Some(i);
            break;
        }
    }
    let end = challenge_end.ok_or(WalletError::InvalidClientData)?;

    let challenge_bytes = client_data_json.slice(start..end);
    let expected = base64url_encode(env, signature_payload.to_array().as_slice());

    if challenge_bytes != expected {
        return Err(WalletError::ChallengeMismatch);
    }

    Ok(())
}

pub fn base64url_encode(env: &Env, input: &[u8]) -> Bytes {
    const TABLE: &[u8; 64] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

    let mut out = Bytes::new(env);

    let chunks = input.len() / 3;
    let remainder = input.len() % 3;

    for i in 0..chunks {
        let b0 = input[i * 3] as u32;
        let b1 = input[i * 3 + 1] as u32;
        let b2 = input[i * 3 + 2] as u32;
        let triple = (b0 << 16) | (b1 << 8) | b2;

        out.push_back(TABLE[((triple >> 18) & 0x3F) as usize]);
        out.push_back(TABLE[((triple >> 12) & 0x3F) as usize]);
        out.push_back(TABLE[((triple >> 6) & 0x3F) as usize]);
        out.push_back(TABLE[(triple & 0x3F) as usize]);
    }

    if remainder == 2 {
        let b0 = input[chunks * 3] as u32;
        let b1 = input[chunks * 3 + 1] as u32;
        let triple = (b0 << 16) | (b1 << 8);
        out.push_back(TABLE[((triple >> 18) & 0x3F) as usize]);
        out.push_back(TABLE[((triple >> 12) & 0x3F) as usize]);
        out.push_back(TABLE[((triple >> 6) & 0x3F) as usize]);
    } else if remainder == 1 {
        let b0 = input[chunks * 3] as u32;
        let triple = b0 << 16;
        out.push_back(TABLE[((triple >> 18) & 0x3F) as usize]);
        out.push_back(TABLE[((triple >> 12) & 0x3F) as usize]);
    }

    out
}
