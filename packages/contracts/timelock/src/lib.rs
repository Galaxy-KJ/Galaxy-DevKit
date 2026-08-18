#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short, xdr::ToXdr, Address, Bytes, BytesN, Env,
    Map, String, Symbol,
};

const QUEUED_TXS: Symbol = symbol_short!("QUEUED");
const EXECUTED: Symbol = symbol_short!("EXECUTD");

const INSTANCE_TTL_THRESHOLD: u32 = 241_920; // ~14 days
const INSTANCE_TTL_EXTEND: u32 = 483_840; // ~28 days

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct QueuedTransaction {
    pub target: Address,
    pub action: String,
    pub eta: u64,
    pub queued_at: u64,
}

#[contract]
pub struct TimelockContract;

#[contractimpl]
impl TimelockContract {
    pub fn queue_transaction(env: Env, target: Address, action: String, eta: u64) -> BytesN<32> {
        if eta <= env.ledger().timestamp() {
            panic!("ETA must be in the future");
        }

        let mut data = Bytes::new(&env);
        data.append(&target.clone().to_xdr(&env));
        data.append(&action.clone().to_xdr(&env));
        data.append(&eta.to_xdr(&env));
        let tx_hash: BytesN<32> = env.crypto().sha256(&data).into();

        let queued = QueuedTransaction {
            target,
            action,
            eta,
            queued_at: env.ledger().timestamp(),
        };

        let mut queued_txs: Map<BytesN<32>, QueuedTransaction> =
            env.storage().instance().get(&QUEUED_TXS).unwrap_or(Map::new(&env));

        if queued_txs.contains_key(tx_hash.clone()) {
            panic!("Transaction already queued");
        }

        queued_txs.set(tx_hash.clone(), queued);
        env.storage().instance().set(&QUEUED_TXS, &queued_txs);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);

        tx_hash
    }

    pub fn execute_transaction(env: Env, tx_hash: BytesN<32>) {
        let mut executed: Map<BytesN<32>, bool> =
            env.storage().instance().get(&EXECUTED).unwrap_or(Map::new(&env));

        if executed.contains_key(tx_hash.clone()) {
            panic!("Transaction already executed");
        }

        let mut queued_txs: Map<BytesN<32>, QueuedTransaction> =
            env.storage().instance().get(&QUEUED_TXS).unwrap_or(Map::new(&env));

        let tx = queued_txs.get(tx_hash.clone()).expect("Transaction not found");

        if env.ledger().timestamp() < tx.eta {
            panic!("Cannot execute before ETA");
        }

        queued_txs.remove(tx_hash.clone());
        executed.set(tx_hash, true);

        env.storage().instance().set(&QUEUED_TXS, &queued_txs);
        env.storage().instance().set(&EXECUTED, &executed);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
    }

    pub fn revoke_transaction(env: Env, tx_hash: BytesN<32>) {
        let mut queued_txs: Map<BytesN<32>, QueuedTransaction> =
            env.storage().instance().get(&QUEUED_TXS).unwrap_or(Map::new(&env));

        let tx = queued_txs.get(tx_hash.clone()).expect("Transaction not found");

        if env.ledger().timestamp() >= tx.eta {
            panic!("Cannot revoke after ETA has passed");
        }

        queued_txs.remove(tx_hash);
        env.storage().instance().set(&QUEUED_TXS, &queued_txs);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
    }

    pub fn get_queued_transaction(env: Env, tx_hash: BytesN<32>) -> Option<QueuedTransaction> {
        let queued_txs: Map<BytesN<32>, QueuedTransaction> =
            env.storage().instance().get(&QUEUED_TXS).unwrap_or(Map::new(&env));
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
        queued_txs.get(tx_hash)
    }

    pub fn is_executed(env: Env, tx_hash: BytesN<32>) -> bool {
        let executed: Map<BytesN<32>, bool> =
            env.storage().instance().get(&EXECUTED).unwrap_or(Map::new(&env));
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
        executed.contains_key(tx_hash)
    }
}

#[cfg(test)]
mod test;
