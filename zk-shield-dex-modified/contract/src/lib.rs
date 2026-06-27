#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Bytes, BytesN, Env, Symbol, symbol_short};

#[contracttype]
#[derive(Clone)]
pub struct TradeRecord {
    pub nullifier: BytesN<32>,
    pub commitment: BytesN<32>,
    pub status: u32,
    pub ledger: u32,
    pub trade_hash: BytesN<32>,
}

#[contracttype]
pub enum DataKey {
    Admin,
    VkHash,
    Trade(BytesN<32>),
    Nullifier(BytesN<32>),
    TradeCount,
}

#[contract]
pub struct ZkPrivacyDex;

#[contractimpl]
impl ZkPrivacyDex {
    pub fn initialize(env: Env, admin: soroban_sdk::Address, vk_hash: Bytes) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::VkHash, &vk_hash);
        env.storage().instance().set(&DataKey::TradeCount, &0u32);
    }

    pub fn submit_proof(
        env: Env,
        submitter: soroban_sdk::Address,
        nullifier: BytesN<32>,
        commitment: BytesN<32>,
        nonce: u64,
    ) -> BytesN<32> {
        submitter.require_auth();

        let used: bool = env.storage().persistent().get(&DataKey::Nullifier(nullifier.clone())).unwrap_or(false);
        if used {
            panic!("nullifier already used");
        }

        let mut trade_input = Bytes::new(&env);
        trade_input.append(&nullifier.clone().into());
        trade_input.append(&commitment.clone().into());
        let trade_hash: BytesN<32> = env.crypto().sha256(&trade_input).into();

        let record = TradeRecord {
            nullifier: nullifier.clone(),
            commitment,
            status: 1u32,
            ledger: env.ledger().sequence(),
            trade_hash: trade_hash.clone(),
        };

        env.storage().persistent().set(&DataKey::Trade(trade_hash.clone()), &record);
        env.storage().persistent().set(&DataKey::Nullifier(nullifier), &true);

        let count: u32 = env.storage().instance().get(&DataKey::TradeCount).unwrap_or(0);
        env.storage().instance().set(&DataKey::TradeCount, &(count + 1));

        trade_hash
    }

    pub fn execute_trade(env: Env, trade_hash: BytesN<32>) {
        let mut record: TradeRecord = env.storage().persistent().get(&DataKey::Trade(trade_hash.clone())).expect("trade not found");
        record.status = 2u32;
        env.storage().persistent().set(&DataKey::Trade(trade_hash), &record);
    }

    pub fn get_trade_status(env: Env, trade_hash: BytesN<32>) -> u32 {
        let record: Option<TradeRecord> = env.storage().persistent().get(&DataKey::Trade(trade_hash));
        match record {
            Some(r) => r.status,
            None => 0u32,
        }
    }

    pub fn is_nullifier_used(env: Env, nullifier: BytesN<32>) -> bool {
        env.storage().persistent().get(&DataKey::Nullifier(nullifier)).unwrap_or(false)
    }

    pub fn trade_count(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::TradeCount).unwrap_or(0)
    }
}
