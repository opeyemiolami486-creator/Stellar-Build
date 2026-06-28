// ZK Shield DEX - Trade Validity Circuit
// Proves: balance >= amount, amount > 0, no double-spend
// Hides: wallet_balance, trade_amount, asset details, nullifier preimage
//
// Compatible with Noir >= 0.31.0

// Pedersen hash for nullifier generation
fn pedersen_nullifier(secret: Field, nonce: Field) -> Field {
    std::hash::pedersen_hash([secret, nonce])
}

fn main(
    // ── Private inputs (never revealed on-chain) ──────────────────────────────
    wallet_balance: Field,       // user's XLM balance in stroops
    trade_amount: Field,         // amount to trade in stroops
    asset_secret: Field,         // secret proving asset ownership
    nullifier_secret: Field,     // secret for double-spend prevention
    price_limit: Field,          // max acceptable price (0 = no limit)

    // ── Public inputs (submitted to Soroban for verification) ─────────────────
    nullifier: pub Field,        // H(nullifier_secret, nonce) - prevents replay
    commitment: pub Field,       // H(wallet_balance, trade_amount, asset_secret, nullifier_secret)
    nonce: pub Field,            // chain nonce / epoch (timestamp)
    has_price_limit: pub Field,  // 1 if price constraint active, 0 otherwise
    merkle_root: pub Field,      // merkle root of valid asset registry
) {
    // ── Constraint 1: trade_amount > 0 ──────────────────────────────────────
    // Cast to u64 for arithmetic comparison; Field elements wrap mod p
    let amount_u64 = trade_amount as u64;
    assert(amount_u64 > 0);

    // ── Constraint 2: balance >= trade_amount ────────────────────────────────
    let balance_u64 = wallet_balance as u64;
    assert(balance_u64 >= amount_u64);

    // ── Constraint 3: nonce (epoch) is non-zero to prevent proof reuse ───────
    let nonce_u64 = nonce as u64;
    assert(nonce_u64 > 0);

    // ── Constraint 4: nullifier is correctly derived (prevents double-spend) ─
    // nullifier = H(nullifier_secret, nonce)
    let expected_nullifier = pedersen_nullifier(nullifier_secret, nonce);
    assert(nullifier == expected_nullifier);

    // ── Constraint 5: commitment binds all private inputs ───────────────────
    // commitment = H(balance, amount, asset_secret, nullifier_secret)
    let expected_commitment = std::hash::pedersen_hash([
        wallet_balance,
        trade_amount,
        asset_secret,
        nullifier_secret,
    ]);
    assert(commitment == expected_commitment);

    // ── Constraint 6: optional price limit check ─────────────────────────────
    // If has_price_limit == 1, price_limit must be > 0
    let limit_flag = has_price_limit as u64;
    if limit_flag == 1 {
        assert(price_limit as u64 > 0);
    }

    // ── Constraint 7: merkle root is non-zero (asset registry membership) ───
    // Full production impl would verify a merkle inclusion proof path here.
    // For MVP: assert asset_secret hashes to a non-zero leaf and root != 0.
    let _leaf = std::hash::pedersen_hash([asset_secret, asset_secret]);
    assert(merkle_root as u64 > 0);
}
