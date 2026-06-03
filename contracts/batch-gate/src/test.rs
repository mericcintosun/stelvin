#![cfg(test)]

extern crate std;

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Address, Bytes, BytesN, Env, Vec,
};

// A minimal mock relay implementing only what BatchGate calls: get() / latest().
mod mock_relay {
    use soroban_sdk::{contract, contractimpl, BytesN, Env};

    #[contract]
    pub struct MockRelay;

    #[contractimpl]
    impl MockRelay {
        /// Set the stored sha256(sigma) for a round.
        pub fn set(env: Env, round: u64, rand: BytesN<32>) {
            env.storage().persistent().set(&round, &rand);
        }

        pub fn get(env: Env, round: u64) -> Option<BytesN<32>> {
            env.storage().persistent().get(&round)
        }

        pub fn latest(_env: Env) -> Option<(u64, BytesN<32>)> {
            None
        }
    }
}

struct Setup {
    env: Env,
    contract: BatchGateClient<'static>,
    relay_id: Address,
    base: Address,
    quote: Address,
    base_admin: token::StellarAssetClient<'static>,
    quote_admin: token::StellarAssetClient<'static>,
    admin: Address,
}

fn setup() -> Setup {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| {
        l.timestamp = QUICKNET_GENESIS + 3_000; // ~round 1000
    });

    let admin = Address::generate(&env);

    // Two SAC tokens (base = X, quote = USDC).
    let base_sac = env.register_stellar_asset_contract_v2(admin.clone());
    let quote_sac = env.register_stellar_asset_contract_v2(admin.clone());
    let base = base_sac.address();
    let quote = quote_sac.address();
    let base_admin = token::StellarAssetClient::new(&env, &base);
    let quote_admin = token::StellarAssetClient::new(&env, &quote);

    let relay_id = env.register(mock_relay::MockRelay, ());

    let contract_id = env.register(
        BatchGate,
        (admin.clone(), base.clone(), quote.clone(), relay_id.clone()),
    );
    let contract = BatchGateClient::new(&env, &contract_id);

    Setup {
        env,
        contract,
        relay_id,
        base,
        quote,
        base_admin,
        quote_admin,
        admin,
    }
}

fn relay_set(s: &Setup, round: u64, rand: &BytesN<32>) {
    let client = mock_relay::MockRelayClient::new(&s.env, &s.relay_id);
    client.set(&round, rand);
}

fn revealed(_env: &Env, order_id: u64, side: Side, amount: i128, price: i128) -> Revealed {
    Revealed {
        order_id,
        side,
        amount,
        limit_price: price,
    }
}

#[test]
fn test_deposit_withdraw() {
    let s = setup();
    let alice = Address::generate(&s.env);
    s.base_admin.mint(&alice, &1_000);

    s.contract.deposit_funds(&alice, &s.base, &600);
    assert_eq!(s.contract.get_balance(&alice, &s.base), 600);

    s.contract.withdraw(&alice, &s.base, &100);
    assert_eq!(s.contract.get_balance(&alice, &s.base), 500);
}

#[test]
fn test_full_batch_clears_uniform_price() {
    let s = setup();
    let env = &s.env;

    let buyer = Address::generate(env);
    let seller = Address::generate(env);

    // Fund: buyer holds USDC, seller holds X. Generous funding → r = 1.
    s.quote_admin.mint(&buyer, &1_000_000);
    s.base_admin.mint(&seller, &1_000_000);
    s.contract.deposit_funds(&buyer, &s.quote, &1_000_000);
    s.contract.deposit_funds(&seller, &s.base, &1_000_000);

    // Open a batch ~12 rounds ahead.
    let reveal_round = est_current_round(env) + FUTURE_ROUND_BUFFER + 1;
    let batch_id = s.contract.create_batch(&reveal_round);

    // Submit two (ciphertext is opaque here).
    let ct = Bytes::from_slice(env, b"ciphertext");
    let buy_id = s.contract.submit_order(&buyer, &batch_id, &ct);
    let sell_id = s.contract.submit_order(&seller, &batch_id, &ct);

    // Reveal: buyer bids 1.2, seller asks 0.8 → crosses; 100 base each.
    // price scaled by 1e7.
    let buy = revealed(env, buy_id, Side::Buy, 100, 12_000_000);
    let sell = revealed(env, sell_id, Side::Sell, 100, 8_000_000);
    let mut reveal: Vec<Revealed> = Vec::new(env);
    reveal.push_back(buy);
    reveal.push_back(sell);

    // Make round R available with arbitrary sigma; relay stores sha256(sigma).
    let sigma = BytesN::from_array(env, &[7u8; 48]);
    let sig_bytes = Bytes::from_slice(env, &sigma.to_array());
    let rand: BytesN<32> = env.crypto().sha256(&sig_bytes).into();
    relay_set(&s, reveal_round, &rand);

    // Advance ledger past reveal time so submit-window logic is consistent.
    env.ledger().with_mut(|l| {
        l.timestamp = QUICKNET_GENESIS + (reveal_round + 5) * QUICKNET_PERIOD_SECS;
    });

    s.contract.settle(&batch_id, &sigma, &reveal);

    let clearing = s.contract.get_clearing(&batch_id).unwrap();
    assert_eq!(clearing.matched_volume, 100, "100 base should trade");
    // Clearing price is one of the limit prices that maximizes matched volume.
    assert!(
        clearing.price == 8_000_000 || clearing.price == 12_000_000,
        "price must be a crossing limit"
    );

    let p = clearing.price;
    let quote_moved = 100 * p / PRICE_SCALE;

    // Conservation: base out of seller == base into buyer == 100.
    assert_eq!(s.contract.get_balance(&buyer, &s.base), 100);
    assert_eq!(s.contract.get_balance(&seller, &s.base), 1_000_000 - 100);
    // Quote: buyer paid, seller received the same (floor == exact here).
    assert_eq!(s.contract.get_balance(&buyer, &s.quote), 1_000_000 - quote_moved);
    assert_eq!(s.contract.get_balance(&seller, &s.quote), quote_moved);

    let batch = s.contract.get_batch(&batch_id).unwrap();
    assert!(matches!(batch.status, Status::Settled));
}

#[test]
#[should_panic(expected = "reveal round not yet available")]
fn test_settle_before_round_rejected() {
    let s = setup();
    let env = &s.env;
    let buyer = Address::generate(env);
    s.quote_admin.mint(&buyer, &1_000);
    s.contract.deposit_funds(&buyer, &s.quote, &1_000);

    let reveal_round = est_current_round(env) + FUTURE_ROUND_BUFFER + 1;
    let batch_id = s.contract.create_batch(&reveal_round);
    let ct = Bytes::from_slice(env, b"ct");
    let buy_id = s.contract.submit_order(&buyer, &batch_id, &ct);

    let mut reveal: Vec<Revealed> = Vec::new(env);
    reveal.push_back(revealed(env, buy_id, Side::Buy, 10, 10_000_000));

    // Round R never set in relay → settle must reject.
    let sigma = BytesN::from_array(env, &[1u8; 48]);
    s.contract.settle(&batch_id, &sigma, &reveal);
}

#[test]
#[should_panic(expected = "does not match")]
fn test_settle_wrong_sigma_rejected() {
    let s = setup();
    let env = &s.env;
    let buyer = Address::generate(env);
    s.quote_admin.mint(&buyer, &1_000);
    s.contract.deposit_funds(&buyer, &s.quote, &1_000);

    let reveal_round = est_current_round(env) + FUTURE_ROUND_BUFFER + 1;
    let batch_id = s.contract.create_batch(&reveal_round);
    let ct = Bytes::from_slice(env, b"ct");
    let buy_id = s.contract.submit_order(&buyer, &batch_id, &ct);

    let mut reveal: Vec<Revealed> = Vec::new(env);
    reveal.push_back(revealed(env, buy_id, Side::Buy, 10, 10_000_000));

    // Relay commits to sha256 of the REAL sigma...
    let real_sigma = BytesN::from_array(env, &[7u8; 48]);
    let sig_bytes = Bytes::from_slice(env, &real_sigma.to_array());
    let rand: BytesN<32> = env.crypto().sha256(&sig_bytes).into();
    relay_set(&s, reveal_round, &rand);

    // ...but settler supplies a different sigma → key check fails.
    let wrong_sigma = BytesN::from_array(env, &[9u8; 48]);
    s.contract.settle(&batch_id, &wrong_sigma, &reveal);
}

#[test]
fn test_unfunded_cannot_submit() {
    let s = setup();
    let env = &s.env;
    let nobody = Address::generate(env);
    let reveal_round = est_current_round(env) + FUTURE_ROUND_BUFFER + 1;
    let batch_id = s.contract.create_batch(&reveal_round);
    let ct = Bytes::from_slice(env, b"ct");

    let res = s.contract.try_submit_order(&nobody, &batch_id, &ct);
    assert!(res.is_err(), "unfunded trader must not submit");
}

/// Arm the relay for `reveal_round` (store sha256(sigma)) and advance the
/// ledger past reveal time. Returns the sigma the settler must supply.
fn arm_relay(s: &Setup, reveal_round: u64) -> BytesN<48> {
    let sigma = BytesN::from_array(&s.env, &[7u8; 48]);
    let sig_bytes = Bytes::from_slice(&s.env, &sigma.to_array());
    let rand: BytesN<32> = s.env.crypto().sha256(&sig_bytes).into();
    relay_set(s, reveal_round, &rand);
    s.env.ledger().with_mut(|l| {
        l.timestamp = QUICKNET_GENESIS + (reveal_round + 5) * QUICKNET_PERIOD_SECS;
    });
    sigma
}

/// Two buyers (demand 200) vs one seller (supply 100): the long side is
/// pro-rated. The ledger must conserve base exactly across the split.
#[test]
fn test_prorata_conservation() {
    let s = setup();
    let env = &s.env;
    let b1 = Address::generate(env);
    let b2 = Address::generate(env);
    let seller = Address::generate(env);

    s.quote_admin.mint(&b1, &1_000);
    s.quote_admin.mint(&b2, &1_000);
    s.base_admin.mint(&seller, &1_000);
    s.contract.deposit_funds(&b1, &s.quote, &1_000);
    s.contract.deposit_funds(&b2, &s.quote, &1_000);
    s.contract.deposit_funds(&seller, &s.base, &1_000);

    let reveal_round = est_current_round(env) + FUTURE_ROUND_BUFFER + 1;
    let batch_id = s.contract.create_batch(&reveal_round);
    let ct = Bytes::from_slice(env, b"ct");
    let id1 = s.contract.submit_order(&b1, &batch_id, &ct);
    let id2 = s.contract.submit_order(&b2, &batch_id, &ct);
    let id3 = s.contract.submit_order(&seller, &batch_id, &ct);

    // All at price 1.0 (1e7). demand = 200, supply = 100, M = 100.
    let mut reveal: Vec<Revealed> = Vec::new(env);
    reveal.push_back(revealed(env, id1, Side::Buy, 100, 10_000_000));
    reveal.push_back(revealed(env, id2, Side::Buy, 100, 10_000_000));
    reveal.push_back(revealed(env, id3, Side::Sell, 100, 10_000_000));

    let sigma = arm_relay(&s, reveal_round);
    s.contract.settle(&batch_id, &sigma, &reveal);

    let c = s.contract.get_clearing(&batch_id).unwrap();
    assert_eq!(c.matched_volume, 100, "100 base trades");
    assert_eq!(c.price, 10_000_000);

    // Each buyer pro-rated to 50; seller delivers 100. Base conserved exactly.
    let b1_base = s.contract.get_balance(&b1, &s.base);
    let b2_base = s.contract.get_balance(&b2, &s.base);
    let seller_base_out = 1_000 - s.contract.get_balance(&seller, &s.base);
    assert_eq!(b1_base + b2_base, seller_base_out, "base conserved");
    assert_eq!(b1_base + b2_base, 100);
    assert_eq!(b1_base, 50);
    assert_eq!(b2_base, 50);

    // Quote conserved: buyers paid == seller received.
    let paid = (1_000 - s.contract.get_balance(&b1, &s.quote))
        + (1_000 - s.contract.get_balance(&b2, &s.quote));
    let received = s.contract.get_balance(&seller, &s.quote);
    assert_eq!(paid, received, "quote conserved");
    assert_eq!(received, 100);
}

/// An underfunded buyer forces the global feasibility scalar r < 1: BOTH sides
/// scale down together, so the ledger stays balanced and nobody goes negative.
#[test]
fn test_feasibility_scaling_conserves() {
    let s = setup();
    let env = &s.env;
    let buyer = Address::generate(env);
    let seller = Address::generate(env);

    // Buyer can only afford 30 base at price 1.0; seller has plenty.
    s.quote_admin.mint(&buyer, &30);
    s.base_admin.mint(&seller, &1_000);
    s.contract.deposit_funds(&buyer, &s.quote, &30);
    s.contract.deposit_funds(&seller, &s.base, &1_000);

    let reveal_round = est_current_round(env) + FUTURE_ROUND_BUFFER + 1;
    let batch_id = s.contract.create_batch(&reveal_round);
    let ct = Bytes::from_slice(env, b"ct");
    let bid = s.contract.submit_order(&buyer, &batch_id, &ct);
    let sid = s.contract.submit_order(&seller, &batch_id, &ct);

    // Buyer wants 100 @ 1.0 but only funds 30 → r = 0.3 → traded = 30.
    let mut reveal: Vec<Revealed> = Vec::new(env);
    reveal.push_back(revealed(env, bid, Side::Buy, 100, 10_000_000));
    reveal.push_back(revealed(env, sid, Side::Sell, 100, 10_000_000));

    let sigma = arm_relay(&s, reveal_round);
    s.contract.settle(&batch_id, &sigma, &reveal);

    let c = s.contract.get_clearing(&batch_id).unwrap();
    assert_eq!(c.matched_volume, 30, "feasibility-scaled to 30 base");

    // Buyer: spent all 30 quote, holds 30 base. Seller: gave 30 base, got 30 quote.
    assert_eq!(s.contract.get_balance(&buyer, &s.base), 30);
    assert_eq!(s.contract.get_balance(&buyer, &s.quote), 0);
    assert_eq!(s.contract.get_balance(&seller, &s.base), 1_000 - 30);
    assert_eq!(s.contract.get_balance(&seller, &s.quote), 30);
    // No balance ever negative (asserted implicitly by no panic).
}

#[test]
fn test_no_cross_no_trade() {
    let s = setup();
    let env = &s.env;
    let buyer = Address::generate(env);
    let seller = Address::generate(env);
    s.quote_admin.mint(&buyer, &1_000);
    s.base_admin.mint(&seller, &1_000);
    s.contract.deposit_funds(&buyer, &s.quote, &1_000);
    s.contract.deposit_funds(&seller, &s.base, &1_000);

    let reveal_round = est_current_round(env) + FUTURE_ROUND_BUFFER + 1;
    let batch_id = s.contract.create_batch(&reveal_round);
    let ct = Bytes::from_slice(env, b"ct");
    let bid = s.contract.submit_order(&buyer, &batch_id, &ct);
    let sid = s.contract.submit_order(&seller, &batch_id, &ct);

    // Buyer bids 0.8, seller asks 1.2 → no cross.
    let mut reveal: Vec<Revealed> = Vec::new(env);
    reveal.push_back(revealed(env, bid, Side::Buy, 100, 8_000_000));
    reveal.push_back(revealed(env, sid, Side::Sell, 100, 12_000_000));

    let sigma = arm_relay(&s, reveal_round);
    s.contract.settle(&batch_id, &sigma, &reveal);

    let c = s.contract.get_clearing(&batch_id).unwrap();
    assert_eq!(c.matched_volume, 0, "no trade");
    assert_eq!(s.contract.get_balance(&buyer, &s.quote), 1_000);
    assert_eq!(s.contract.get_balance(&seller, &s.base), 1_000);
}

/// Two tightly/oddly funded buyers + one seller, deliberately chosen so the
/// feasibility scalar binds and per-order flooring/rounding kicks in. The
/// floor-then-trim engine must NOT revert and must keep the ledger conserved.
#[test]
fn test_underfunded_multi_no_revert_and_conserved() {
    let s = setup();
    let env = &s.env;
    let b1 = Address::generate(env);
    let b2 = Address::generate(env);
    let seller = Address::generate(env);

    // Odd, tight quote funding to force rounding on the binding side.
    s.quote_admin.mint(&b1, &37);
    s.quote_admin.mint(&b2, &53);
    s.base_admin.mint(&seller, &1_000);
    s.contract.deposit_funds(&b1, &s.quote, &37);
    s.contract.deposit_funds(&b2, &s.quote, &53);
    s.contract.deposit_funds(&seller, &s.base, &1_000);

    let reveal_round = est_current_round(env) + FUTURE_ROUND_BUFFER + 1;
    let batch_id = s.contract.create_batch(&reveal_round);
    let ct = Bytes::from_slice(env, b"ct");
    let id1 = s.contract.submit_order(&b1, &batch_id, &ct);
    let id2 = s.contract.submit_order(&b2, &batch_id, &ct);
    let id3 = s.contract.submit_order(&seller, &batch_id, &ct);

    // Price 1.3 (1.3e7); both buyers want 100, seller offers 300.
    let mut reveal: Vec<Revealed> = Vec::new(env);
    reveal.push_back(revealed(env, id1, Side::Buy, 100, 13_000_000));
    reveal.push_back(revealed(env, id2, Side::Buy, 100, 13_000_000));
    reveal.push_back(revealed(env, id3, Side::Sell, 300, 13_000_000));

    let sigma = arm_relay(&s, reveal_round);
    // Must not revert despite tight, indivisible funding.
    s.contract.settle(&batch_id, &sigma, &reveal);

    // Conservation: base out of seller == base into buyers.
    let base_in = s.contract.get_balance(&b1, &s.base) + s.contract.get_balance(&b2, &s.base);
    let base_out = 1_000 - s.contract.get_balance(&seller, &s.base);
    assert_eq!(base_in, base_out, "base conserved exactly");

    // Quote pool can only retain dust (buyers pay >= seller receives).
    let paid = (37 - s.contract.get_balance(&b1, &s.quote))
        + (53 - s.contract.get_balance(&b2, &s.quote));
    let received = s.contract.get_balance(&seller, &s.quote);
    assert!(paid >= received, "quote pool never goes negative");
    assert!(paid - received <= 2, "quote dust is bounded");

    // No balance went negative (all reads are non-negative i128 by construction).
    assert!(s.contract.get_balance(&b1, &s.quote) >= 0);
    assert!(s.contract.get_balance(&b2, &s.quote) >= 0);
    assert!(s.contract.get_balance(&seller, &s.base) >= 0);
}

#[test]
#[should_panic(expected = "one order per trader per batch")]
fn test_one_order_per_trader_enforced() {
    let s = setup();
    let env = &s.env;
    let trader = Address::generate(env);
    s.quote_admin.mint(&trader, &1_000);
    s.contract.deposit_funds(&trader, &s.quote, &1_000);

    let reveal_round = est_current_round(env) + FUTURE_ROUND_BUFFER + 1;
    let batch_id = s.contract.create_batch(&reveal_round);
    let ct = Bytes::from_slice(env, b"ct");
    let _ = s.contract.submit_order(&trader, &batch_id, &ct);
    // Second order from the same trader in the same batch must be rejected.
    let _ = s.contract.submit_order(&trader, &batch_id, &ct);
}

#[test]
#[should_panic(expected = "duplicate order_id")]
fn test_duplicate_order_id_rejected() {
    let s = setup();
    let env = &s.env;
    let buyer = Address::generate(env);
    let seller = Address::generate(env);
    s.quote_admin.mint(&buyer, &1_000);
    s.base_admin.mint(&seller, &1_000);
    s.contract.deposit_funds(&buyer, &s.quote, &1_000);
    s.contract.deposit_funds(&seller, &s.base, &1_000);

    let reveal_round = est_current_round(env) + FUTURE_ROUND_BUFFER + 1;
    let batch_id = s.contract.create_batch(&reveal_round);
    let ct = Bytes::from_slice(env, b"ct");
    let bid = s.contract.submit_order(&buyer, &batch_id, &ct);
    let sid = s.contract.submit_order(&seller, &batch_id, &ct);

    // Settler tries to count the same buy order twice (weight inflation).
    let mut reveal: Vec<Revealed> = Vec::new(env);
    reveal.push_back(revealed(env, bid, Side::Buy, 100, 10_000_000));
    reveal.push_back(revealed(env, bid, Side::Buy, 100, 10_000_000));
    reveal.push_back(revealed(env, sid, Side::Sell, 100, 10_000_000));

    let sigma = arm_relay(&s, reveal_round);
    s.contract.settle(&batch_id, &sigma, &reveal);
}

#[test]
fn test_admin_is_set() {
    let s = setup();
    // create_batch requires admin auth; with mock_all_auths it passes.
    let reveal_round = est_current_round(&s.env) + FUTURE_ROUND_BUFFER + 1;
    let _ = s.contract.create_batch(&reveal_round);
    let _ = &s.admin;
}

// ── RWA / KYC gate (ADR-017) ────────────────────────────────────────────────

/// Default state is open (permissioned off): an arbitrary funded trader works
/// exactly as before — the gate is fully backward-compatible.
#[test]
fn test_permissioned_default_off_is_open() {
    let s = setup();
    assert!(!s.contract.get_permissioned(), "permissioned defaults to off");
    let alice = Address::generate(&s.env);
    s.quote_admin.mint(&alice, &1_000);
    // No KYC set, permissioned off → deposit succeeds (legacy behavior).
    s.contract.deposit_funds(&alice, &s.quote, &500);
    assert_eq!(s.contract.get_balance(&alice, &s.quote), 500);
}

/// When permissioned is on, an allowlisted (KYC'd) trader can fund and submit.
#[test]
fn test_permissioned_allows_listed() {
    let s = setup();
    let env = &s.env;
    s.contract.set_permissioned(&true);
    assert!(s.contract.get_permissioned());

    let alice = Address::generate(env);
    s.quote_admin.mint(&alice, &1_000);
    s.contract.set_kyc(&alice, &true);
    assert!(s.contract.is_kyc(&alice));

    s.contract.deposit_funds(&alice, &s.quote, &1_000);
    assert_eq!(s.contract.get_balance(&alice, &s.quote), 1_000);

    let reveal_round = est_current_round(env) + FUTURE_ROUND_BUFFER + 1;
    let batch_id = s.contract.create_batch(&reveal_round);
    let ct = Bytes::from_slice(env, b"ct");
    let _ = s.contract.submit_order(&alice, &batch_id, &ct);
}

/// When permissioned is on, a non-allowlisted trader cannot deposit.
#[test]
#[should_panic(expected = "KYC allowlist")]
fn test_permissioned_blocks_unlisted_deposit() {
    let s = setup();
    s.contract.set_permissioned(&true);
    let mallory = Address::generate(&s.env);
    s.quote_admin.mint(&mallory, &1_000);
    s.contract.deposit_funds(&mallory, &s.quote, &500); // not on allowlist → reject
}

/// The submit guard is independent: fund while open, then turn permissioning on
/// without allowlisting the trader → submit is rejected.
#[test]
#[should_panic(expected = "KYC allowlist")]
fn test_permissioned_blocks_unlisted_submit() {
    let s = setup();
    let env = &s.env;
    let mallory = Address::generate(env);
    s.quote_admin.mint(&mallory, &1_000);
    s.contract.deposit_funds(&mallory, &s.quote, &1_000); // permissioned off → ok
    s.contract.set_permissioned(&true); // now on; mallory not allowlisted
    let reveal_round = est_current_round(env) + FUTURE_ROUND_BUFFER + 1;
    let batch_id = s.contract.create_batch(&reveal_round);
    let ct = Bytes::from_slice(env, b"ct");
    s.contract.submit_order(&mallory, &batch_id, &ct);
}

// ── Protocol fee (ADR-018) ──────────────────────────────────────────────────

#[test]
fn test_fee_default_zero() {
    let s = setup();
    assert_eq!(s.contract.get_fee_bps(), 0);
    assert_eq!(s.contract.get_fees(&s.quote), 0);
}

/// A 2% fee is taken from the quote leg only: buyer pays full, seller receives
/// net, the difference accrues to the protocol ledger, base conserves exactly,
/// and the admin can withdraw the accrued fee (capped at the balance).
#[test]
fn test_fee_conserves_accrues_and_withdraws() {
    let s = setup();
    let env = &s.env;
    let buyer = Address::generate(env);
    let seller = Address::generate(env);
    s.quote_admin.mint(&buyer, &1_000_000);
    s.base_admin.mint(&seller, &1_000_000);
    s.contract.deposit_funds(&buyer, &s.quote, &1_000_000);
    s.contract.deposit_funds(&seller, &s.base, &1_000_000);

    s.contract.set_fee_bps(&200u32); // 2%
    assert_eq!(s.contract.get_fee_bps(), 200u32);

    let reveal_round = est_current_round(env) + FUTURE_ROUND_BUFFER + 1;
    let batch_id = s.contract.create_batch(&reveal_round);
    let ct = Bytes::from_slice(env, b"ct");
    let bid = s.contract.submit_order(&buyer, &batch_id, &ct);
    let sid = s.contract.submit_order(&seller, &batch_id, &ct);

    // Price 1.0: buyer pays 100, seller net floor(100*0.98)=98, fee = 2.
    let mut reveal: Vec<Revealed> = Vec::new(env);
    reveal.push_back(revealed(env, bid, Side::Buy, 100, 10_000_000));
    reveal.push_back(revealed(env, sid, Side::Sell, 100, 10_000_000));
    let sigma = arm_relay(&s, reveal_round);
    s.contract.settle(&batch_id, &sigma, &reveal);

    assert_eq!(s.contract.get_balance(&buyer, &s.base), 100, "base conserved to buyer");
    assert_eq!(s.contract.get_balance(&seller, &s.base), 1_000_000 - 100);
    let buyer_quote_out = 1_000_000 - s.contract.get_balance(&buyer, &s.quote);
    let seller_quote_in = s.contract.get_balance(&seller, &s.quote);
    let fee = s.contract.get_fees(&s.quote);
    assert_eq!(buyer_quote_out, 100);
    assert_eq!(seller_quote_in, 98);
    assert_eq!(fee, 2);
    // Conservation: buyers paid == sellers received + protocol fee.
    assert_eq!(buyer_quote_out, seller_quote_in + fee, "quote conserved incl. fee");

    // Admin withdraws the accrued fee to a recipient (real SAC transfer).
    let recipient = Address::generate(env);
    s.contract.withdraw_fees(&recipient, &s.quote, &2);
    assert_eq!(s.contract.get_fees(&s.quote), 0);
    let q = token::TokenClient::new(env, &s.quote);
    assert_eq!(q.balance(&recipient), 2, "fee tokens delivered");
}

#[test]
#[should_panic(expected = "fee_bps exceeds cap")]
fn test_set_fee_bps_cap() {
    let s = setup();
    s.contract.set_fee_bps(&2_000u32);
}

#[test]
#[should_panic(expected = "insufficient accrued fees")]
fn test_withdraw_fees_over_balance() {
    let s = setup();
    let r = Address::generate(&s.env);
    s.contract.withdraw_fees(&r, &s.quote, &1); // nothing accrued yet
}

// ── Overflow caps + randomized conservation (ADR-019) ───────────────────────

/// An order field above the cap is rejected (keeps every product inside i128).
#[test]
#[should_panic(expected = "exceeds cap")]
fn test_order_field_cap_rejected() {
    let s = setup();
    let env = &s.env;
    let buyer = Address::generate(env);
    let seller = Address::generate(env);
    s.quote_admin.mint(&buyer, &1_000_000);
    s.base_admin.mint(&seller, &1_000_000);
    s.contract.deposit_funds(&buyer, &s.quote, &1_000_000);
    s.contract.deposit_funds(&seller, &s.base, &1_000_000);
    let reveal_round = est_current_round(env) + FUTURE_ROUND_BUFFER + 1;
    let batch_id = s.contract.create_batch(&reveal_round);
    let ct = Bytes::from_slice(env, b"ct");
    let bid = s.contract.submit_order(&buyer, &batch_id, &ct);
    let sid = s.contract.submit_order(&seller, &batch_id, &ct);
    let mut reveal: Vec<Revealed> = Vec::new(env);
    // 1e17 > MAX_AMOUNT (1e16) → must be rejected before any multiplication.
    reveal.push_back(revealed(env, bid, Side::Buy, 100_000_000_000_000_000, 10_000_000));
    reveal.push_back(revealed(env, sid, Side::Sell, 100, 10_000_000));
    let sigma = arm_relay(&s, reveal_round);
    s.contract.settle(&batch_id, &sigma, &reveal);
}

/// Property test (deterministic LCG) over 80 funded scenarios: base conserves
/// EXACTLY, quote conserves EXACTLY (buyer paid == seller received + protocol
/// residual), residual >= 0, no balance negative, and settle NEVER reverts.
#[test]
fn test_conservation_randomized() {
    let mut seed: u64 = 0x2545F4914F6CDD1D;
    let mut rng = || {
        seed = seed
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);
        (seed >> 33) as i128
    };
    for _ in 0..80 {
        let s = setup();
        let env = &s.env;
        let buyer = Address::generate(env);
        let seller = Address::generate(env);
        let bq = 1 + rng() % 5_000; // buyer quote balance
        let sb = 1 + rng() % 5_000; // seller base balance
        let amt_b = 1 + rng() % 400;
        let amt_s = 1 + rng() % 400;
        let pb = (1 + rng() % 25) * 1_000_000; // 0.1 .. 2.5
        let ps = (1 + rng() % 25) * 1_000_000;
        s.quote_admin.mint(&buyer, &bq);
        s.base_admin.mint(&seller, &sb);
        s.contract.deposit_funds(&buyer, &s.quote, &bq);
        s.contract.deposit_funds(&seller, &s.base, &sb);
        let reveal_round = est_current_round(env) + FUTURE_ROUND_BUFFER + 1;
        let batch_id = s.contract.create_batch(&reveal_round);
        let ct = Bytes::from_slice(env, b"ct");
        let bid = s.contract.submit_order(&buyer, &batch_id, &ct);
        let sid = s.contract.submit_order(&seller, &batch_id, &ct);
        let mut reveal: Vec<Revealed> = Vec::new(env);
        reveal.push_back(revealed(env, bid, Side::Buy, amt_b, pb));
        reveal.push_back(revealed(env, sid, Side::Sell, amt_s, ps));
        let sigma = arm_relay(&s, reveal_round);
        s.contract.settle(&batch_id, &sigma, &reveal); // must NOT revert

        let buyer_base = s.contract.get_balance(&buyer, &s.base);
        let seller_base_lost = sb - s.contract.get_balance(&seller, &s.base);
        assert_eq!(buyer_base, seller_base_lost, "base conserved exactly");

        let buyer_quote_spent = bq - s.contract.get_balance(&buyer, &s.quote);
        let seller_quote_gain = s.contract.get_balance(&seller, &s.quote);
        let fees = s.contract.get_fees(&s.quote);
        assert!(fees >= 0, "residual non-negative");
        assert_eq!(buyer_quote_spent, seller_quote_gain + fees, "quote conserved exactly");

        assert!(s.contract.get_balance(&buyer, &s.quote) >= 0);
        assert!(s.contract.get_balance(&seller, &s.base) >= 0);
    }
}

/// Revoking KYC re-blocks a trader (allowlist is mutable by the compliance role).
#[test]
#[should_panic(expected = "KYC allowlist")]
fn test_kyc_revocation_blocks() {
    let s = setup();
    let env = &s.env;
    s.contract.set_permissioned(&true);
    let alice = Address::generate(env);
    s.quote_admin.mint(&alice, &1_000);
    s.contract.set_kyc(&alice, &true);
    s.contract.deposit_funds(&alice, &s.quote, &500); // allowed
    s.contract.set_kyc(&alice, &false); // revoked
    s.contract.deposit_funds(&alice, &s.quote, &100); // now rejected
}

/// Griefing guard (ADR-019): a single huge-`amount` / near-zero-funding buyer
/// must NOT collapse the batch. Without the guard the global feasibility scalar
/// r → 0 and the honest pair trades ~nothing; with it the griefer is excluded
/// (no fill, funds untouched) and the honest buyer + seller clear in full.
#[test]
fn test_griefing_underfunded_excluded() {
    let s = setup();
    let env = &s.env;
    let griefer = Address::generate(env);
    let honest_buyer = Address::generate(env);
    let seller = Address::generate(env);

    s.quote_admin.mint(&griefer, &1); // funds 1 but will "buy" 100_000
    s.quote_admin.mint(&honest_buyer, &1_000);
    s.base_admin.mint(&seller, &1_000);
    s.contract.deposit_funds(&griefer, &s.quote, &1);
    s.contract.deposit_funds(&honest_buyer, &s.quote, &1_000);
    s.contract.deposit_funds(&seller, &s.base, &1_000);

    let reveal_round = est_current_round(env) + FUTURE_ROUND_BUFFER + 1;
    let batch_id = s.contract.create_batch(&reveal_round);
    let ct = Bytes::from_slice(env, b"ct");
    let gid = s.contract.submit_order(&griefer, &batch_id, &ct);
    let hid = s.contract.submit_order(&honest_buyer, &batch_id, &ct);
    let sid = s.contract.submit_order(&seller, &batch_id, &ct);

    // All at price 1.0. Griefer "buys" 100_000 funded for only 1 quote (<<1%).
    let mut reveal: Vec<Revealed> = Vec::new(env);
    reveal.push_back(revealed(env, gid, Side::Buy, 100_000, 10_000_000));
    reveal.push_back(revealed(env, hid, Side::Buy, 100, 10_000_000));
    reveal.push_back(revealed(env, sid, Side::Sell, 100, 10_000_000));

    let sigma = arm_relay(&s, reveal_round);
    s.contract.settle(&batch_id, &sigma, &reveal);

    let c = s.contract.get_clearing(&batch_id).unwrap();
    assert_eq!(c.matched_volume, 100, "honest pair clears despite the griefer");
    assert_eq!(s.contract.get_balance(&honest_buyer, &s.base), 100, "honest buyer filled");
    assert_eq!(s.contract.get_balance(&griefer, &s.base), 0, "griefer got no fill");
    assert_eq!(s.contract.get_balance(&griefer, &s.quote), 1, "griefer funds untouched");
    assert_eq!(1_000 - s.contract.get_balance(&seller, &s.base), 100, "base conserved");
}

// ── On-chain independent BLS verification (ADR-002 stretch / ADR-019) ────────

/// The contract independently verifies a REAL drand quicknet signature on-chain
/// via the BLS12-381 host functions (no relay trust): a genuine (round, sig)
/// pair passes; the same signature against the wrong round fails — proving the
/// pairing actually binds the round, not a constant `true`.
#[test]
fn test_verify_round_signature() {
    let s = setup();
    let sig = BytesN::from_array(&s.env, &super::drand_consts::TEST_SIG);
    assert!(
        s.contract.verify_round_signature(&super::drand_consts::TEST_ROUND, &sig),
        "the real quicknet signature must verify on-chain"
    );
    // Valid on-curve signature, but the wrong round → the pairing must reject.
    assert!(
        !s.contract.verify_round_signature(&(super::drand_consts::TEST_ROUND + 1), &sig),
        "a signature must not verify against a different round"
    );
}
