use soroban_sdk::{
    contract, contractimpl, Address, Bytes, BytesN, Env, IntoVal, Symbol,
};

use crate::types::FactoryDataKey;

/// TTL for the Deployed credential→wallet mapping (persistent storage).
const DEPLOYED_TTL_THRESHOLD: u32 = 60_480; // ~3.5 days
const DEPLOYED_TTL_EXTEND: u32 = 120_960; // ~7 days

#[contract]
pub struct Factory;

#[contractimpl]
impl Factory {
    /// Initialize the factory with the WASM hash of the compiled wallet
    /// contract. Called once after the factory is deployed.
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
    }

    /// Deploy a new smart wallet for a user.
    ///
    /// The wallet address is **deterministic** — derived from a salt
    /// computed as `SHA-256(credential_id)`. This ensures the same
    /// passkey always produces the same wallet address regardless of
    /// who calls `deploy`.
    ///
    /// # Arguments
    /// * `deployer`      – address paying for the deployment (must authorize)
    /// * `credential_id` – the WebAuthn credential ID of the user's passkey
    /// * `public_key`    – 65-byte SEC-1 uncompressed public key (0x04 ‖ X ‖ Y)
    ///
    /// # Returns
    /// The `Address` of the newly deployed wallet contract.
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

        // Deterministic salt from the credential ID.
        let salt = env.crypto().sha256(&credential_id);

        // Deploy the wallet contract using `deployer().with_current_contract`.
        let wallet_address = env
            .deployer()
            .with_current_contract(salt)
            .deploy(wasm_hash);

        // Initialize the wallet with the first signer.
        let _: soroban_sdk::Val = env.invoke_contract(
            &wallet_address,
            &Symbol::new(&env, "init"),
            (credential_id.clone(), public_key).into_val(&env),
        );

        // Track the deployment.
        let deployed_key = FactoryDataKey::Deployed(credential_id);
        env.storage().persistent().set(
            &deployed_key,
            &wallet_address,
        );
        env.storage()
            .persistent()
            .extend_ttl(&deployed_key, DEPLOYED_TTL_THRESHOLD, DEPLOYED_TTL_EXTEND);

        wallet_address
    }

    /// Look up the wallet address for a given credential ID.
    /// Returns `None` if no wallet was deployed for that credential.
    /// Extends the TTL on read to prevent archival of active mappings.
    pub fn get_wallet(env: Env, credential_id: Bytes) -> Option<Address> {
        let key = FactoryDataKey::Deployed(credential_id);
        let result: Option<Address> = env.storage().persistent().get(&key);
        if result.is_some() {
            env.storage()
                .persistent()
                .extend_ttl(&key, DEPLOYED_TTL_THRESHOLD, DEPLOYED_TTL_EXTEND);
        }
        result
    }
}