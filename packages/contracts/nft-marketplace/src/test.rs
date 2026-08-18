#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{storage::Persistent as _, Address as _, Ledger},
    Address, Env,
};

#[test]
fn test_listing_and_buying() {
    let env = Env::default();
    let contract_id = env.register_contract(None, NftMarketplaceContract);
    let client = NftMarketplaceContractClient::new(&env, &contract_id);

    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);
    let nft = Address::generate(&env);
    let token_id = 1;
    let price = 100;

    env.mock_all_auths();

    client.list_nft(&seller, &nft, &token_id, &price);
    
    // Verify it was listed
    client.buy_nft(&buyer, &nft, &token_id);
}

#[test]
fn test_cancel_listing() {
    let env = Env::default();
    let contract_id = env.register_contract(None, NftMarketplaceContract);
    let client = NftMarketplaceContractClient::new(&env, &contract_id);

    let seller = Address::generate(&env);
    let nft = Address::generate(&env);
    let token_id = 1;
    let price = 100;

    env.mock_all_auths();

    client.list_nft(&seller, &nft, &token_id, &price);
    client.cancel_listing(&seller, &nft, &token_id);
}

#[test]
fn test_bidding() {
    let env = Env::default();
    let contract_id = env.register_contract(None, NftMarketplaceContract);
    let client = NftMarketplaceContractClient::new(&env, &contract_id);

    let seller = Address::generate(&env);
    let bidder = Address::generate(&env);
    let nft = Address::generate(&env);
    let token_id = 1;
    let price = 100;
    let bid_price = 90;

    env.mock_all_auths();

    client.list_nft(&seller, &nft, &token_id, &price);
    client.place_bid(&bidder, &nft, &token_id, &bid_price);
    client.accept_bid(&seller, &nft, &token_id, &bidder);
}

#[test]
fn test_list_nft_sets_entry_ttl() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.sequence_number = 100);
    let contract_id = env.register_contract(None, NftMarketplaceContract);
    let client = NftMarketplaceContractClient::new(&env, &contract_id);
    env.mock_all_auths();

    let seller = Address::generate(&env);
    let nft = Address::generate(&env);
    let token_id = 1;

    client.list_nft(&seller, &nft, &token_id, &100);

    let key = DataKey::Listing(nft, token_id);
    let ttl = env.as_contract(&contract_id, || env.storage().persistent().get_ttl(&key));
    assert_eq!(ttl, ENTRY_TTL_EXTEND);
}

#[test]
fn test_place_bid_sets_entry_ttl() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.sequence_number = 100);
    let contract_id = env.register_contract(None, NftMarketplaceContract);
    let client = NftMarketplaceContractClient::new(&env, &contract_id);
    env.mock_all_auths();

    let seller = Address::generate(&env);
    let bidder = Address::generate(&env);
    let nft = Address::generate(&env);
    let token_id = 1;

    client.list_nft(&seller, &nft, &token_id, &100);
    client.place_bid(&bidder, &nft, &token_id, &90);

    let key = DataKey::Bid(nft, token_id, bidder);
    let ttl = env.as_contract(&contract_id, || env.storage().persistent().get_ttl(&key));
    assert_eq!(ttl, ENTRY_TTL_EXTEND);
}

#[test]
fn test_listing_survives_past_initial_extend_window_with_no_further_writes() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.sequence_number = 100);
    let contract_id = env.register_contract(None, NftMarketplaceContract);
    let client = NftMarketplaceContractClient::new(&env, &contract_id);
    env.mock_all_auths();

    let seller = Address::generate(&env);
    let buyer = Address::generate(&env);
    let nft = Address::generate(&env);
    let token_id = 1;

    client.list_nft(&seller, &nft, &token_id, &100);

    env.ledger()
        .with_mut(|li| li.sequence_number = 100 + ENTRY_TTL_EXTEND - 1);

    client.buy_nft(&buyer, &nft, &token_id);
}

#[test]
fn test_entry_ttl_boundary_behavior() {
    let env = Env::default();
    env.ledger().with_mut(|li| li.sequence_number = 100);
    let contract_id = env.register_contract(None, NftMarketplaceContract);
    let client = NftMarketplaceContractClient::new(&env, &contract_id);
    env.mock_all_auths();

    let seller = Address::generate(&env);
    let nft = Address::generate(&env);
    let token_id = 1;
    let key = DataKey::Listing(nft.clone(), token_id);

    client.list_nft(&seller, &nft, &token_id, &100);

    let just_before_threshold = 100 + (ENTRY_TTL_EXTEND - ENTRY_TTL_THRESHOLD - 1);
    env.ledger()
        .with_mut(|li| li.sequence_number = just_before_threshold);
    client.list_nft(&seller, &nft, &token_id, &101);
    let ttl = env.as_contract(&contract_id, || env.storage().persistent().get_ttl(&key));
    assert_eq!(
        ttl,
        ENTRY_TTL_THRESHOLD + 1,
        "must not re-extend before threshold"
    );

    env.ledger()
        .with_mut(|li| li.sequence_number = just_before_threshold + 1);
    client.list_nft(&seller, &nft, &token_id, &102);
    let ttl = env.as_contract(&contract_id, || env.storage().persistent().get_ttl(&key));
    assert_eq!(ttl, ENTRY_TTL_EXTEND, "must re-extend at/past threshold");
}
