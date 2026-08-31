#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{storage::Persistent as _, Address as _, Ledger},
    token::StellarAssetClient,
};

// ---------------------------------------------------------------------------
// Mock NFT contract used only by these tests. Implements the same
// owner_of / get_approved / transfer_from shape the marketplace expects
// from a real NFT contract (see `NftInterface` in lib.rs), plus `mint` and
// `approve` so tests can set up ownership without a full token standard.
// ---------------------------------------------------------------------------

#[contracttype]
enum NftKey {
    Owner(u32),
    Approved(u32),
}

#[contract]
pub struct MockNft;

#[contractimpl]
impl MockNft {
    // Every function bumps its own instance TTL. This is a test-only mock,
    // not part of the fix under review, but it still needs to survive the
    // large ledger-sequence jumps the TTL tests make — a real NFT contract
    // deployed on-chain would do the same on every invocation.

    pub fn mint(env: Env, to: Address, token_id: u32) {
        let owner_key = NftKey::Owner(token_id);
        env.storage().persistent().set(&owner_key, &to);
        env.storage().persistent().remove(&NftKey::Approved(token_id));
        env.storage()
            .persistent()
            .extend_ttl(&owner_key, ENTRY_TTL_THRESHOLD, ENTRY_TTL_EXTEND);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
    }

    pub fn owner_of(env: Env, token_id: u32) -> Address {
        let owner_key = NftKey::Owner(token_id);
        let owner = env
            .storage()
            .persistent()
            .get(&owner_key)
            .expect("no owner");
        env.storage()
            .persistent()
            .extend_ttl(&owner_key, ENTRY_TTL_THRESHOLD, ENTRY_TTL_EXTEND);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
        owner
    }

    pub fn approve(env: Env, owner: Address, operator: Address, token_id: u32) {
        owner.require_auth();
        let owner_key = NftKey::Owner(token_id);
        let current: Address = env
            .storage()
            .persistent()
            .get(&owner_key)
            .expect("no owner");
        if current != owner {
            panic!("not owner");
        }
        let approved_key = NftKey::Approved(token_id);
        env.storage().persistent().set(&approved_key, &operator);
        env.storage()
            .persistent()
            .extend_ttl(&owner_key, ENTRY_TTL_THRESHOLD, ENTRY_TTL_EXTEND);
        env.storage()
            .persistent()
            .extend_ttl(&approved_key, ENTRY_TTL_THRESHOLD, ENTRY_TTL_EXTEND);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
    }

    pub fn get_approved(env: Env, token_id: u32) -> Option<Address> {
        let approved_key = NftKey::Approved(token_id);
        let approved = env.storage().persistent().get(&approved_key);
        if env.storage().persistent().has(&approved_key) {
            env.storage()
                .persistent()
                .extend_ttl(&approved_key, ENTRY_TTL_THRESHOLD, ENTRY_TTL_EXTEND);
        }
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
        approved
    }

    pub fn transfer_from(env: Env, spender: Address, from: Address, to: Address, token_id: u32) {
        spender.require_auth();
        let owner_key = NftKey::Owner(token_id);
        let owner: Address = env
            .storage()
            .persistent()
            .get(&owner_key)
            .expect("no owner");
        if owner != from {
            panic!("from is not owner");
        }
        let approved_key = NftKey::Approved(token_id);
        let approved: Option<Address> = env.storage().persistent().get(&approved_key);
        if approved != Some(spender) {
            panic!("spender not approved");
        }
        env.storage().persistent().set(&owner_key, &to);
        env.storage().persistent().remove(&approved_key);
        env.storage()
            .persistent()
            .extend_ttl(&owner_key, ENTRY_TTL_THRESHOLD, ENTRY_TTL_EXTEND);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
    }
}

// ---------------------------------------------------------------------------
// Test harness — deliberately holds only owned data (Env + Addresses).
// Clients borrow `&Env`, so they're constructed on demand in each test
// rather than stored, to avoid a self-referential struct.
// ---------------------------------------------------------------------------

struct Setup {
    env: Env,
    market_id: Address,
    nft_id: Address,
    token_id: Address,
    fee_recipient: Address,
}

/// Deploys the marketplace, a mock NFT contract, and a SAC payment token,
/// then initializes the marketplace with `fee_bps`.
///
/// The ledger sequence is fixed at 100 *before* `initialize()` runs, so the
/// marketplace's own instance-TTL clock starts from the same baseline the
/// TTL tests use for "listing time" — otherwise `initialize()`'s TTL
/// extension anchors at sequence 0 (whatever `Env::default()` starts at),
/// `list_nft`'s later extension becomes a threshold no-op because the
/// instance isn't near expiry yet, and a test that jumps forward relative
/// to sequence 100 can sail past an expiration that was actually set
/// relative to sequence 0.
fn setup(fee_bps: i128) -> Setup {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.sequence_number = 100);

    let market_id = env.register_contract(None, NftMarketplaceContract);
    let nft_id = env.register_contract(None, MockNft);

    let admin = Address::generate(&env);
    let fee_recipient = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(admin.clone()).address();

    let market = NftMarketplaceContractClient::new(&env, &market_id);
    market.initialize(&admin, &token_id, &fee_recipient, &fee_bps);

    Setup {
        env,
        market_id,
        nft_id,
        token_id,
        fee_recipient,
    }
}

/// Mints `token_id` to `seller`, approves the marketplace for it, and lists
/// it for `price`.
fn list(s: &Setup, seller: &Address, token_id: u32, price: i128) {
    let nft = MockNftClient::new(&s.env, &s.nft_id);
    nft.mint(seller, &token_id);
    nft.approve(seller, &s.market_id, &token_id);
    NftMarketplaceContractClient::new(&s.env, &s.market_id).list_nft(
        seller,
        &s.nft_id,
        &token_id,
        &price,
    );
}

// ---------------------------------------------------------------------------
// Buying
// ---------------------------------------------------------------------------

#[test]
fn test_buy_nft_transfers_payment_and_nft() {
    let s = setup(250); // 2.5% fee
    let market = NftMarketplaceContractClient::new(&s.env, &s.market_id);
    let nft = MockNftClient::new(&s.env, &s.nft_id);
    let token = token::Client::new(&s.env, &s.token_id);
    let sac = StellarAssetClient::new(&s.env, &s.token_id);

    let seller = Address::generate(&s.env);
    let buyer = Address::generate(&s.env);
    let token_id = 1;
    let price = 1_000_i128;

    sac.mint(&buyer, &2_000);
    list(&s, &seller, token_id, price);

    market.buy_nft(&buyer, &s.nft_id, &token_id);

    // fee = ceil(1000 * 250 / 10000) = 25
    assert_eq!(token.balance(&buyer), 1_000);
    assert_eq!(token.balance(&seller), 975);
    assert_eq!(token.balance(&s.fee_recipient), 25);
    assert_eq!(nft.owner_of(&token_id), buyer);

    // Listing is gone — cancel now fails because there's nothing to cancel.
    assert!(market
        .try_cancel_listing(&seller, &s.nft_id, &token_id)
        .is_err());
}

#[test]
fn test_buy_nft_fails_and_changes_nothing_when_buyer_cannot_pay() {
    let s = setup(0);
    let market = NftMarketplaceContractClient::new(&s.env, &s.market_id);
    let nft = MockNftClient::new(&s.env, &s.nft_id);
    let token = token::Client::new(&s.env, &s.token_id);

    let seller = Address::generate(&s.env);
    let buyer = Address::generate(&s.env);
    let token_id = 1;

    // Buyer is never funded.
    list(&s, &seller, token_id, 1_000);

    let result = market.try_buy_nft(&buyer, &s.nft_id, &token_id);
    assert!(result.is_err());

    // Nothing moved.
    assert_eq!(token.balance(&seller), 0);
    assert_eq!(nft.owner_of(&token_id), seller);
    // Listing is still there — cancel succeeds only if it exists.
    market.cancel_listing(&seller, &s.nft_id, &token_id);
}

#[test]
fn test_buy_nft_fails_when_seller_no_longer_holds_nft() {
    let s = setup(0);
    let market = NftMarketplaceContractClient::new(&s.env, &s.market_id);
    let nft = MockNftClient::new(&s.env, &s.nft_id);
    let token = token::Client::new(&s.env, &s.token_id);
    let sac = StellarAssetClient::new(&s.env, &s.token_id);

    let seller = Address::generate(&s.env);
    let someone_else = Address::generate(&s.env);
    let buyer = Address::generate(&s.env);
    let token_id = 1;

    sac.mint(&buyer, &2_000);
    list(&s, &seller, token_id, 1_000);

    // Seller's NFT moves out from under the listing (e.g. traded elsewhere).
    nft.mint(&someone_else, &token_id);

    let result = market.try_buy_nft(&buyer, &s.nft_id, &token_id);
    assert!(result.is_err());
    assert_eq!(token.balance(&buyer), 2_000);
    assert_eq!(nft.owner_of(&token_id), someone_else);
}

// ---------------------------------------------------------------------------
// Listing
// ---------------------------------------------------------------------------

#[test]
fn test_list_nft_requires_ownership_and_approval() {
    let s = setup(0);
    let market = NftMarketplaceContractClient::new(&s.env, &s.market_id);
    let nft = MockNftClient::new(&s.env, &s.nft_id);

    let seller = Address::generate(&s.env);
    let impostor = Address::generate(&s.env);
    let token_id = 1;

    nft.mint(&seller, &token_id);
    // No approval yet — must fail.
    let result = market.try_list_nft(&seller, &s.nft_id, &token_id, &100);
    assert!(result.is_err());

    nft.approve(&seller, &s.market_id, &token_id);
    // Approved, but caller isn't the owner — must fail.
    let result = market.try_list_nft(&impostor, &s.nft_id, &token_id, &100);
    assert!(result.is_err());

    // Owner + approval present — succeeds.
    market.list_nft(&seller, &s.nft_id, &token_id, &100);
}

#[test]
fn test_cancel_listing() {
    let s = setup(0);
    let market = NftMarketplaceContractClient::new(&s.env, &s.market_id);
    let seller = Address::generate(&s.env);
    let token_id = 1;
    list(&s, &seller, token_id, 100);
    market.cancel_listing(&seller, &s.nft_id, &token_id);
}

// ---------------------------------------------------------------------------
// Bidding
// ---------------------------------------------------------------------------

#[test]
fn test_place_bid_escrows_funds_and_cancel_bid_refunds() {
    let s = setup(0);
    let market = NftMarketplaceContractClient::new(&s.env, &s.market_id);
    let token = token::Client::new(&s.env, &s.token_id);
    let sac = StellarAssetClient::new(&s.env, &s.token_id);

    let seller = Address::generate(&s.env);
    let bidder = Address::generate(&s.env);
    let token_id = 1;

    sac.mint(&bidder, &500);
    list(&s, &seller, token_id, 1_000);

    market.place_bid(&bidder, &s.nft_id, &token_id, &200);
    assert_eq!(token.balance(&bidder), 300);
    assert_eq!(token.balance(&s.market_id), 200);

    market.cancel_bid(&bidder, &s.nft_id, &token_id);
    assert_eq!(token.balance(&bidder), 500);
    assert_eq!(token.balance(&s.market_id), 0);
}

#[test]
fn test_accept_bid_settles_at_bid_price_and_removes_both_records() {
    let s = setup(500); // 5%
    let market = NftMarketplaceContractClient::new(&s.env, &s.market_id);
    let nft = MockNftClient::new(&s.env, &s.nft_id);
    let token = token::Client::new(&s.env, &s.token_id);
    let sac = StellarAssetClient::new(&s.env, &s.token_id);

    let seller = Address::generate(&s.env);
    let bidder = Address::generate(&s.env);
    let token_id = 1;
    let listing_price = 1_000_i128;
    let bid_price = 800_i128;

    sac.mint(&bidder, &bid_price);
    list(&s, &seller, token_id, listing_price);
    market.place_bid(&bidder, &s.nft_id, &token_id, &bid_price);

    market.accept_bid(&seller, &s.nft_id, &token_id, &bidder);

    // fee = ceil(800 * 500 / 10000) = 40
    assert_eq!(token.balance(&seller), 760);
    assert_eq!(token.balance(&s.fee_recipient), 40);
    assert_eq!(token.balance(&bidder), 0);
    assert_eq!(token.balance(&s.market_id), 0);
    assert_eq!(nft.owner_of(&token_id), bidder);

    // Both records gone — cancelling either now fails.
    assert!(market
        .try_cancel_listing(&seller, &s.nft_id, &token_id)
        .is_err());
    assert!(market
        .try_cancel_bid(&bidder, &s.nft_id, &token_id)
        .is_err());
}

// ---------------------------------------------------------------------------
// TTL bookkeeping (unchanged behavior, still enforced)
// ---------------------------------------------------------------------------

#[test]
fn test_list_nft_sets_entry_ttl() {
    let s = setup(0);
    s.env.ledger().with_mut(|li| li.sequence_number = 100);
    let seller = Address::generate(&s.env);
    let token_id = 1;
    list(&s, &seller, token_id, 100);

    let key = DataKey::Listing(s.nft_id.clone(), token_id);
    let ttl = s
        .env
        .as_contract(&s.market_id, || s.env.storage().persistent().get_ttl(&key));
    assert_eq!(ttl, ENTRY_TTL_EXTEND);
}

#[test]
fn test_place_bid_sets_entry_ttl() {
    let s = setup(0);
    s.env.ledger().with_mut(|li| li.sequence_number = 100);
    let market = NftMarketplaceContractClient::new(&s.env, &s.market_id);
    let sac = StellarAssetClient::new(&s.env, &s.token_id);

    let seller = Address::generate(&s.env);
    let bidder = Address::generate(&s.env);
    let token_id = 1;
    sac.mint(&bidder, &90);
    list(&s, &seller, token_id, 100);
    market.place_bid(&bidder, &s.nft_id, &token_id, &90);

    let key = DataKey::Bid(s.nft_id.clone(), token_id, bidder);
    let ttl = s
        .env
        .as_contract(&s.market_id, || s.env.storage().persistent().get_ttl(&key));
    assert_eq!(ttl, ENTRY_TTL_EXTEND);
}

#[test]
fn test_listing_survives_past_initial_extend_window_with_no_further_writes() {
    let s = setup(0);
    s.env.ledger().with_mut(|li| li.sequence_number = 100);
    let market = NftMarketplaceContractClient::new(&s.env, &s.market_id);
    let sac = StellarAssetClient::new(&s.env, &s.token_id);

    let seller = Address::generate(&s.env);
    let buyer = Address::generate(&s.env);
    let token_id = 1;
    sac.mint(&buyer, &100);
    list(&s, &seller, token_id, 100);

    s.env
        .ledger()
        .with_mut(|li| li.sequence_number = 100 + ENTRY_TTL_EXTEND - 1);

    market.buy_nft(&buyer, &s.nft_id, &token_id);
}

#[test]
fn test_entry_ttl_boundary_behavior() {
    let s = setup(0);
    s.env.ledger().with_mut(|li| li.sequence_number = 100);
    let market = NftMarketplaceContractClient::new(&s.env, &s.market_id);
    let seller = Address::generate(&s.env);
    let token_id = 1;
    let key = DataKey::Listing(s.nft_id.clone(), token_id);

    list(&s, &seller, token_id, 100);

    let just_before_threshold = 100 + (ENTRY_TTL_EXTEND - ENTRY_TTL_THRESHOLD - 1);
    s.env
        .ledger()
        .with_mut(|li| li.sequence_number = just_before_threshold);
    market.list_nft(&seller, &s.nft_id, &token_id, &101);
    let ttl = s
        .env
        .as_contract(&s.market_id, || s.env.storage().persistent().get_ttl(&key));
    assert_eq!(ttl, ENTRY_TTL_THRESHOLD + 1, "must not re-extend before threshold");

    s.env
        .ledger()
        .with_mut(|li| li.sequence_number = just_before_threshold + 1);
    market.list_nft(&seller, &s.nft_id, &token_id, &102);
    let ttl = s
        .env
        .as_contract(&s.market_id, || s.env.storage().persistent().get_ttl(&key));
    assert_eq!(ttl, ENTRY_TTL_EXTEND, "must re-extend at/past threshold");
}