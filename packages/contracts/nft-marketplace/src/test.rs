#![cfg(test)]

use super::*;
use soroban_sdk::{testutils::Address as _, Address, Env};

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
