//! NFT Marketplace Soroban Contract for Galaxy DevKit
//!
//! Escrow-free listing marketplace with collateralized bidding.
//!
//! ### Listing / buying
//! A seller lists an NFT by giving the marketplace contract a standing
//! per-token approval on the NFT contract (`approve`) before calling
//! `list_nft`; `list_nft` verifies both ownership and that approval exist,
//! so a listing can never be created for a token the caller doesn't
//! control. `buy_nft` then moves payment buyer -> seller (minus the
//! marketplace fee) and moves the NFT seller -> buyer using that standing
//! approval, in a single atomic invocation: if either leg fails the whole
//! call reverts and the listing is untouched.
//!
//! ### Bidding
//! `place_bid` escrows the bid amount into the marketplace contract
//! immediately, so every open bid is fully collateralized. `accept_bid`
//! settles from that escrow; `cancel_bid` refunds it.
//!
//! ### Fees
//! `fee = ceil(price * fee_bps / 10_000)`, deducted from the payment leg
//! and routed to the configured fee recipient.
//!
//! ### Expected NFT contract interface
//! `owner_of`, `get_approved`, `transfer_from` — the standard
//! approve/transfer_from shape used by Soroban NFT templates (see
//! `NftInterface` below).

#![no_std]

use soroban_sdk::{
    contract, contractclient, contractimpl, contracttype, symbol_short, token, Address, Env,
    Symbol,
};

// ---------------------------------------------------------------------------
// TTL constants. ~1 ledger ≈ 5 seconds.
// ---------------------------------------------------------------------------

const ENTRY_TTL_THRESHOLD: u32 = 60_480; // ~3.5 days
const ENTRY_TTL_EXTEND: u32 = 120_960; // ~7 days

/// The contract instance itself is a ledger entry with its own TTL; if it
/// archives, the contract is uncallable regardless of listing/bid freshness.
const INSTANCE_TTL_THRESHOLD: u32 = 60_480; // ~3.5 days
const INSTANCE_TTL_EXTEND: u32 = 120_960; // ~7 days

// ---------------------------------------------------------------------------
// Instance storage keys (marketplace configuration)
// ---------------------------------------------------------------------------

const ADMIN: Symbol = symbol_short!("ADMIN");
const TOKEN: Symbol = symbol_short!("TOKEN");
const FEE_RCPT: Symbol = symbol_short!("FEE_RCPT");
const FEE_BPS: Symbol = symbol_short!("FEE_BPS");

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
    Listing(Address, u32),      // nft_contract, token_id
    Bid(Address, u32, Address), // nft_contract, token_id, bidder
}

/// Minimal interface expected of the NFT contract being traded — the
/// standard approve/transfer_from shape used by Soroban NFT templates.
/// The marketplace never takes custody of the NFT itself; it relies on a
/// per-token approval granted to `env.current_contract_address()` before
/// `list_nft` is called.
#[contractclient(name = "NftClient")]
pub trait NftInterface {
    fn owner_of(env: Env, token_id: u32) -> Address;
    fn get_approved(env: Env, token_id: u32) -> Option<Address>;
    fn transfer_from(env: Env, spender: Address, from: Address, to: Address, token_id: u32);
}

#[contractimpl]
impl NftMarketplaceContract {
    // -----------------------------------------------------------------------
    // Initialization
    // -----------------------------------------------------------------------

    /// One-time marketplace configuration. Panics on re-initialization.
    ///
    /// # Security: must be called atomically with deployment
    /// This function has no caller-authorization check of its own — by
    /// design, since there is no meaningful authority to check against
    /// before the contract has any state. That means a bare, standalone
    /// call to `initialize` right after deployment is front-runnable:
    /// whoever's transaction reaches it first permanently owns `admin`.
    /// Adding `admin.require_auth()` here would NOT fix this, since an
    /// attacker simply signs as the `admin` address they themselves pass
    /// in — the check would authenticate the attacker against their own
    /// chosen identity.
    ///
    /// The real mitigation lives outside this file: deploy exclusively
    /// through `marketplace-factory`'s `deploy_marketplace`, which
    /// deploys this contract and calls `initialize` in the same
    /// invocation. Sub-calls within one Soroban invocation are atomic
    /// with respect to the rest of the network, so there is no window
    /// between "the contract exists" and "the contract is configured"
    /// for a third party's transaction to land in. Never deploy this
    /// contract directly and call `initialize` as a separate, later
    /// transaction.
    ///
    /// * `admin`         – can update the fee.
    /// * `payment_token` – SEP-41 / SAC token every listing is priced and
    ///                     settled in.
    /// * `fee_recipient` – receives the marketplace cut of every sale.
    /// * `fee_bps`       – marketplace fee in basis points (0-10000).
    pub fn initialize(
        env: Env,
        admin: Address,
        payment_token: Address,
        fee_recipient: Address,
        fee_bps: i128,
    ) {
        let storage = env.storage().instance();
        if storage.has(&ADMIN) {
            panic!("already initialized");
        }
        if !(0..=10_000).contains(&fee_bps) {
            panic!("fee_bps must be between 0 and 10000");
        }
        storage.set(&ADMIN, &admin);
        storage.set(&TOKEN, &payment_token);
        storage.set(&FEE_RCPT, &fee_recipient);
        storage.set(&FEE_BPS, &fee_bps);
        storage.extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
    }

    /// Update the marketplace fee. Admin only.
    pub fn set_fee(env: Env, fee_bps: i128) {
        if !(0..=10_000).contains(&fee_bps) {
            panic!("fee_bps must be between 0 and 10000");
        }
        let storage = env.storage().instance();
        let admin: Address = storage.get(&ADMIN).expect("not initialized");
        admin.require_auth();
        storage.set(&FEE_BPS, &fee_bps);
        storage.extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);
    }

    // -----------------------------------------------------------------------
    // Listing
    // -----------------------------------------------------------------------

    pub fn list_nft(env: Env, seller: Address, nft: Address, token_id: u32, price: i128) {
        seller.require_auth();
        if price <= 0 {
            panic!("Price must be positive");
        }

        // A listing must be backed by real ownership and a standing
        // approval, otherwise buy_nft's transfer_from would either fail
        // deep inside the NFT contract with a confusing error, or (worse)
        // this would let anyone list a token they don't control.
        let nft_client = NftClient::new(&env, &nft);
        let owner = nft_client.owner_of(&token_id);
        if owner != seller {
            panic!("seller does not own this NFT");
        }
        let marketplace = env.current_contract_address();
        let approved = nft_client.get_approved(&token_id);
        if approved != Some(marketplace) {
            panic!("marketplace not approved to transfer this NFT");
        }

        let key = DataKey::Listing(nft.clone(), token_id);
        env.storage().persistent().set(
            &key,
            &Listing {
                seller: seller.clone(),
                price,
            },
        );
        env.storage()
            .persistent()
            .extend_ttl(&key, ENTRY_TTL_THRESHOLD, ENTRY_TTL_EXTEND);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);

        env.events()
            .publish((symbol_short!("list"), nft, token_id), (seller, price));
    }

    /// Delist. Nothing to refund here — a listing never holds escrow — but
    /// callers (indexers, UIs) still need to know it happened.
    pub fn cancel_listing(env: Env, seller: Address, nft: Address, token_id: u32) {
        seller.require_auth();
        let key = DataKey::Listing(nft.clone(), token_id);
        let listing: Listing = env
            .storage()
            .persistent()
            .get(&key)
            .expect("NFT not listed");
        if listing.seller != seller {
            panic!("Not the seller");
        }
        env.storage().persistent().remove(&key);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);

        env.events()
            .publish((symbol_short!("cancel"), nft, token_id), seller);
    }

    // -----------------------------------------------------------------------
    // Buying
    // -----------------------------------------------------------------------

    pub fn buy_nft(env: Env, buyer: Address, nft: Address, token_id: u32) {
        buyer.require_auth();

        let key = DataKey::Listing(nft.clone(), token_id);
        let listing: Listing = env
            .storage()
            .persistent()
            .get(&key)
            .expect("NFT not listed");
        env.storage()
            .persistent()
            .extend_ttl(&key, ENTRY_TTL_THRESHOLD, ENTRY_TTL_EXTEND);

        let (fee, seller_amount) = Self::split_price(&env, listing.price);
        let payment_token = Self::payment_token(&env);
        let token_client = token::Client::new(&env, &payment_token);

        // 1. Payment: buyer -> fee recipient, buyer -> seller. A SAC
        //    transfer panics on insufficient balance, which reverts the
        //    whole transaction and leaves the listing untouched.
        if fee > 0 {
            let fee_recipient = Self::fee_recipient(&env);
            token_client.transfer(&buyer, &fee_recipient, &fee);
        }
        token_client.transfer(&buyer, &listing.seller, &seller_amount);

        // 2. NFT: seller -> buyer, via the standing approval checked at
        //    list_nft time. If the seller no longer holds the token (or
        //    revoked the approval), this panics and rolls back the
        //    payment leg above along with it.
        let nft_client = NftClient::new(&env, &nft);
        nft_client.transfer_from(
            &env.current_contract_address(),
            &listing.seller,
            &buyer,
            &token_id,
        );

        // 3. Only remove the listing once both legs have succeeded.
        env.storage().persistent().remove(&key);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);

        env.events().publish(
            (symbol_short!("buy"), nft, token_id),
            (listing.seller, buyer, listing.price),
        );
    }

    // -----------------------------------------------------------------------
    // Bidding
    // -----------------------------------------------------------------------

    /// Place a collateralized bid: `price` is escrowed into the contract
    /// immediately, so every open bid is fully backed. One open bid per
    /// (nft, token_id, bidder) — cancel first to change the amount.
    pub fn place_bid(env: Env, bidder: Address, nft: Address, token_id: u32, price: i128) {
        bidder.require_auth();
        if price <= 0 {
            panic!("Bid must be positive");
        }

        let key = DataKey::Bid(nft.clone(), token_id, bidder.clone());
        if env.storage().persistent().has(&key) {
            panic!("bidder already has an open bid for this listing");
        }

        let payment_token = Self::payment_token(&env);
        let contract_address = env.current_contract_address();
        token::Client::new(&env, &payment_token).transfer(&bidder, &contract_address, &price);

        env.storage().persistent().set(
            &key,
            &Bid {
                bidder: bidder.clone(),
                price,
            },
        );
        env.storage()
            .persistent()
            .extend_ttl(&key, ENTRY_TTL_THRESHOLD, ENTRY_TTL_EXTEND);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);

        env.events()
            .publish((symbol_short!("bid"), nft, token_id), (bidder, price));
    }

    /// Withdraw a bid and refund exactly what was escrowed.
    pub fn cancel_bid(env: Env, bidder: Address, nft: Address, token_id: u32) {
        bidder.require_auth();
        let key = DataKey::Bid(nft.clone(), token_id, bidder.clone());
        let bid: Bid = env
            .storage()
            .persistent()
            .get(&key)
            .expect("Bid not found");

        let payment_token = Self::payment_token(&env);
        let contract_address = env.current_contract_address();
        token::Client::new(&env, &payment_token).transfer(&contract_address, &bidder, &bid.price);

        env.storage().persistent().remove(&key);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);

        env.events()
            .publish((symbol_short!("bidcancel"), nft, token_id), bidder);
    }

    pub fn accept_bid(env: Env, seller: Address, nft: Address, token_id: u32, bidder: Address) {
        seller.require_auth();

        let listing_key = DataKey::Listing(nft.clone(), token_id);
        let listing: Listing = env
            .storage()
            .persistent()
            .get(&listing_key)
            .expect("NFT not listed");
        if listing.seller != seller {
            panic!("Not the seller");
        }
        env.storage().persistent().extend_ttl(
            &listing_key,
            ENTRY_TTL_THRESHOLD,
            ENTRY_TTL_EXTEND,
        );

        let bid_key = DataKey::Bid(nft.clone(), token_id, bidder.clone());
        let bid: Bid = env
            .storage()
            .persistent()
            .get(&bid_key)
            .expect("Bid not found");
        env.storage()
            .persistent()
            .extend_ttl(&bid_key, ENTRY_TTL_THRESHOLD, ENTRY_TTL_EXTEND);

        let (fee, seller_amount) = Self::split_price(&env, bid.price);

        // 1. Payment. The bid amount is already escrowed in the contract
        //    from place_bid, so settlement is an internal transfer, not a
        //    fresh charge against the bidder.
        let payment_token = Self::payment_token(&env);
        let token_client = token::Client::new(&env, &payment_token);
        let contract_address = env.current_contract_address();
        if fee > 0 {
            let fee_recipient = Self::fee_recipient(&env);
            token_client.transfer(&contract_address, &fee_recipient, &fee);
        }
        token_client.transfer(&contract_address, &seller, &seller_amount);

        // 2. NFT: seller -> bidder, via the standing approval.
        let nft_client = NftClient::new(&env, &nft);
        nft_client.transfer_from(&contract_address, &seller, &bidder, &token_id);

        // 3. Remove both records now that settlement is complete.
        env.storage().persistent().remove(&listing_key);
        env.storage().persistent().remove(&bid_key);
        env.storage()
            .instance()
            .extend_ttl(INSTANCE_TTL_THRESHOLD, INSTANCE_TTL_EXTEND);

        env.events().publish(
            (symbol_short!("accept"), nft, token_id),
            (seller, bidder, bid.price),
        );
    }

    // -----------------------------------------------------------------------
    // Internal helpers
    // -----------------------------------------------------------------------

    fn payment_token(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&TOKEN)
            .expect("not initialized")
    }

    fn fee_recipient(env: &Env) -> Address {
        env.storage()
            .instance()
            .get(&FEE_RCPT)
            .expect("not initialized")
    }

    /// `fee = ceil(price * fee_bps / 10_000)`, `seller_amount = price - fee`.
    fn split_price(env: &Env, price: i128) -> (i128, i128) {
        let fee_bps: i128 = env.storage().instance().get(&FEE_BPS).unwrap_or(0);
        let fee = if fee_bps == 0 {
            0
        } else {
            let numerator = price.checked_mul(fee_bps).expect("fee overflow");
            numerator
                .checked_add(9_999)
                .expect("fee overflow")
                .checked_div(10_000)
                .expect("fee div by zero")
        };
        let seller_amount = price.checked_sub(fee).expect("fee exceeds price");
        (fee, seller_amount)
    }
}

#[cfg(test)]
mod test;