use soroban_sdk::{
    auth::{Context, CustomAccountInterface},
    contract, contractimpl,
    crypto::Hash,
    Bytes, BytesN, Env, Vec,
};

use crate::types::{Signature, Signer, SignerKind, WalletDataKey, WalletError};

/// TTL constants (in ledgers). ~1 ledger ≈ 5 seconds on mainnet.
const ADMIN_TTL_THRESHOLD: u32 = 60_480; // ~3.5 days
const ADMIN_TTL_EXTEND: u32 = 120_960; // ~7 days
const SESSION_TTL_THRESHOLD: u32 = 8_640; // ~12 hours
const SESSION_TTL_EXTEND: u32 = 17_280; // ~1 day

#[contract]
pub struct SmartWallet;

#[contractimpl]
impl SmartWallet {
    // ────────────────────────────────────────────────────────
    //  Initialization
    // ────────────────────────────────────────────────────────

    /// Called once by the factory right after deployment.
    /// Stores the first admin signer (the passkey used during registration).
    pub fn init(
        env: Env,
        credential_id: Bytes,
        public_key: BytesN<65>,
    ) -> Result<(), WalletError> {
        // Guard against re-init.
        if env
            .storage()
            .instance()
            .has(&WalletDataKey::WalletAddress)
        {
            return Err(WalletError::AlreadyInitialized);
        }

        // Validate uncompressed key prefix.
        validate_public_key(&public_key)?;

        // Store wallet's own address for self-auth checks.
        env.storage()
            .instance()
            .set(&WalletDataKey::WalletAddress, &env.current_contract_address());

        // Persist the first admin signer.
        let signer = Signer {
            public_key,
            kind: SignerKind::Admin,
        };
        env.storage()
            .persistent()
            .set(&WalletDataKey::Signer(credential_id.clone()), &signer);

        // Extend TTLs.
        env.storage().persistent().extend_ttl(
            &WalletDataKey::Signer(credential_id),
            ADMIN_TTL_THRESHOLD,
            ADMIN_TTL_EXTEND,
        );
        env.storage()
            .instance()
            .extend_ttl(ADMIN_TTL_THRESHOLD, ADMIN_TTL_EXTEND);

        Ok(())
    }

    // ────────────────────────────────────────────────────────
    //  Signer management (requires wallet self-auth)
    // ────────────────────────────────────────────────────────

    /// Add a new admin signer. Must be called via `require_auth` on the
    /// wallet address itself (which invokes `__check_auth` under the hood).
    pub fn add_signer(
        env: Env,
        credential_id: Bytes,
        public_key: BytesN<65>,
    ) -> Result<(), WalletError> {
        env.current_contract_address().require_auth();
        validate_public_key(&public_key)?;

        let key = WalletDataKey::Signer(credential_id.clone());
        if env.storage().persistent().has(&key) {
            return Err(WalletError::SignerAlreadyExists);
        }

        let signer = Signer {
            public_key,
            kind: SignerKind::Admin,
        };
        env.storage().persistent().set(&key, &signer);
        env.storage()
            .persistent()
            .extend_ttl(&key, ADMIN_TTL_THRESHOLD, ADMIN_TTL_EXTEND);

        Ok(())
    }

    /// Add a session (temporary) signer with short TTL. Requires wallet self-auth.
    pub fn add_session_signer(
        env: Env,
        credential_id: Bytes,
        public_key: BytesN<65>,
    ) -> Result<(), WalletError> {
        env.current_contract_address().require_auth();
        validate_public_key(&public_key)?;

        let key = WalletDataKey::Signer(credential_id.clone());

        // Check both storages to prevent duplicates.
        if env.storage().persistent().has(&key) || env.storage().temporary().has(&key) {
            return Err(WalletError::SignerAlreadyExists);
        }

        let signer = Signer {
            public_key,
            kind: SignerKind::Session,
        };
        env.storage().temporary().set(&key, &signer);
        env.storage()
            .temporary()
            .extend_ttl(&key, SESSION_TTL_THRESHOLD, SESSION_TTL_EXTEND);

        Ok(())
    }

    /// Remove a signer by credential ID. Requires wallet self-auth.
    pub fn remove_signer(env: Env, credential_id: Bytes) -> Result<(), WalletError> {
        env.current_contract_address().require_auth();

        let key = WalletDataKey::Signer(credential_id);

        if env.storage().persistent().has(&key) {
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
    type Signature = Signature;
    type Error = WalletError;

    /// Called by the Soroban host whenever `require_auth` targets this
    /// contract's address.
    ///
    /// WebAuthn verification steps:
    /// 1. Look up the stored signer by `signature.id` (credential ID).
    /// 2. Verify the `challenge` field inside `clientDataJSON` matches
    ///    `base64url(signature_payload)`.
    /// 3. Reconstruct the signed message:
    ///    `SHA-256(authenticator_data ‖ SHA-256(client_data_json))`
    /// 4. Verify the secp256r1 ECDSA signature using Protocol 21's
    ///    native `secp256r1_verify` host function (CAP-0051).
    #[allow(non_snake_case)]
    fn __check_auth(
        env: Env,
        signature_payload: Hash<32>,
        signature: Signature,
        _auth_contexts: Vec<Context>,
    ) -> Result<(), WalletError> {
        // ── Step 1: Resolve signer ──────────────────────────
        let signer = get_signer(&env, &signature.id)?;

        // ── Step 2: Verify challenge ────────────────────────
        verify_challenge(&env, &signature.client_data_json, &signature_payload)?;

        // ── Step 3: Build signed message ────────────────────
        // The authenticator signs: SHA-256(authData ‖ SHA-256(clientDataJSON))
        let client_data_hash = env.crypto().sha256(&signature.client_data_json);

        let mut signed_data = Bytes::new(&env);
        signed_data.append(&signature.authenticator_data);
        signed_data.append(&Bytes::from_slice(
            &env,
            client_data_hash.to_array().as_slice(),
        ));

        let message_hash = env.crypto().sha256(&signed_data);

        // ── Step 4: Verify secp256r1 signature ──────────────
        // Protocol 21 host function: verify_sig_ecdsa_secp256r1
        env.crypto().secp256r1_verify(
            &signer.public_key,
            &message_hash,
            &signature.signature,
        );

        // Extend the signer TTL on successful auth.
        extend_signer_ttl(&env, &signature.id, &signer.kind);

        Ok(())
    }
}

// ────────────────────────────────────────────────────────
//  Internal helpers
// ────────────────────────────────────────────────────────

/// Resolve a signer from persistent or temporary storage.
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

/// Extend TTL for the signer based on its kind.
fn extend_signer_ttl(env: &Env, credential_id: &Bytes, kind: &SignerKind) {
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
            env.storage()
                .temporary()
                .extend_ttl(&key, SESSION_TTL_THRESHOLD, SESSION_TTL_EXTEND);
        }
    }
}

/// Validate 65-byte uncompressed SEC-1 public key (must start with 0x04).
fn validate_public_key(public_key: &BytesN<65>) -> Result<(), WalletError> {
    let arr = public_key.to_array();
    if arr[0] != 0x04 {
        return Err(WalletError::InvalidPublicKey);
    }
    Ok(())
}

/// Verify that the `challenge` field in `clientDataJSON` matches the
/// base64url-encoded `signature_payload`.
///
/// WebAuthn's `clientDataJSON` is UTF-8 JSON containing at minimum:
/// ```json
/// { "type": "webauthn.get", "challenge": "<base64url>", "origin": "https://..." }
/// ```
fn verify_challenge(
    env: &Env,
    client_data_json: &Bytes,
    signature_payload: &Hash<32>,
) -> Result<(), WalletError> {
    let needle = b"\"challenge\":\"";
    let json_len = client_data_json.len();
    let needle_len = needle.len() as u32;

    // Search for the challenge key in the JSON bytes.
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

    // Find the closing quote.
    let mut challenge_end: Option<u32> = None;
    for i in start..json_len {
        if client_data_json.get(i).unwrap() == b'"' {
            challenge_end = Some(i);
            break;
        }
    }
    let end = challenge_end.ok_or(WalletError::InvalidClientData)?;

    // Extract the challenge bytes from clientDataJSON.
    let challenge_bytes = client_data_json.slice(start..end);

    // Encode signature_payload as base64url (no padding).
    let expected = base64url_encode(env, signature_payload.to_array().as_slice());

    if challenge_bytes != expected {
        return Err(WalletError::ChallengeMismatch);
    }

    Ok(())
}

/// Base64url encode (RFC 4648 §5, no padding) returning Soroban `Bytes`.
///
/// For a 32-byte input (SHA-256 hash), this produces exactly 43 output bytes.
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