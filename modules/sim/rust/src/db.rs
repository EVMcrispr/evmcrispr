use core::fmt;

use revm::database_interface::{DBErrorMarker, DatabaseRef};
use revm::primitives::{Address, StorageKey, StorageValue, B256};
use revm::state::{AccountInfo, Bytecode};

/// A state read that the in-memory cache could not serve. Surfaced to the TS
/// wrapper as a structured "misses" envelope; the wrapper fetches the data
/// over JSON-RPC, inserts it, and re-executes.
#[derive(Debug, Clone)]
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

/// Fallback database that holds no state: every read is a `Miss`. Wrapped in
/// `CacheDB`, which serves everything previously inserted and only falls
/// through here for genuinely uncached reads — so execution fails fast on the
/// first cold access and each replay iteration makes progress.
pub struct MissDb;

impl DatabaseRef for MissDb {
    type Error = Miss;

    fn basic_ref(&self, address: Address) -> Result<Option<AccountInfo>, Self::Error> {
        Err(Miss::Account(address))
    }

    fn code_by_hash_ref(&self, code_hash: B256) -> Result<Bytecode, Self::Error> {
        Err(Miss::CodeByHash(code_hash))
    }

    fn storage_ref(&self, address: Address, index: StorageKey) -> Result<StorageValue, Self::Error> {
        Err(Miss::Storage(address, index))
    }

    fn block_hash_ref(&self, number: u64) -> Result<B256, Self::Error> {
        Err(Miss::BlockHash(number))
    }
}
