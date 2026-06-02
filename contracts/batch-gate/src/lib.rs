#![no_std]

//! Stelvin — BatchGate + Escrow
//!
//! A MEV-resistant, sealed-bid batch auction on Soroban.
//!
//! Traders submit drand-timelock-encrypted orders. Orders are physically
//! unreadable — by anyone, including the operator and the settler — until a
//! committed drand round `R` arrives. At reveal, the whole batch clears at a
//! single uniform price computed *on-chain*, so a frontrunner has nothing to
//! react to and the settler cannot manipulate the price.
//!
//! Trust model (stated honestly):
//!   * Order *confidentiality* is trustless and temporal: hidden until R, then
//!     public — guaranteed by drand timelock (BLS12-381 IBE), not by promises.
//!   * The *timing gate* and *key authenticity* are trustless: the drand relay
//!     verifies the BLS signature on-chain before storing `sha256(sig)`, and we
//!     re-check `sha256(sigma_R) == relay.get(R)` here.
//!   * The *clearing price* is trustless: this contract computes it, not the
//!     settler.
//!   * Decrypt *correctness* (that revealed orders match the stored ciphertext)
//!     is, in v1, an optimistic / trusted-settler step. Because the reveal is
//!     public and verifiable, a dishonest settle is detectable off-chain; an
//!     on-chain fraud proof / IBE check is future work. We do NOT claim
//!     trustless on-chain reveal.
//!
//! Settlement uses an internal standing-balance ledger (deposit / withdraw):
//! `settle` only moves balances inside the contract — no per-batch token
//! transfers — which keeps it cheap and atomic. The matching engine is
//! conservation-safe: matched base is split exactly across both sides, and the
//! quote leg collects with ceil / pays with floor so the pool never mints.

use soroban_sdk::{
    contract, contractclient, contractevent, contractimpl, contracttype, token, Address, Bytes,
    BytesN, Env, Vec,
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Fixed-point scale for prices: `limit_price` is quote-units per 1.0 base,
/// scaled by 1e7 (mirrors Stellar's classic 7-decimal convention).
const PRICE_SCALE: i128 = 10_000_000;

/// Quicknet beacon period and genesis (used to estimate the current round from
/// the ledger timestamp — same derivation as Drand-Relay's dice-game).
const QUICKNET_PERIOD_SECS: u64 = 3;
const QUICKNET_GENESIS: u64 = 1_692_803_367;

/// A new batch's reveal round must be at least this many rounds in the future,
/// so the off-chain feeder has time to publish R before settle. ~12 × 3s ≈ 36s.
const FUTURE_ROUND_BUFFER: u64 = 12;

/// Hard cap on orders per batch — keeps `settle` inside Soroban resource limits.
const MAX_ORDERS: u32 = 16;

/// Scale for the global feasibility scalar `r ∈ [0, 1]`.
const FEAS_SCALE: i128 = 1_000_000_000;

const MIN_TTL: u32 = 17_280;
const EXTEND_TO: u32 = 518_400;

// ---------------------------------------------------------------------------
// Cross-contract client for the drand relay (external; we only call it).
//
// Defining our own client keeps Stelvin self-contained and makes the boundary
// explicit: the relay is purely a timing/key oracle. Its `get(R)` returns
// `sha256(sig_R)` only after it has on-chain BLS-verified the signature, so a
// `Some` result simultaneously proves (a) round R has arrived and (b) the
// committed key is authentic.
// ---------------------------------------------------------------------------

#[contractclient(name = "DrandRelayClient")]
pub trait DrandRelay {
    fn get(env: Env, round: u64) -> Option<BytesN<32>>;
    fn latest(env: Env) -> Option<(u64, BytesN<32>)>;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Side {
    /// Buy base: pay quote (USDC) to receive base (X).
    Buy,
    /// Sell base: give base (X) to receive quote (USDC).
    Sell,
}

#[contracttype]
#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Status {
    Open,
    Locked,
    Settled,
}

#[contracttype]
#[derive(Clone)]
pub struct Batch {
    pub id: u32,
    pub reveal_round: u64,
    pub status: Status,
    pub order_ids: Vec<u64>,
}

/// An order is stored only as opaque ciphertext until reveal. The contract
/// never reads its contents — it holds the blob and the on-chain trader binding.
#[contracttype]
#[derive(Clone)]
pub struct Order {
    pub id: u64,
    pub trader: Address,
    pub batch_id: u32,
    pub ciphertext: Bytes,
}

/// Plaintext order, supplied by the settler at reveal (the `side/amount/price`
/// fields are the optimistic/trusted part; the trader is taken from storage).
#[contracttype]
#[derive(Clone)]
pub struct Revealed {
    pub order_id: u64,
    pub side: Side,
    pub amount: i128,      // base (X) atomic units
    pub limit_price: i128, // quote per base, scaled by PRICE_SCALE
}

#[contracttype]
#[derive(Clone)]
pub struct Clearing {
    pub batch_id: u32,
    pub price: i128,          // uniform clearing price (scaled)
    pub matched_volume: i128, // base actually traded
    pub settled_at: u64,
}

// ---------------------------------------------------------------------------
// Events — let the frontend / settler / demo follow batch lifecycle without
// polling, and make the "batch opened / settled at price X" moments legible.
// ---------------------------------------------------------------------------

#[contractevent]
pub struct BatchOpened {
    #[topic]
    pub batch_id: u32,
    pub reveal_round: u64,
}

#[contractevent]
pub struct OrderSubmitted {
    #[topic]
    pub batch_id: u32,
    pub order_id: u64,
    pub trader: Address,
}

#[contractevent]
pub struct BatchSettled {
    #[topic]
    pub batch_id: u32,
    pub price: i128,
    pub matched_volume: i128,
}

#[contracttype]
pub enum DataKey {
    Admin,
    AssetBase,  // X token (SAC) address
    AssetQuote, // USDC token (SAC) address
    Relay,      // drand verifier address
    NextBatchId,
    NextOrderId,
    Batch(u32),
    Order(u64),
    Clearing(u32),
    /// Standing balance: (trader, asset) -> amount.
    Balance(Address, Address),
    /// Marks that a trader already has an order in a batch (one per batch in v1,
    /// which makes the settle no-revert guarantee total — see ADR-010/014).
    Submitted(u32, Address),
}

/// Internal matching record (not persisted).
#[contracttype]
#[derive(Clone)]
struct Leg {
    trader: Address,
    amount: i128,
    limit: i128,
}

// ---------------------------------------------------------------------------
// Storage helpers (free functions — not exported as contract methods).
// ---------------------------------------------------------------------------

fn load_admin(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Admin).unwrap()
}

fn load_relay(env: &Env) -> Address {
    env.storage().instance().get(&DataKey::Relay).unwrap()
}

fn assets(env: &Env) -> (Address, Address) {
    let base: Address = env.storage().instance().get(&DataKey::AssetBase).unwrap();
    let quote: Address = env.storage().instance().get(&DataKey::AssetQuote).unwrap();
    (base, quote)
}

fn balance_of(env: &Env, trader: &Address, asset: &Address) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::Balance(trader.clone(), asset.clone()))
        .unwrap_or(0)
}

fn set_balance(env: &Env, trader: &Address, asset: &Address, amount: i128) {
    let key = DataKey::Balance(trader.clone(), asset.clone());
    env.storage().persistent().set(&key, &amount);
    env.storage()
        .persistent()
        .extend_ttl(&key, MIN_TTL, EXTEND_TO);
}

fn load_batch(env: &Env, batch_id: u32) -> Batch {
    env.storage()
        .persistent()
        .get(&DataKey::Batch(batch_id))
        .expect("batch not found")
}

fn save_batch(env: &Env, batch: &Batch) {
    env.storage()
        .persistent()
        .set(&DataKey::Batch(batch.id), batch);
    env.storage()
        .persistent()
        .extend_ttl(&DataKey::Batch(batch.id), MIN_TTL, EXTEND_TO);
}

fn load_order(env: &Env, order_id: u64) -> Order {
    env.storage()
        .persistent()
        .get(&DataKey::Order(order_id))
        .expect("order not found")
}

/// Estimate the current drand round from the ledger timestamp.
fn est_current_round(env: &Env) -> u64 {
    let now = env.ledger().timestamp();
    let elapsed = now.saturating_sub(QUICKNET_GENESIS);
    elapsed / QUICKNET_PERIOD_SECS + 1
}

/// Reduce `fills` (currently summing to `sum`) down to `target` by trimming
/// from the leading entries. Only ever *decreases* values (never below 0), so a
/// feasibility-bounded fill stays feasibility-bounded. Used to make both sides
/// of the auction sum to exactly the same `target` base — exact conservation.
fn trim_to(fills: &mut Vec<i128>, sum: i128, target: i128) {
    let mut excess = sum - target;
    let n = fills.len();
    let mut i = 0u32;
    while excess > 0 && i < n {
        let v = fills.get(i).unwrap();
        let cut = if v < excess { v } else { excess };
        fills.set(i, v - cut);
        excess -= cut;
        i += 1;
    }
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

#[contract]
pub struct BatchGate;

#[contractimpl]
impl BatchGate {
    /// Deploy-time constructor.
    /// `asset_base` = X (the traded asset), `asset_quote` = USDC, `relay` = the
    /// deployed Drand-Relay verifier address.
    pub fn __constructor(
        env: Env,
        admin: Address,
        asset_base: Address,
        asset_quote: Address,
        relay: Address,
    ) {
        let s = env.storage().instance();
        s.set(&DataKey::Admin, &admin);
        s.set(&DataKey::AssetBase, &asset_base);
        s.set(&DataKey::AssetQuote, &asset_quote);
        s.set(&DataKey::Relay, &relay);
        s.set(&DataKey::NextBatchId, &0u32);
        s.set(&DataKey::NextOrderId, &0u64);
        s.extend_ttl(MIN_TTL, EXTEND_TO);
    }

    // -----------------------------------------------------------------------
    // Standing balances
    // -----------------------------------------------------------------------

    /// Deposit `asset` (must be base or quote) into your standing balance.
    /// Pulls tokens via the SAC; requires the trader's auth.
    pub fn deposit_funds(env: Env, trader: Address, asset: Address, amount: i128) {
        trader.require_auth();
        assert!(amount > 0, "amount must be positive");
        let (base, quote) = assets(&env);
        assert!(asset == base || asset == quote, "unknown asset");

        let tok = token::TokenClient::new(&env, &asset);
        tok.transfer(&trader, &env.current_contract_address(), &amount);

        let cur = balance_of(&env, &trader, &asset);
        set_balance(&env, &trader, &asset, cur + amount);
    }

    /// Withdraw unused standing balance. Always allowed up to your free balance
    /// (orders never reserve funds at submit time — content is hidden — so an
    /// underfunded order simply drops at settle).
    pub fn withdraw(env: Env, trader: Address, asset: Address, amount: i128) {
        trader.require_auth();
        assert!(amount > 0, "amount must be positive");
        let (base, quote) = assets(&env);
        assert!(asset == base || asset == quote, "unknown asset");

        let cur = balance_of(&env, &trader, &asset);
        assert!(cur >= amount, "insufficient balance");
        set_balance(&env, &trader, &asset, cur - amount);

        let tok = token::TokenClient::new(&env, &asset);
        tok.transfer(&env.current_contract_address(), &trader, &amount);
    }

    // -----------------------------------------------------------------------
    // Batch lifecycle
    // -----------------------------------------------------------------------

    /// Open a new batch that clears at drand round `reveal_round` (admin-only in
    /// v1 — the admin only chooses the round; it cannot read orders, set the
    /// price, or reveal early. Making this permissionless/cron is a one-liner).
    pub fn create_batch(env: Env, reveal_round: u64) -> u32 {
        load_admin(&env).require_auth();

        let min_round = est_current_round(&env) + FUTURE_ROUND_BUFFER;
        assert!(
            reveal_round >= min_round,
            "reveal_round must be at least FUTURE_ROUND_BUFFER rounds ahead"
        );

        let id: u32 = env.storage().instance().get(&DataKey::NextBatchId).unwrap();
        env.storage()
            .instance()
            .set(&DataKey::NextBatchId, &(id + 1));

        let batch = Batch {
            id,
            reveal_round,
            status: Status::Open,
            order_ids: Vec::new(&env),
        };
        save_batch(&env, &batch);

        BatchOpened {
            batch_id: id,
            reveal_round,
        }
        .publish(&env);
        id
    }

    /// Submit a timelock-encrypted order to an open batch.
    ///
    /// Anti-spam without bonds: the trader must already hold a positive standing
    /// balance (i.e. be genuinely funded). The ciphertext is stored verbatim;
    /// the contract cannot read it.
    pub fn submit_order(env: Env, trader: Address, batch_id: u32, ciphertext: Bytes) -> u64 {
        trader.require_auth();

        let mut batch = load_batch(&env, batch_id);
        assert!(batch.status == Status::Open, "batch not open");
        assert!(
            est_current_round(&env) < batch.reveal_round,
            "reveal round reached — no late orders"
        );
        assert!(batch.order_ids.len() < MAX_ORDERS, "batch full");

        let (base, quote) = assets(&env);
        let funded = balance_of(&env, &trader, &base) > 0 || balance_of(&env, &trader, &quote) > 0;
        assert!(funded, "fund a standing balance before submitting orders");

        // One order per trader per batch (v1). This makes settle's feasibility
        // snapshot equal the apply-time balance, so the floor-then-trim engine
        // never reverts (ADR-010). Multi-order-per-trader needs per-trader
        // feasibility aggregation — future work.
        let submitted = DataKey::Submitted(batch_id, trader.clone());
        assert!(
            !env.storage().persistent().has(&submitted),
            "one order per trader per batch (v1)"
        );
        env.storage().persistent().set(&submitted, &true);
        env.storage()
            .persistent()
            .extend_ttl(&submitted, MIN_TTL, EXTEND_TO);

        let id: u64 = env.storage().instance().get(&DataKey::NextOrderId).unwrap();
        env.storage()
            .instance()
            .set(&DataKey::NextOrderId, &(id + 1));

        let order = Order {
            id,
            trader: trader.clone(),
            batch_id,
            ciphertext,
        };
        env.storage().persistent().set(&DataKey::Order(id), &order);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Order(id), MIN_TTL, EXTEND_TO);

        batch.order_ids.push_back(id);
        save_batch(&env, &batch);

        OrderSubmitted {
            batch_id,
            order_id: id,
            trader,
        }
        .publish(&env);
        id
    }

    /// Optional: freeze the batch once R is available in the relay. Permissionless.
    pub fn lock_batch(env: Env, batch_id: u32) {
        let mut batch = load_batch(&env, batch_id);
        assert!(batch.status == Status::Open, "batch not open");

        let relay = load_relay(&env);
        let client = DrandRelayClient::new(&env, &relay);
        assert!(
            client.get(&batch.reveal_round).is_some(),
            "reveal round not yet available"
        );

        batch.status = Status::Locked;
        save_batch(&env, &batch);
    }

    // -----------------------------------------------------------------------
    // Settlement — the core
    // -----------------------------------------------------------------------

    /// Settle a batch. Permissionless: the timing gate and key check make a
    /// malicious caller unable to open early or use a fake key.
    ///
    /// `sigma_r` is the 48-byte compressed drand signature for the reveal round,
    /// fetched from the public quicknet API (the relay only stores `sha256(σ)`).
    pub fn settle(env: Env, batch_id: u32, sigma_r: BytesN<48>, revealed: Vec<Revealed>) {
        let mut batch = load_batch(&env, batch_id);
        assert!(batch.status != Status::Settled, "already settled");

        // (a) timing gate + (b) key authenticity, in a single relay read.
        let relay = load_relay(&env);
        let client = DrandRelayClient::new(&env, &relay);
        let committed: BytesN<32> = client
            .get(&batch.reveal_round)
            .expect("reveal round not yet available");

        let sig_bytes = Bytes::from_slice(&env, &sigma_r.to_array());
        let computed: BytesN<32> = env.crypto().sha256(&sig_bytes).into();
        assert!(
            computed == committed,
            "sigma_R does not match the round key committed by the relay"
        );

        // (c) [stretch] independent on-chain BLS pairing of sigma_R is redundant
        //     here because the relay already BLS-verified before storing — left
        //     as future work.
        // (d) [mock] we trust that `revealed` decrypts the stored ciphertexts.
        //     The trader identity below is taken from storage, NOT from the
        //     settler, so only side/amount/price are optimistic.

        // (e) On-chain matching → uniform clearing price (computed here, not by
        //     the settler) and conservation-safe fills.
        let (price, traded) = Self::match_and_settle(&env, &batch, &revealed);

        // (f) Record result and close the batch.
        let clearing = Clearing {
            batch_id,
            price,
            matched_volume: traded,
            settled_at: env.ledger().timestamp(),
        };
        env.storage()
            .persistent()
            .set(&DataKey::Clearing(batch_id), &clearing);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Clearing(batch_id), MIN_TTL, EXTEND_TO);

        batch.status = Status::Settled;
        save_batch(&env, &batch);

        BatchSettled {
            batch_id,
            price,
            matched_volume: traded,
        }
        .publish(&env);
    }

    // -----------------------------------------------------------------------
    // Views
    // -----------------------------------------------------------------------

    pub fn get_batch(env: Env, batch_id: u32) -> Option<Batch> {
        env.storage().persistent().get(&DataKey::Batch(batch_id))
    }

    pub fn get_order(env: Env, order_id: u64) -> Option<Order> {
        env.storage().persistent().get(&DataKey::Order(order_id))
    }

    pub fn get_clearing(env: Env, batch_id: u32) -> Option<Clearing> {
        env.storage().persistent().get(&DataKey::Clearing(batch_id))
    }

    pub fn get_clearing_price(env: Env, batch_id: u32) -> Option<i128> {
        let c: Option<Clearing> = env.storage().persistent().get(&DataKey::Clearing(batch_id));
        c.map(|c| c.price)
    }

    pub fn get_balance(env: Env, trader: Address, asset: Address) -> i128 {
        balance_of(&env, &trader, &asset)
    }
}

// ---------------------------------------------------------------------------
// Matching engine (internal)
// ---------------------------------------------------------------------------

impl BatchGate {
    /// Uniform-price call auction with a global feasibility scalar.
    ///
    /// Returns `(clearing_price, traded_base)`. Applies internal balance deltas.
    fn match_and_settle(env: &Env, batch: &Batch, revealed: &Vec<Revealed>) -> (i128, i128) {
        let (base_asset, quote_asset) = assets(env);

        // Split revealed orders into buys / sells, binding each to its on-chain
        // trader and validating batch membership.
        let mut buys: Vec<Leg> = Vec::new(env);
        let mut sells: Vec<Leg> = Vec::new(env);
        // Reject duplicate order_ids: a revealed order may appear at most once,
        // so the settler cannot inflate an order's weight by repeating it. This
        // narrows the trusted-settler surface to just side/amount/price.
        let mut seen: Vec<u64> = Vec::new(env);
        for r in revealed.iter() {
            assert!(!seen.contains(r.order_id), "duplicate order_id in reveal");
            seen.push_back(r.order_id);

            let order = load_order(env, r.order_id);
            assert!(order.batch_id == batch.id, "order not in this batch");
            assert!(r.amount > 0 && r.limit_price > 0, "bad order fields");
            let leg = Leg {
                trader: order.trader,
                amount: r.amount,
                limit: r.limit_price,
            };
            match r.side {
                Side::Buy => buys.push_back(leg),
                Side::Sell => sells.push_back(leg),
            }
        }

        // (1) Clearing price P*: scan candidate prices (= the set of limit
        //     prices) and pick the one maximizing matched volume.
        //     Tie-breaks: smaller |demand-supply|, then lower price.
        let mut best_price: i128 = 0;
        let mut best_matched: i128 = 0;
        let mut best_imbalance: i128 = i128::MAX;

        for cand in revealed.iter() {
            let p = cand.limit_price;
            let mut demand: i128 = 0;
            for b in buys.iter() {
                if b.limit >= p {
                    demand += b.amount;
                }
            }
            let mut supply: i128 = 0;
            for s in sells.iter() {
                if s.limit <= p {
                    supply += s.amount;
                }
            }
            let matched = if demand < supply { demand } else { supply };
            let imbalance = (demand - supply).abs();

            let better = matched > best_matched
                || (matched == best_matched
                    && (imbalance < best_imbalance
                        || (imbalance == best_imbalance && p < best_price)));
            if matched > 0 && better {
                best_price = p;
                best_matched = matched;
                best_imbalance = imbalance;
            }
        }

        if best_matched == 0 {
            // No cross — nothing trades, all balances untouched.
            return (0, 0);
        }
        let price = best_price;
        let m = best_matched;

        // (2) Eligible legs at P* and their side totals.
        let mut elig_buys: Vec<Leg> = Vec::new(env);
        let mut elig_sells: Vec<Leg> = Vec::new(env);
        let mut demand: i128 = 0;
        let mut supply: i128 = 0;
        for b in buys.iter() {
            if b.limit >= price {
                demand += b.amount;
                elig_buys.push_back(b);
            }
        }
        for s in sells.iter() {
            if s.limit <= price {
                supply += s.amount;
                elig_sells.push_back(s);
            }
        }

        // (3) Global feasibility scalar r ∈ [0,1]: the largest fraction such
        //     that every eligible trader can actually pay/deliver their pro-rata
        //     fill. Scaling BOTH sides by the same r preserves conservation.
        let mut r: i128 = FEAS_SCALE;
        // buys: raw_fill = amount * m / demand (base); need quote = raw*P/SCALE.
        for b in elig_buys.iter() {
            let raw = b.amount * m / demand;
            if raw <= 0 {
                continue;
            }
            let have = balance_of(env, &b.trader, &quote_asset);
            // Feasible base from the quote balance: have * SCALE / price.
            let feasible_base = have * PRICE_SCALE / price;
            let ri = if feasible_base >= raw {
                FEAS_SCALE
            } else {
                feasible_base * FEAS_SCALE / raw
            };
            if ri < r {
                r = ri;
            }
        }
        // sells: raw_fill = amount * m / supply (base); need base in balance.
        for s in elig_sells.iter() {
            let raw = s.amount * m / supply;
            if raw <= 0 {
                continue;
            }
            let have = balance_of(env, &s.trader, &base_asset);
            let ri = if have >= raw {
                FEAS_SCALE
            } else {
                have * FEAS_SCALE / raw
            };
            if ri < r {
                r = ri;
            }
        }

        // (4) Per-order fills, floored against the feasibility-scaled pro-rata.
        //     Because `raw * r / FEAS <= feasible_i` by construction, flooring
        //     keeps every fill within the trader's balance — so the apply step
        //     can never revert (buyer ceil(quote) <= balance, seller base <=
        //     balance). The asserts below are therefore only defensive.
        let mut buy_fills: Vec<i128> = Vec::new(env);
        let mut buy_sum: i128 = 0;
        for b in elig_buys.iter() {
            let fill = b.amount * m / demand * r / FEAS_SCALE;
            buy_fills.push_back(fill);
            buy_sum += fill;
        }
        let mut sell_fills: Vec<i128> = Vec::new(env);
        let mut sell_sum: i128 = 0;
        for s in elig_sells.iter() {
            let fill = s.amount * m / supply * r / FEAS_SCALE;
            sell_fills.push_back(fill);
            sell_sum += fill;
        }

        // (5) Independent flooring may leave the two sides summing to slightly
        //     different totals. The actual traded base is the smaller side; trim
        //     the larger side down to it so Σbuy == Σsell == `traded` EXACTLY
        //     (exact base conservation). Trimming only reduces fills, so the
        //     no-revert guarantee is preserved.
        let traded = if buy_sum < sell_sum { buy_sum } else { sell_sum };
        if traded <= 0 {
            return (price, 0);
        }
        trim_to(&mut buy_fills, buy_sum, traded);
        trim_to(&mut sell_fills, sell_sum, traded);

        // (6) Apply. Quote leg: buyers pay ceil, sellers receive floor, so the
        //     contract's quote pool can only retain dust — never go negative.
        let n_buys = elig_buys.len();
        for i in 0..n_buys {
            let b = elig_buys.get(i).unwrap();
            let base_fill = buy_fills.get(i).unwrap();
            if base_fill <= 0 {
                continue;
            }
            let quote_pay = (base_fill * price + (PRICE_SCALE - 1)) / PRICE_SCALE; // ceil
            let q = balance_of(env, &b.trader, &quote_asset);
            assert!(q >= quote_pay, "buyer quote underflow");
            set_balance(env, &b.trader, &quote_asset, q - quote_pay);
            let bb = balance_of(env, &b.trader, &base_asset);
            set_balance(env, &b.trader, &base_asset, bb + base_fill);
        }

        let n_sells = elig_sells.len();
        for i in 0..n_sells {
            let s = elig_sells.get(i).unwrap();
            let base_fill = sell_fills.get(i).unwrap();
            if base_fill <= 0 {
                continue;
            }
            let quote_recv = base_fill * price / PRICE_SCALE; // floor
            let sb = balance_of(env, &s.trader, &base_asset);
            assert!(sb >= base_fill, "seller base underflow");
            set_balance(env, &s.trader, &base_asset, sb - base_fill);
            let sq = balance_of(env, &s.trader, &quote_asset);
            set_balance(env, &s.trader, &quote_asset, sq + quote_recv);
        }

        (price, traded)
    }
}

#[cfg(test)]
mod test;
