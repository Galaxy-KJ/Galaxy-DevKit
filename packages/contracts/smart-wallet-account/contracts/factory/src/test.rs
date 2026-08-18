use soroban_sdk::{
    testutils::{storage::Instance as _, storage::Persistent as _, Address as _, Ledger},
    Address, Bytes, BytesN, Env,
};

use smart_wallet_account_common::FactoryDataKey;

use crate::{
    Factory, FactoryClient, DEPLOYED_TTL_EXTEND, DEPLOYED_TTL_THRESHOLD, INSTANCE_TTL_EXTEND,
    INSTANCE_TTL_THRESHOLD,
};

fn setup(env: &Env) -> FactoryClient<'static> {
    let contract_id = env.register_contract(None, Factory);
    FactoryClient::new(env, &contract_id)
}

fn wasm_hash(env: &Env, tag: u8) -> BytesN<32> {
    BytesN::from_array(env, &[tag; 32])
}

#[test]
fn test_init_extends_instance_ttl() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.sequence_number = 100);

    let client = setup(&env);
    client.init(&wasm_hash(&env, 1));

    let ttl = env.as_contract(&client.address, || env.storage().instance().get_ttl());
    assert_eq!(ttl, INSTANCE_TTL_EXTEND);
}

#[test]
fn test_instance_ttl_boundary_behavior() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.sequence_number = 100);

    let client = setup(&env);
    client.init(&wasm_hash(&env, 2));

    let unknown_credential = Bytes::from_array(&env, &[0u8; 4]);

    let just_before_threshold = 100 + (INSTANCE_TTL_EXTEND - INSTANCE_TTL_THRESHOLD - 1);
    env.ledger()
        .with_mut(|li| li.sequence_number = just_before_threshold);
    client.get_wallet(&unknown_credential);
    let ttl = env.as_contract(&client.address, || env.storage().instance().get_ttl());
    assert_eq!(ttl, INSTANCE_TTL_THRESHOLD + 1);

    env.ledger()
        .with_mut(|li| li.sequence_number = just_before_threshold + 1);
    client.get_wallet(&unknown_credential);
    let ttl = env.as_contract(&client.address, || env.storage().instance().get_ttl());
    assert_eq!(ttl, INSTANCE_TTL_EXTEND);
}

#[test]
fn test_deployed_mapping_survives_past_initial_threshold_on_read() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.sequence_number = 100);

    let contract_id = env.register_contract(None, Factory);
    let client = FactoryClient::new(&env, &contract_id);
    client.init(&wasm_hash(&env, 9));

    let credential_id = Bytes::from_array(&env, &[7u8; 4]);
    let wallet_addr = Address::generate(&env);

    env.as_contract(&contract_id, || {
        let key = FactoryDataKey::Deployed(credential_id.clone());
        env.storage().persistent().set(&key, &wallet_addr);
        env.storage()
            .persistent()
            .extend_ttl(&key, DEPLOYED_TTL_THRESHOLD, DEPLOYED_TTL_EXTEND);
    });

    env.ledger()
        .with_mut(|li| li.sequence_number = 100 + DEPLOYED_TTL_EXTEND - 1);

    let result = client.get_wallet(&credential_id);
    assert_eq!(result, Some(wallet_addr));

    let ttl = env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .get_ttl(&FactoryDataKey::Deployed(credential_id))
    });
    assert_eq!(ttl, DEPLOYED_TTL_EXTEND);
}

#[test]
fn test_get_wallet_extends_instance_ttl_even_on_miss() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.sequence_number = 100);

    let client = setup(&env);
    client.init(&wasm_hash(&env, 3));

    env.ledger()
        .with_mut(|li| li.sequence_number = 100 + INSTANCE_TTL_EXTEND - 1);
    let unknown_credential = Bytes::from_array(&env, &[0xFFu8; 4]);
    let result = client.get_wallet(&unknown_credential);
    assert!(result.is_none());

    let ttl = env.as_contract(&client.address, || env.storage().instance().get_ttl());
    assert_eq!(ttl, INSTANCE_TTL_EXTEND);
}
