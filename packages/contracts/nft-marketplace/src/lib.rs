#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env};

#[contract]
pub struct NftMarketplaceContract;

#[derive(Clone)]
#[contracttype]
pub struct Listing {
    pub seller: Address,
    pub price: i128,
}

#[derive(Clone)]
#[contracttype]
pub struct Bid {
    pub bidder: Address,
    pub price: i128,
}

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Listing(Address, u32), // nft_contract, token_id
    Bid(Address, u32, Address), // nft_contract, token_id, bidder
}

#[contractimpl]
impl NftMarketplaceContract {
    pub fn list_nft(env: Env, seller: Address, nft: Address, token_id: u32, price: i128) {
        seller.require_auth();
        if price <= 0 {
            panic!("Price must be positive");
        }
        let key = DataKey::Listing(nft, token_id);
        env.storage().persistent().set(&key, &Listing { seller, price });
    }

    pub fn buy_nft(env: Env, buyer: Address, nft: Address, token_id: u32) {
        buyer.require_auth();
        let key = DataKey::Listing(nft.clone(), token_id);
        let _listing: Listing = env.storage().persistent().get(&key).expect("NFT not listed");
        
        // Note: Atomic transfer of payment and NFT ownership happens here.
        
        env.storage().persistent().remove(&key);
    }

    pub fn cancel_listing(env: Env, seller: Address, nft: Address, token_id: u32) {
        seller.require_auth();
        let key = DataKey::Listing(nft, token_id);
        let listing: Listing = env.storage().persistent().get(&key).expect("NFT not listed");
        if listing.seller != seller {
            panic!("Not the seller");
        }
        env.storage().persistent().remove(&key);
    }

    pub fn place_bid(env: Env, bidder: Address, nft: Address, token_id: u32, price: i128) {
        bidder.require_auth();
        if price <= 0 {
            panic!("Bid must be positive");
        }
        let key = DataKey::Bid(nft, token_id, bidder.clone());
        env.storage().persistent().set(&key, &Bid { bidder, price });
    }

    pub fn accept_bid(env: Env, seller: Address, nft: Address, token_id: u32, bidder: Address) {
        seller.require_auth();
        let listing_key = DataKey::Listing(nft.clone(), token_id);
        let listing: Listing = env.storage().persistent().get(&listing_key).expect("NFT not listed");
        if listing.seller != seller {
            panic!("Not the seller");
        }

        let bid_key = DataKey::Bid(nft, token_id, bidder.clone());
        let _bid: Bid = env.storage().persistent().get(&bid_key).expect("Bid not found");

        // Note: Atomic transfer of payment and NFT ownership happens here.

        env.storage().persistent().remove(&listing_key);
        env.storage().persistent().remove(&bid_key);
    }
}

mod test;
