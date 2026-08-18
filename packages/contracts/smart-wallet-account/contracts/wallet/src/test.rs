extern crate std;

use soroban_sdk::{
    testutils::{storage::Instance as _, storage::Temporary as _, Ledger},
    Bytes, BytesN, Env,
};

use smart_wallet_account_common::{WalletDataKey, WalletError};

use crate::{SmartWallet, SmartWalletClient, ADMIN_TTL_EXTEND, ADMIN_TTL_THRESHOLD};

fn setup(env: &Env) -> SmartWalletClient<'static> {
    let contract_id = env.register_contract(None, SmartWallet);
    SmartWalletClient::new(env, &contract_id)
}

fn admin_public_key(env: &Env, tag: u8) -> BytesN<65> {
    let mut bytes = [tag; 65];
    bytes[0] = 0x04;
    BytesN::from_array(env, &bytes)
}

#[test]
fn test_init_extends_instance_ttl() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.sequence_number = 100);

    let client = setup(&env);
    let credential_id = Bytes::from_array(&env, &[1u8; 4]);
    client.init(&credential_id, &admin_public_key(&env, 0xAA));

    let ttl = env.as_contract(&client.address, || env.storage().instance().get_ttl());
    assert_eq!(ttl, ADMIN_TTL_EXTEND);
}

#[test]
fn test_add_signer_explicitly_extends_instance_ttl_at_boundary() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.sequence_number = 100);

    let client = setup(&env);
    let admin_cred = Bytes::from_array(&env, &[1u8; 4]);
    client.init(&admin_cred, &admin_public_key(&env, 0xAA));

    let just_before_threshold = 100 + (ADMIN_TTL_EXTEND - ADMIN_TTL_THRESHOLD - 1);
    env.ledger()
        .with_mut(|li| li.sequence_number = just_before_threshold);
    let second_cred = Bytes::from_array(&env, &[2u8; 4]);
    client.add_signer(&second_cred, &admin_public_key(&env, 0xBB));

    let ttl = env.as_contract(&client.address, || env.storage().instance().get_ttl());
    assert_eq!(ttl, ADMIN_TTL_THRESHOLD + 1);

    env.ledger()
        .with_mut(|li| li.sequence_number = just_before_threshold + 1);
    let third_cred = Bytes::from_array(&env, &[3u8; 4]);
    client.add_signer(&third_cred, &admin_public_key(&env, 0xCC));

    let ttl = env.as_contract(&client.address, || env.storage().instance().get_ttl());
    assert_eq!(ttl, ADMIN_TTL_EXTEND);
}

#[test]
fn test_remove_signer_explicitly_extends_instance_ttl() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.sequence_number = 100);

    let client = setup(&env);
    let admin_cred = Bytes::from_array(&env, &[1u8; 4]);
    client.init(&admin_cred, &admin_public_key(&env, 0xAA));
    let second_cred = Bytes::from_array(&env, &[2u8; 4]);
    client.add_signer(&second_cred, &admin_public_key(&env, 0xBB));

    let just_before_threshold = 100 + (ADMIN_TTL_EXTEND - ADMIN_TTL_THRESHOLD);
    env.ledger()
        .with_mut(|li| li.sequence_number = just_before_threshold);

    client.remove_signer(&second_cred);

    let ttl = env.as_contract(&client.address, || env.storage().instance().get_ttl());
    assert_eq!(ttl, ADMIN_TTL_EXTEND);
}

#[test]
fn test_session_signer_evicted_after_ttl_elapses() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.sequence_number = 100);

    let client = setup(&env);
    let admin_cred = Bytes::from_array(&env, &[1u8; 4]);
    client.init(&admin_cred, &admin_public_key(&env, 0xAA));

    let session_cred = Bytes::from_array(&env, &[9u8; 4]);
    let session_pk = BytesN::from_array(&env, &[7u8; 32]);
    let ttl_ledgers: u32 = 1_000;
    client.add_session_signer(&session_cred, &session_pk, &ttl_ledgers);

    let key = WalletDataKey::Signer(session_cred.clone());

    env.ledger()
        .with_mut(|li| li.sequence_number = 100 + ttl_ledgers - 1);
    let alive = env.as_contract(&client.address, || env.storage().temporary().has(&key));
    assert!(alive, "session key must still be present before its TTL elapses");

    env.ledger()
        .with_mut(|li| li.sequence_number = 100 + ttl_ledgers + 1);
    let evicted = env.as_contract(&client.address, || env.storage().temporary().has(&key));
    assert!(!evicted, "session key must be evicted once its TTL elapses");

    let result = client.try_remove_signer(&session_cred);
    assert_eq!(result, Err(Ok(WalletError::SignerNotFound)));
}

#[test]
fn test_session_signer_initial_ttl_matches_requested_value() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.sequence_number = 100);

    let client = setup(&env);
    let admin_cred = Bytes::from_array(&env, &[1u8; 4]);
    client.init(&admin_cred, &admin_public_key(&env, 0xAA));

    let session_cred = Bytes::from_array(&env, &[9u8; 4]);
    let session_pk = BytesN::from_array(&env, &[7u8; 32]);
    let ttl_ledgers: u32 = 2_500;
    client.add_session_signer(&session_cred, &session_pk, &ttl_ledgers);

    let key = WalletDataKey::Signer(session_cred);
    let ttl = env.as_contract(&client.address, || env.storage().temporary().get_ttl(&key));
    assert_eq!(ttl, ttl_ledgers);
}

#[test]
fn bench_extend_ttl_costs() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.sequence_number = 100);

    let client = setup(&env);
    let admin_cred = Bytes::from_array(&env, &[1u8; 4]);
    client.init(&admin_cred, &admin_public_key(&env, 0xAA));
    let signer_key = WalletDataKey::Signer(admin_cred);

    env.ledger()
        .with_mut(|li| li.sequence_number += ADMIN_TTL_EXTEND - ADMIN_TTL_THRESHOLD);
    let instance_trigger_cpu = env.as_contract(&client.address, || {
        env.budget().reset_unlimited();
        env.storage()
            .instance()
            .extend_ttl(ADMIN_TTL_THRESHOLD, ADMIN_TTL_EXTEND);
        env.budget().cpu_instruction_cost()
    });
    let instance_noop_cpu = env.as_contract(&client.address, || {
        env.budget().reset_unlimited();
        env.storage()
            .instance()
            .extend_ttl(ADMIN_TTL_THRESHOLD, ADMIN_TTL_EXTEND);
        env.budget().cpu_instruction_cost()
    });

    env.ledger()
        .with_mut(|li| li.sequence_number += ADMIN_TTL_EXTEND - ADMIN_TTL_THRESHOLD);
    let persistent_trigger_cpu = env.as_contract(&client.address, || {
        env.budget().reset_unlimited();
        env.storage()
            .persistent()
            .extend_ttl(&signer_key, ADMIN_TTL_THRESHOLD, ADMIN_TTL_EXTEND);
        env.budget().cpu_instruction_cost()
    });
    let persistent_noop_cpu = env.as_contract(&client.address, || {
        env.budget().reset_unlimited();
        env.storage()
            .persistent()
            .extend_ttl(&signer_key, ADMIN_TTL_THRESHOLD, ADMIN_TTL_EXTEND);
        env.budget().cpu_instruction_cost()
    });

    let session_cred = Bytes::from_array(&env, &[9u8; 4]);
    let session_pk = BytesN::from_array(&env, &[7u8; 32]);
    let ttl_ledgers: u32 = 17_280;
    client.add_session_signer(&session_cred, &session_pk, &ttl_ledgers);
    let session_key = WalletDataKey::Signer(session_cred);

    env.ledger()
        .with_mut(|li| li.sequence_number += ttl_ledgers / 2);
    let temporary_trigger_cpu = env.as_contract(&client.address, || {
        env.budget().reset_unlimited();
        env.storage()
            .temporary()
            .extend_ttl(&session_key, ttl_ledgers / 2, ttl_ledgers);
        env.budget().cpu_instruction_cost()
    });
    let temporary_noop_cpu = env.as_contract(&client.address, || {
        env.budget().reset_unlimited();
        env.storage()
            .temporary()
            .extend_ttl(&session_key, ttl_ledgers / 2, ttl_ledgers);
        env.budget().cpu_instruction_cost()
    });

    std::println!("\n=== extend_ttl marginal CPU-instruction cost ===");
    std::println!(
        "{:<12} | {:>16} | {:>16}",
        "storage", "trigger (insns)", "no-op (insns)"
    );
    std::println!(
        "{:<12} | {:>16} | {:>16}",
        "instance", instance_trigger_cpu, instance_noop_cpu
    );
    std::println!(
        "{:<12} | {:>16} | {:>16}",
        "persistent", persistent_trigger_cpu, persistent_noop_cpu
    );
    std::println!(
        "{:<12} | {:>16} | {:>16}",
        "temporary", temporary_trigger_cpu, temporary_noop_cpu
    );

    assert!(instance_noop_cpu <= instance_trigger_cpu);
    assert!(persistent_noop_cpu <= persistent_trigger_cpu);
    assert!(temporary_noop_cpu <= temporary_trigger_cpu);
}
