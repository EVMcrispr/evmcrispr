use revm::context::result::{EVMError, ExecutionResult};
use revm::context::{BlockEnv, CfgEnv, TxEnv};
use revm::database::CacheDB;
use revm::primitives::hardfork::SpecId;
use revm::primitives::{hex, Address, Bytes, TxKind, B256, U256};
use revm::state::{AccountInfo, Bytecode};
use revm::{Context, Database, DatabaseCommit, ExecuteEvm, MainBuilder, MainContext};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::db::{Miss, MissDb};

/// Mirrors the ethereumjs backend's fixed block gas limit.
const BLOCK_GAS_LIMIT: u64 = 30_000_000;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TxJson {
    from: String,
    #[serde(default)]
    to: Option<String>,
    #[serde(default)]
    data: Option<String>,
    #[serde(default)]
    value: Option<String>,
    #[serde(default)]
    gas: Option<String>,
    #[serde(default)]
    nonce: Option<String>,
}

/// Plain-Rust fork state; `RevmFork` in lib.rs is the thin wasm-bindgen shell.
/// Every fallible method returns a JSON envelope string — misses are expected
/// control flow, so structured returns beat exceptions (which would poison the
/// wasm instance on panic and lose the miss payload).
pub struct Fork {
    db: CacheDB<MissDb>,
    chain_id: u64,
    base_block_number: u64,
    mined_blocks: u64,
    base_timestamp: u64,
    timestamp_offset: u64,
}

impl Fork {
    pub fn new(chain_id: u64, block_number: u64, base_timestamp: u64) -> Self {
        let mut db = CacheDB::new(MissDb);
        // The handler loads the block beneficiary on every execution. Our block
        // context is synthetic (coinbase = zero, basefee 0), so seed it empty
        // instead of letting every fork pay an upstream fetch for 0x0.
        db.insert_account_info(Address::ZERO, AccountInfo::default());
        Fork {
            db,
            chain_id,
            base_block_number: block_number,
            mined_blocks: 0,
            base_timestamp,
            timestamp_offset: 0,
        }
    }

    pub fn block_number(&self) -> u64 {
        self.base_block_number + self.mined_blocks
    }

    pub fn mine(&mut self, blocks: u64) {
        self.mined_blocks += blocks;
    }

    pub fn increase_time(&mut self, seconds: u64) {
        self.timestamp_offset += seconds;
    }

    // ── cache seeding ──

    pub fn insert_account(&mut self, addr: &str, balance: &str, nonce: u64, code: &str) -> String {
        match self.build_account(balance, nonce, code) {
            Ok(info) => match parse_addr(addr) {
                Ok(a) => {
                    self.db.insert_account_info(a, info);
                    ok_env()
                }
                Err(e) => error_env(&e),
            },
            Err(e) => error_env(&e),
        }
    }

    pub fn insert_storage(&mut self, addr: &str, slot: &str, value: &str) -> String {
        let (a, s, v) = match (parse_addr(addr), parse_u256(slot), parse_u256(value)) {
            (Ok(a), Ok(s), Ok(v)) => (a, s, v),
            (a, s, v) => return error_env(&first_err(&[a.err(), s.err(), v.err()])),
        };
        match self.db.insert_account_storage(a, s, v) {
            Ok(()) => ok_env(),
            Err(m) => miss_env(&m),
        }
    }

    pub fn insert_block_hash(&mut self, number: u64, hash: &str) -> String {
        match parse_b256(hash) {
            Ok(h) => {
                self.db.cache.block_hashes.insert(U256::from(number), h);
                ok_env()
            }
            Err(e) => error_env(&e),
        }
    }

    // ── cheatcodes ──

    pub fn set_balance(&mut self, addr: &str, balance: &str) -> String {
        let (a, b) = match (parse_addr(addr), parse_u256(balance)) {
            (Ok(a), Ok(b)) => (a, b),
            (a, b) => return error_env(&first_err(&[a.err(), b.err()])),
        };
        match self.db.basic(a) {
            Ok(info) => {
                let mut info = info.unwrap_or_default();
                info.balance = b;
                self.db.insert_account_info(a, info);
                ok_env()
            }
            Err(m) => miss_env(&m),
        }
    }

    pub fn set_code(&mut self, addr: &str, code: &str) -> String {
        let a = match parse_addr(addr) {
            Ok(a) => a,
            Err(e) => return error_env(&e),
        };
        let (bytecode, code_hash) = match build_bytecode(code) {
            Ok(bc) => bc,
            Err(e) => return error_env(&e),
        };
        match self.db.basic(a) {
            Ok(info) => {
                let mut info = info.unwrap_or_default();
                info.code_hash = code_hash;
                info.code = Some(bytecode);
                self.db.insert_account_info(a, info);
                ok_env()
            }
            Err(m) => miss_env(&m),
        }
    }

    pub fn set_storage(&mut self, addr: &str, slot: &str, value: &str) -> String {
        self.insert_storage(addr, slot, value)
    }

    // ── reads (transport backing) ──

    pub fn get_balance(&mut self, addr: &str) -> String {
        match parse_addr(addr) {
            Ok(a) => match self.db.basic(a) {
                Ok(info) => value_env(&u256_hex(info.map(|i| i.balance).unwrap_or_default())),
                Err(m) => miss_env(&m),
            },
            Err(e) => error_env(&e),
        }
    }

    pub fn get_code(&mut self, addr: &str) -> String {
        match parse_addr(addr) {
            Ok(a) => match self.db.basic(a) {
                Ok(info) => {
                    let bytes = info
                        .and_then(|i| i.code)
                        .map(|c| c.original_bytes())
                        .unwrap_or_default();
                    value_env(&bytes_hex(&bytes))
                }
                Err(m) => miss_env(&m),
            },
            Err(e) => error_env(&e),
        }
    }

    pub fn get_storage(&mut self, addr: &str, slot: &str) -> String {
        let (a, s) = match (parse_addr(addr), parse_u256(slot)) {
            (Ok(a), Ok(s)) => (a, s),
            (a, s) => return error_env(&first_err(&[a.err(), s.err()])),
        };
        match self.db.storage(a, s) {
            Ok(v) => value_env(&u256_hex(v)),
            Err(m) => miss_env(&m),
        }
    }

    // ── execution ──

    pub fn call(&mut self, tx_json: &str) -> String {
        self.execute(tx_json, false)
    }

    pub fn transact(&mut self, tx_json: &str) -> String {
        self.execute(tx_json, true)
    }

    fn execute(&mut self, tx_json: &str, commit: bool) -> String {
        let tx: TxJson = match serde_json::from_str(tx_json) {
            Ok(t) => t,
            Err(e) => return error_env(&format!("invalid tx json: {e}")),
        };
        let tx_env = match self.build_tx_env(&tx) {
            Ok(t) => t,
            Err(e) => return error_env(&e),
        };
        // An explicit nonce override (--nonce) also rewrites the cached
        // account nonce so revm's CREATE-address derivation and the tx agree,
        // whichever of the two it consults.
        if tx.nonce.is_some() {
            if let Some(acc) = self.db.cache.accounts.get_mut(&tx_env.caller) {
                acc.info.nonce = tx_env.nonce;
            }
        }

        // No blanket `Database for &mut T` in revm 42, so hand the CacheDB to the
        // EVM by value and take it back out of the context afterwards.
        let db = std::mem::replace(&mut self.db, CacheDB::new(MissDb));
        let mut evm = Context::mainnet()
            .with_db(db)
            .with_cfg(self.cfg_env())
            .with_block(self.block_env())
            .build_mainnet();
        let res = evm.transact(tx_env);
        self.db = evm.ctx.journaled_state.database;

        match res {
            Ok(out) => {
                if commit {
                    if let ExecutionResult::Success { .. } = out.result {
                        self.db.commit(out.state);
                    }
                }
                result_env(out.result)
            }
            Err(EVMError::Database(m)) => miss_env(&m),
            Err(e) => error_env(&format!("{e:?}")),
        }
    }

    fn build_tx_env(&self, tx: &TxJson) -> Result<TxEnv, String> {
        let caller = parse_addr(&tx.from)?;
        let kind = match &tx.to {
            Some(to) => TxKind::Call(parse_addr(to)?),
            None => TxKind::Create,
        };
        let value = tx.value.as_deref().map(parse_u256).transpose()?.unwrap_or_default();
        let data: Bytes = tx.data.as_deref().map(parse_bytes).transpose()?.unwrap_or_default();
        let gas_limit = tx
            .gas
            .as_deref()
            .map(parse_u256)
            .transpose()?
            .map(|g| g.try_into().unwrap_or(BLOCK_GAS_LIMIT))
            .unwrap_or(BLOCK_GAS_LIMIT);
        // Nonce from the tx when set explicitly (--nonce), otherwise from the
        // cached account so the journal bumps it on commit; a cold caller
        // raises an account miss during execution anyway, and
        // disable_nonce_check makes any residual mismatch harmless.
        let nonce = match &tx.nonce {
            Some(n) => parse_u256(n)?
                .try_into()
                .map_err(|_| format!("nonce out of range: {n}"))?,
            None => self
                .db
                .cache
                .accounts
                .get(&caller)
                .map(|a| a.info.nonce)
                .unwrap_or(0),
        };
        Ok(TxEnv {
            tx_type: 0,
            caller,
            gas_limit,
            gas_price: 0,
            kind,
            value,
            data,
            nonce,
            chain_id: Some(self.chain_id),
            ..Default::default()
        })
    }

    fn cfg_env(&self) -> CfgEnv {
        let mut cfg = CfgEnv::default();
        cfg.chain_id = self.chain_id;
        cfg.spec = SpecId::PRAGUE;
        cfg.tx_chain_id_check = false;
        cfg.disable_nonce_check = true;
        cfg.disable_balance_check = true;
        cfg.disable_block_gas_limit = true;
        cfg.disable_eip3607 = true;
        cfg.disable_base_fee = true;
        cfg
    }

    fn block_env(&self) -> BlockEnv {
        BlockEnv {
            number: U256::from(self.block_number()),
            beneficiary: Address::ZERO,
            timestamp: U256::from(self.base_timestamp + self.timestamp_offset),
            gas_limit: BLOCK_GAS_LIMIT,
            basefee: 0,
            difficulty: U256::ZERO,
            prevrandao: Some(B256::ZERO),
            ..Default::default()
        }
    }

    fn build_account(&self, balance: &str, nonce: u64, code: &str) -> Result<AccountInfo, String> {
        let (bytecode, code_hash) = build_bytecode(code)?;
        let mut info = AccountInfo::default();
        info.balance = parse_u256(balance)?;
        info.nonce = nonce;
        info.code_hash = code_hash;
        info.code = Some(bytecode);
        Ok(info)
    }
}

// ── parsing helpers ──

fn parse_addr(s: &str) -> Result<Address, String> {
    s.parse::<Address>().map_err(|e| format!("invalid address {s}: {e}"))
}

fn parse_u256(s: &str) -> Result<U256, String> {
    let stripped = s.strip_prefix("0x").unwrap_or(s);
    if stripped.is_empty() {
        return Ok(U256::ZERO);
    }
    U256::from_str_radix(stripped, 16).map_err(|e| format!("invalid hex quantity {s}: {e}"))
}

fn parse_b256(s: &str) -> Result<B256, String> {
    s.parse::<B256>().map_err(|e| format!("invalid hash {s}: {e}"))
}

fn parse_bytes(s: &str) -> Result<Bytes, String> {
    hex::decode(s)
        .map(Bytes::from)
        .map_err(|e| format!("invalid hex data {s}: {e}"))
}

fn build_bytecode(code: &str) -> Result<(Bytecode, B256), String> {
    let bytes = parse_bytes(code)?;
    if bytes.is_empty() {
        return Ok((Bytecode::default(), revm::primitives::KECCAK_EMPTY));
    }
    // new_raw_checked classifies raw 0xef0100‖addr bytes as an EIP-7702
    // delegation designator — required by the fork command's batched path.
    let bytecode =
        Bytecode::new_raw_checked(bytes).map_err(|e| format!("invalid bytecode: {e}"))?;
    let hash = bytecode.hash_slow();
    Ok((bytecode, hash))
}

// ── envelope helpers ──

fn u256_hex(v: U256) -> String {
    format!("0x{v:x}")
}

fn bytes_hex(b: &Bytes) -> String {
    hex::encode_prefixed(b)
}

fn addr_hex(a: &Address) -> String {
    format!("{a:?}")
}

fn ok_env() -> String {
    json!({ "kind": "ok" }).to_string()
}

fn value_env(v: &str) -> String {
    json!({ "kind": "value", "value": v }).to_string()
}

fn error_env(message: &str) -> String {
    json!({ "kind": "error", "message": message }).to_string()
}

fn first_err(errs: &[Option<String>]) -> String {
    errs.iter()
        .flatten()
        .next()
        .cloned()
        .unwrap_or_else(|| "invalid input".to_string())
}

fn miss_env(m: &Miss) -> String {
    let miss = match m {
        Miss::Account(a) => json!({ "type": "account", "address": addr_hex(a) }),
        Miss::Storage(a, k) => {
            json!({ "type": "storage", "address": addr_hex(a), "slot": u256_hex(*k) })
        }
        Miss::BlockHash(n) => json!({ "type": "blockhash", "number": n }),
        Miss::CodeByHash(h) => json!({ "type": "codehash", "hash": format!("{h:?}") }),
    };
    json!({ "kind": "misses", "misses": [miss] }).to_string()
}

fn result_env(result: ExecutionResult) -> String {
    match result {
        ExecutionResult::Success { gas, logs, output, .. } => {
            let logs: Vec<Value> = logs
                .iter()
                .map(|l| {
                    json!({
                        "address": addr_hex(&l.address),
                        "topics": l.data.topics().iter().map(|t| format!("{t:?}")).collect::<Vec<_>>(),
                        "data": bytes_hex(&l.data.data),
                    })
                })
                .collect();
            json!({
                "kind": "success",
                "returnData": bytes_hex(output.data()),
                "gasUsed": gas.tx_gas_used(),
                "logs": logs,
            })
            .to_string()
        }
        ExecutionResult::Revert { output, .. } => {
            json!({ "kind": "revert", "revertData": bytes_hex(&output) }).to_string()
        }
        ExecutionResult::Halt { reason, .. } => {
            json!({ "kind": "halt", "reason": format!("{reason:?}") }).to_string()
        }
    }
}
