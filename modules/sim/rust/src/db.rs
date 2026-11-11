use core::cell::{Cell, RefCell};
use core::fmt;

use revm::database_interface::{DBErrorMarker, DatabaseRef};
use revm::primitives::{Address, StorageKey, StorageValue, B256};
use revm::state::{AccountInfo, Bytecode};

/// A state read that the in-memory cache could not serve. Surfaced to the TS
/// wrapper as a structured "misses" envelope; the wrapper fetches the data
/// over JSON-RPC, inserts it, and re-executes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Miss {
    Account(Address),
    Storage(Address, StorageKey),
    BlockHash(u64),
    /// Code requested by hash without the account having been inserted with
    /// its code. Unresolvable from JSON-RPC (no address context) — indicates
    /// a seeding bug, never expected in normal operation.
    CodeByHash(B256),
}

impl fmt::Display for Miss {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Miss::Account(a) => write!(f, "missing account {a}"),
            Miss::Storage(a, k) => write!(f, "missing storage {a} slot {k}"),
            Miss::BlockHash(n) => write!(f, "missing block hash {n}"),
            Miss::CodeByHash(h) => write!(f, "missing code for hash {h}"),
        }
    }
}

impl std::error::Error for Miss {}
impl DBErrorMarker for Miss {}

/// Fallback database that holds no state. Wrapped in `CacheDB`, which serves
/// everything previously inserted and only falls through here for genuinely
/// uncached reads.
///
/// Outside a transaction a cold read is an error: the caller reports it and
/// the wrapper fetches it. During one (`recording`), a cold read is noted and
/// answered as empty (no account, a zero word, a zero hash), so execution
/// goes on and one pass finds every cold read it can reach, instead of one
/// per replay: a transaction touching hundreds of accounts and slots used to
/// replay once for each. Up to the first miss the run is exact, so a pass
/// always finds at least what failing fast would. The empty answers are
/// wrong, so the run's result is discarded and `Fork` removes what they put
/// in the cache (see `Fork::forget`).
#[derive(Default)]
pub struct MissDb {
    recording: Cell<bool>,
    misses: RefCell<Vec<Miss>>,
}

impl MissDb {
    pub fn record(&self, on: bool) {
        self.recording.set(on);
    }

    /// The misses recorded since the last call, each once, in the order met.
    pub fn take_misses(&self) -> Vec<Miss> {
        std::mem::take(&mut *self.misses.borrow_mut())
    }

    fn miss<T>(&self, miss: Miss, empty: T) -> Result<T, Miss> {
        if !self.recording.get() {
            return Err(miss);
        }
        let mut misses = self.misses.borrow_mut();
        if !misses.contains(&miss) {
            misses.push(miss);
        }
        Ok(empty)
    }
}

impl DatabaseRef for MissDb {
    type Error = Miss;

    fn basic_ref(&self, address: Address) -> Result<Option<AccountInfo>, Self::Error> {
        self.miss(Miss::Account(address), None)
    }

    fn code_by_hash_ref(&self, code_hash: B256) -> Result<Bytecode, Self::Error> {
        // Never answered empty: code is always inserted with its account, so
        // this is a seeding bug to report, not state to fetch.
        Err(Miss::CodeByHash(code_hash))
    }

    fn storage_ref(&self, address: Address, index: StorageKey) -> Result<StorageValue, Self::Error> {
        self.miss(Miss::Storage(address, index), StorageValue::ZERO)
    }

    fn block_hash_ref(&self, number: u64) -> Result<B256, Self::Error> {
        self.miss(Miss::BlockHash(number), B256::ZERO)
    }
}
