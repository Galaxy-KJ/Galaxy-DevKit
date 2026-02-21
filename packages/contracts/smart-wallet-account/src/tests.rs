extern crate std;

use soroban_sdk::{Bytes, BytesN, Env};

use crate::wallet::{SmartWallet, SmartWalletClient};

// ────────────────────────────────────────────────────────
//  Test helpers
// ────────────────────────────────────────────────────────

/// Generate a dummy 65-byte uncompressed public key (0x04 ‖ X ‖ Y).
fn dummy_public_key(env: &Env, seed: u8) -> BytesN<65> {
    let mut bytes = [0u8; 65];
    bytes[0] = 0x04; // uncompressed SEC-1 prefix
    for i in 1..65 {
        bytes[i] = seed.wrapping_add(i as u8);
    }
    BytesN::from_array(env, &bytes)
}

/// Generate an invalid public key (wrong prefix byte).
fn invalid_public_key(env: &Env) -> BytesN<65> {
    let mut bytes = [0u8; 65];
    bytes[0] = 0x02; // compressed prefix — our contract rejects this
    for i in 1..65 {
        bytes[i] = 0xAA;
    }
    BytesN::from_array(env, &bytes)
}

/// Create a credential ID from bytes.
fn cred_id(env: &Env, name: &str) -> Bytes {
    Bytes::from_slice(env, name.as_bytes())
}

/// Deploy and initialize a wallet contract, returning the client and initial cred.
fn setup_wallet(env: &Env) -> (SmartWalletClient, Bytes, BytesN<65>) {
    let contract_id = env.register_contract(None, SmartWallet);
    let client = SmartWalletClient::new(env, &contract_id);

    let credential_id = cred_id(env, "test-cred-001");
    let public_key = dummy_public_key(env, 1);

    client.init(&credential_id, &public_key);

    (client, credential_id, public_key)
}

// ────────────────────────────────────────────────────────
//  Initialization tests
// ────────────────────────────────────────────────────────

#[test]
fn test_init_succeeds() {
    let env = Env::default();
    let contract_id = env.register_contract(None, SmartWallet);
    let client = SmartWalletClient::new(&env, &contract_id);

    let credential_id = cred_id(&env, "cred-init-test");
    let public_key = dummy_public_key(&env, 42);

    client.init(&credential_id, &public_key);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_double_init_fails() {
    let env = Env::default();
    let (client, _, _) = setup_wallet(&env);

    // Second init should fail with AlreadyInitialized (error code 5).
    let cred2 = cred_id(&env, "cred-double");
    let pk2 = dummy_public_key(&env, 99);
    client.init(&cred2, &pk2);
}

#[test]
#[should_panic(expected = "Error(Contract, #7)")]
fn test_init_invalid_public_key() {
    let env = Env::default();
    let contract_id = env.register_contract(None, SmartWallet);
    let client = SmartWalletClient::new(&env, &contract_id);

    let credential_id = cred_id(&env, "cred-bad-pk");
    let bad_pk = invalid_public_key(&env);

    client.init(&credential_id, &bad_pk);
}

// ────────────────────────────────────────────────────────
//  Signer management tests
// ────────────────────────────────────────────────────────

#[test]
fn test_add_signer() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _, _) = setup_wallet(&env);

    let new_cred = cred_id(&env, "cred-new-signer");
    let new_pk = dummy_public_key(&env, 50);

    client.add_signer(&new_cred, &new_pk);
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_add_duplicate_signer_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, original_cred, _) = setup_wallet(&env);

    // Adding with the same credential ID should fail (SignerAlreadyExists = 2).
    let another_pk = dummy_public_key(&env, 77);
    client.add_signer(&original_cred, &another_pk);
}

#[test]
#[should_panic(expected = "Error(Contract, #7)")]
fn test_add_signer_invalid_public_key() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _, _) = setup_wallet(&env);

    let new_cred = cred_id(&env, "cred-bad");
    let bad_pk = invalid_public_key(&env);

    client.add_signer(&new_cred, &bad_pk);
}

#[test]
fn test_add_session_signer() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _, _) = setup_wallet(&env);

    let session_cred = cred_id(&env, "session-cred-001");
    let session_pk = dummy_public_key(&env, 60);

    client.add_session_signer(&session_cred, &session_pk);
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_add_session_duplicate_of_admin_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, admin_cred, _) = setup_wallet(&env);

    // Session signer with same credential ID as existing admin should fail.
    let session_pk = dummy_public_key(&env, 70);
    client.add_session_signer(&admin_cred, &session_pk);
}

// ────────────────────────────────────────────────────────
//  Signer removal tests
// ────────────────────────────────────────────────────────

#[test]
fn test_remove_admin_signer() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _, _) = setup_wallet(&env);

    // Add then remove a second admin signer.
    let second_cred = cred_id(&env, "cred-to-remove");
    let second_pk = dummy_public_key(&env, 80);
    client.add_signer(&second_cred, &second_pk);
    client.remove_signer(&second_cred);
}

#[test]
fn test_remove_session_signer() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _, _) = setup_wallet(&env);

    let session_cred = cred_id(&env, "session-to-remove");
    let session_pk = dummy_public_key(&env, 90);
    client.add_session_signer(&session_cred, &session_pk);
    client.remove_signer(&session_cred);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_remove_nonexistent_signer_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _, _) = setup_wallet(&env);

    let nonexistent = cred_id(&env, "does-not-exist");
    client.remove_signer(&nonexistent);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_remove_already_removed_signer_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _, _) = setup_wallet(&env);

    let cred = cred_id(&env, "add-and-remove");
    let pk = dummy_public_key(&env, 85);
    client.add_signer(&cred, &pk);
    client.remove_signer(&cred);

    // Second removal should fail.
    client.remove_signer(&cred);
}

// ────────────────────────────────────────────────────────
//  Base64url encoder unit tests
// ────────────────────────────────────────────────────────

/// Standalone base64url encoder (mirrors the on-chain version) for test assertions.
fn base64url_encode_std(input: &[u8]) -> std::vec::Vec<u8> {
    const TABLE: &[u8; 64] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

    let mut out = std::vec::Vec::new();
    let chunks = input.len() / 3;
    let remainder = input.len() % 3;

    for i in 0..chunks {
        let b0 = input[i * 3] as u32;
        let b1 = input[i * 3 + 1] as u32;
        let b2 = input[i * 3 + 2] as u32;
        let triple = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((triple >> 18) & 0x3F) as usize]);
        out.push(TABLE[((triple >> 12) & 0x3F) as usize]);
        out.push(TABLE[((triple >> 6) & 0x3F) as usize]);
        out.push(TABLE[(triple & 0x3F) as usize]);
    }

    if remainder == 2 {
        let b0 = input[chunks * 3] as u32;
        let b1 = input[chunks * 3 + 1] as u32;
        let triple = (b0 << 16) | (b1 << 8);
        out.push(TABLE[((triple >> 18) & 0x3F) as usize]);
        out.push(TABLE[((triple >> 12) & 0x3F) as usize]);
        out.push(TABLE[((triple >> 6) & 0x3F) as usize]);
    } else if remainder == 1 {
        let b0 = input[chunks * 3] as u32;
        let triple = b0 << 16;
        out.push(TABLE[((triple >> 18) & 0x3F) as usize]);
        out.push(TABLE[((triple >> 12) & 0x3F) as usize]);
    }

    out
}

#[test]
fn test_base64url_encode_known_vector() {
    // SHA-256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    // base64url (no pad) = 47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU
    let input: [u8; 32] = [
        0xe3, 0xb0, 0xc4, 0x42, 0x98, 0xfc, 0x1c, 0x14, 0x9a, 0xfb, 0xf4, 0xc8, 0x99, 0x6f,
        0xb9, 0x24, 0x27, 0xae, 0x41, 0xe4, 0x64, 0x9b, 0x93, 0x4c, 0xa4, 0x95, 0x99, 0x1b,
        0x78, 0x52, 0xb8, 0x55,
    ];
    let expected = b"47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU";
    let result = base64url_encode_std(&input);
    assert_eq!(result.as_slice(), expected.as_slice());
}

#[test]
fn test_base64url_encode_all_zeros() {
    let input = [0u8; 32];
    let expected = b"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    let result = base64url_encode_std(&input);
    assert_eq!(result.len(), 43); // 32 bytes → ceil(32*4/3) = 43 chars, no padding
    assert_eq!(result.as_slice(), expected.as_slice());
}

#[test]
fn test_base64url_encode_all_ff() {
    let input = [0xFFu8; 32];
    let expected = b"__________________________________________8";
    let result = base64url_encode_std(&input);
    assert_eq!(result.as_slice(), expected.as_slice());
}

// ────────────────────────────────────────────────────────
//  Challenge verification unit tests (off-chain logic)
// ────────────────────────────────────────────────────────

#[test]
fn test_challenge_extraction_roundtrip() {
    let payload = [0u8; 32];
    let expected_challenge = base64url_encode_std(&payload);

    // Build a mock clientDataJSON.
    let mut json = std::vec::Vec::new();
    json.extend_from_slice(b"{\"type\":\"webauthn.get\",\"challenge\":\"");
    json.extend_from_slice(&expected_challenge);
    json.extend_from_slice(b"\",\"origin\":\"https://example.com\"}");

    // Extract and verify.
    let needle = b"\"challenge\":\"";
    let start = json
        .windows(needle.len())
        .position(|w| w == needle)
        .unwrap()
        + needle.len();
    let end = json[start..]
        .iter()
        .position(|&b| b == b'"')
        .unwrap()
        + start;

    assert_eq!(&json[start..end], expected_challenge.as_slice());
}

#[test]
fn test_challenge_mismatch_detected() {
    let payload_a = [0u8; 32];
    let payload_b = [1u8; 32]; // different
    let challenge_b = base64url_encode_std(&payload_b);

    // clientDataJSON contains challenge for payload_b.
    let mut json = std::vec::Vec::new();
    json.extend_from_slice(b"{\"type\":\"webauthn.get\",\"challenge\":\"");
    json.extend_from_slice(&challenge_b);
    json.extend_from_slice(b"\",\"origin\":\"https://example.com\"}");

    // Expected challenge for payload_a.
    let expected_a = base64url_encode_std(&payload_a);

    let needle = b"\"challenge\":\"";
    let start = json
        .windows(needle.len())
        .position(|w| w == needle)
        .unwrap()
        + needle.len();
    let end = json[start..]
        .iter()
        .position(|&b| b == b'"')
        .unwrap()
        + start;

    // They should NOT match.
    assert_ne!(&json[start..end], expected_a.as_slice());
}

// ────────────────────────────────────────────────────────
//  Multi-signer workflow integration test
// ────────────────────────────────────────────────────────

#[test]
fn test_multi_signer_full_workflow() {
    let env = Env::default();
    env.mock_all_auths();

    let (client, _initial_cred, _) = setup_wallet(&env);

    // Add 3 admin signers.
    for i in 0..3u8 {
        let name = std::format!("multi-signer-{}", i);
        let cred = cred_id(&env, &name);
        let pk = dummy_public_key(&env, 100 + i);
        client.add_signer(&cred, &pk);
    }

    // Add a session signer.
    let session_cred = cred_id(&env, "session-multi");
    let session_pk = dummy_public_key(&env, 200);
    client.add_session_signer(&session_cred, &session_pk);

    // Remove the middle admin signer.
    let to_remove = cred_id(&env, "multi-signer-1");
    client.remove_signer(&to_remove);

    // Remove session signer.
    client.remove_signer(&session_cred);

    // Verify double-remove fails.
    let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        client.remove_signer(&to_remove);
    }));
    assert!(result.is_err(), "Double-remove should panic");
}