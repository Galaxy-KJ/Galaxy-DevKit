#![no_std]
use soroban_sdk::{contract, contractimpl, Address, Bytes, BytesN, Env, IntoVal, Symbol};

use smart_wallet_account_common::FactoryDataKey;

// A deployed wallet's mapping should outlive long gaps between logins,
// so it renews on both `deploy` and `get_wallet` lookups.
const DEPLOYED_TTL_THRESHOLD: u32 = 60_480;
const DEPLOYED_TTL_EXTEND: u32 = 120_960;

/// Instance TTL (WalletWasmHash config). Same horizon as the `Deployed`
/// mapping — the factory is read on every `deploy()` call.
const INSTANCE_TTL_THRESHOLD: u32 = 60_480;
const INSTANCE_TTL_EXTEND: u32 = 120_960;

#[contract]
pub struct Factory;

#[contractimpl]
impl Factory {
    pub fn init(env: Env, wallet_wasm_hash: BytesN<32>) {
        if env
            .storage()
            .instance()
            .has(&FactoryDataKey::WalletWasmHash)
        {
            panic!("factory already initialized");
        }
        env.storage()
            .instance()
            .set(&FactoryDataKey::WalletWasmHash, &wallet_wasm_hash);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
    }

    pub fn deploy(
        env: Env,
        deployer: Address,
        credential_id: Bytes,
        public_key: BytesN<65>,
    ) -> Address {
        deployer.require_auth();

        let wasm_hash: BytesN<32> = env
            .storage()
            .instance()
            .get(&FactoryDataKey::WalletWasmHash)
            .expect("factory not initialized");
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);

        // Deterministic salt from the credential ID.
        let salt = env.crypto().sha256(&credential_id);

        // Deploy the wallet contract using `deployer().with_current_contract`.
        let wallet_address = env.deployer().with_current_contract(salt).deploy(wasm_hash);

        // Initialize the wallet with the first signer.
        let _: soroban_sdk::Val = env.invoke_contract(
            &wallet_address,
            &Symbol::new(&env, "init"),
            (credential_id.clone(), public_key).into_val(&env),
        );

        // Track the deployment.
        let deployed_key = FactoryDataKey::Deployed(credential_id);
        env.storage()
            .persistent()
            .set(&deployed_key, &wallet_address);
        env.storage().persistent().extend_ttl(
            &deployed_key,
            DEPLOYED_TTL_THRESHOLD,
            DEPLOYED_TTL_EXTEND,
        );

        wallet_address
    }

    pub fn get_wallet(env: Env, credential_id: Bytes) -> Option<Address> {
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);

        let key = FactoryDataKey::Deployed(credential_id);
        let result: Option<Address> = env.storage().persistent().get(&key);
        if result.is_some() {
            env.storage().persistent().extend_ttl(
                &key,
                DEPLOYED_TTL_THRESHOLD,
                DEPLOYED_TTL_EXTEND,
            );
        }
        result
    }
}

#[cfg(test)]
mod test;
