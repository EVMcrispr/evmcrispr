mod db;
mod exec;

pub use exec::Fork;

use wasm_bindgen::prelude::*;

/// Long-lived per-chain fork holding an in-memory `CacheDB`. Fallible methods
/// return a tagged JSON envelope string: `ok` / `value` / `success` / `revert`
/// / `halt` / `misses` / `error` — see `exec.rs`. The TS wrapper resolves
/// `misses` over JSON-RPC, seeds the cache via `insert*`, and retries.
#[wasm_bindgen]
pub struct RevmFork {
    inner: Fork,
}

#[wasm_bindgen]
impl RevmFork {
    #[wasm_bindgen(constructor)]
    pub fn new(chain_id: u64, block_number: u64, base_timestamp: u64) -> RevmFork {
        RevmFork {
            inner: Fork::new(chain_id, block_number, base_timestamp),
        }
    }

    #[wasm_bindgen(js_name = insertAccount)]
    pub fn insert_account(&mut self, addr: &str, balance: &str, nonce: u64, code: &str) -> String {
        self.inner.insert_account(addr, balance, nonce, code)
    }

    #[wasm_bindgen(js_name = insertStorage)]
    pub fn insert_storage(&mut self, addr: &str, slot: &str, value: &str) -> String {
        self.inner.insert_storage(addr, slot, value)
    }

    #[wasm_bindgen(js_name = insertBlockHash)]
    pub fn insert_block_hash(&mut self, number: u64, hash: &str) -> String {
        self.inner.insert_block_hash(number, hash)
    }

    #[wasm_bindgen(js_name = setBalance)]
    pub fn set_balance(&mut self, addr: &str, balance: &str) -> String {
        self.inner.set_balance(addr, balance)
    }

    #[wasm_bindgen(js_name = setCode)]
    pub fn set_code(&mut self, addr: &str, code: &str) -> String {
        self.inner.set_code(addr, code)
    }

    #[wasm_bindgen(js_name = setStorage)]
    pub fn set_storage(&mut self, addr: &str, slot: &str, value: &str) -> String {
        self.inner.set_storage(addr, slot, value)
    }

    pub fn mine(&mut self, blocks: u64) {
        self.inner.mine(blocks)
    }

    #[wasm_bindgen(js_name = increaseTime)]
    pub fn increase_time(&mut self, seconds: u64) {
        self.inner.increase_time(seconds)
    }

    #[wasm_bindgen(js_name = blockNumber)]
    pub fn block_number(&self) -> u64 {
        self.inner.block_number()
    }

    #[wasm_bindgen(js_name = getBalance)]
    pub fn get_balance(&mut self, addr: &str) -> String {
        self.inner.get_balance(addr)
    }

    #[wasm_bindgen(js_name = getCode)]
    pub fn get_code(&mut self, addr: &str) -> String {
        self.inner.get_code(addr)
    }

    #[wasm_bindgen(js_name = getStorage)]
    pub fn get_storage(&mut self, addr: &str, slot: &str) -> String {
        self.inner.get_storage(addr, slot)
    }

    pub fn call(&mut self, tx_json: &str) -> String {
        self.inner.call(tx_json)
    }

    pub fn transact(&mut self, tx_json: &str) -> String {
        self.inner.transact(tx_json)
    }
}
