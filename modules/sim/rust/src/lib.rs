mod db;
mod exec;
mod frame;

pub use exec::Fork;

use revm::primitives::U256;
use wasm_bindgen::prelude::*;

use frame::{OpIn, OpOut};

#[wasm_bindgen]
extern "C" {
    /// The JS object answering a simulation's added opcodes:
    /// `opcode(op, address, isStatic, operandsJson) -> answerJson`.
    pub type FrameHost;

    #[wasm_bindgen(method, catch)]
    fn opcode(
        this: &FrameHost,
        op: u8,
        address: &str,
        is_static: bool,
        operands: &str,
    ) -> Result<String, JsValue>;
}

/// The JS host's answer, as JSON: `{push}`, `{write: {offset, data}}`,
/// `{return: {offset, size}}` or `{fail}`, numbers as 0x-hex.
fn parse_answer(answer: &str) -> OpOut {
    let value: serde_json::Value = match serde_json::from_str(answer) {
        Ok(v) => v,
        Err(e) => return OpOut::Fail(format!("the host's answer is not JSON: {e}")),
    };
    let hex = |v: &serde_json::Value| -> Option<U256> {
        let s = v.as_str()?;
        U256::from_str_radix(s.strip_prefix("0x").unwrap_or(s), 16).ok()
    };
    if let Some(p) = value.get("push").and_then(hex) {
        return OpOut::Push(p);
    }
    if let Some(w) = value.get("write") {
        let data = w
            .get("data")
            .and_then(|d| d.as_str())
            .and_then(|d| revm::primitives::hex::decode(d).ok());
        if let (Some(offset), Some(data)) = (w.get("offset").and_then(hex), data) {
            return OpOut::Write(offset, data);
        }
    }
    if let Some(r) = value.get("return") {
        if let (Some(offset), Some(size)) = (r.get("offset").and_then(hex), r.get("size").and_then(hex)) {
            return OpOut::Return(offset, size);
        }
    }
    OpOut::Fail(
        value
            .get("fail")
            .and_then(|f| f.as_str())
            .unwrap_or("the host gave no answer")
            .to_string(),
    )
}

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
    pub fn new(chain_id: u64, block_number: u64, base_timestamp: u64, base_fee: u64) -> RevmFork {
        RevmFork {
            inner: Fork::new(chain_id, block_number, base_timestamp, base_fee),
        }
    }

    #[wasm_bindgen(js_name = setBlockHeader)]
    pub fn set_block_header(
        &mut self,
        gas_limit: u64,
        prevrandao: &str,
        excess_blob_gas: u64,
        blob_base_fee: &str,
    ) -> String {
        self.inner
            .set_block_header(gas_limit, prevrandao, excess_blob_gas, blob_base_fee)
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

    #[wasm_bindgen(js_name = getNonce)]
    pub fn get_nonce(&mut self, addr: &str) -> String {
        self.inner.get_nonce(addr)
    }

    #[wasm_bindgen(js_name = setNonce)]
    pub fn set_nonce(&mut self, addr: &str, nonce: u64) -> String {
        self.inner.set_nonce(addr, nonce)
    }

    pub fn checkpoint(&mut self) {
        self.inner.checkpoint()
    }

    #[wasm_bindgen(js_name = startTrace)]
    pub fn start_trace(&mut self) {
        self.inner.start_trace()
    }

    #[wasm_bindgen(js_name = stopTrace)]
    pub fn stop_trace(&mut self) {
        self.inner.stop_trace()
    }

    #[wasm_bindgen(js_name = stateChanges)]
    pub fn state_changes(&self) -> String {
        self.inner.state_changes()
    }

    #[wasm_bindgen(js_name = commitCheckpoint)]
    pub fn commit_checkpoint(&mut self) -> String {
        self.inner.commit_checkpoint()
    }

    #[wasm_bindgen(js_name = revertCheckpoint)]
    pub fn revert_checkpoint(&mut self) -> String {
        self.inner.revert_checkpoint()
    }

    /// One top-level call of a module's simulation, its added opcodes
    /// answered by `host`. A JS throw is caught and becomes the opcode's
    /// failure: it never unwinds through the fork.
    #[wasm_bindgen(js_name = frameCall)]
    pub fn frame_call(&mut self, call_json: &str, host: &FrameHost) -> String {
        let mut hook = |input: OpIn| -> OpOut {
            let operands: Vec<String> = input.operands.iter().map(|o| format!("{o:#x}")).collect();
            let operands = serde_json::to_string(&operands).unwrap_or_default();
            match host.opcode(input.op, &format!("{:?}", input.address), input.is_static, &operands) {
                Ok(answer) => parse_answer(&answer),
                Err(e) => OpOut::Fail(format!("the host threw: {e:?}")),
            }
        };
        self.inner.frame_call(call_json, &mut hook)
    }
}
