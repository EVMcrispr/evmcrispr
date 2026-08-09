# receipts module

Transaction and block receipts: addressed by hash or number you read a sealed receipt off-chain; with `!` you read the one being written, on-chain at execution time.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

```evml
load receipts
```

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@receipts:block.basefee!](src/helpers/block.basefee.md) | `number` | The block base fee in wei at assertion time: gate a batch on fee conditions. |
| [@receipts:block.blobbasefee!](src/helpers/block.blobbasefee.md) | `number` | The blob base fee in wei at assertion time. |
| [@receipts:block.coinbase!](src/helpers/block.coinbase.md) | `address` | The block proposer fee recipient address at assertion time. |
| [@receipts:block.gaslimit!](src/helpers/block.gaslimit.md) | `number` | The block gas limit at assertion time. |
| [@receipts:block.hash!](src/helpers/block.hash.md) | `bytes32` | The hash of a block, read at assertion time (0 for the current block, the future, and blocks older than 256). Compose the number live, e.g. @block.hash!(@block.number! - 1). |
| [@receipts:block.number](src/helpers/block.number.md) | `number` | The block number: the latest block at script build time as @block.number, the block at assertion time as @block.number!. |
| [@receipts:block.prevrandao!](src/helpers/block.prevrandao.md) | `number` | The previous RANDAO mix of the block at assertion time, as a number. |
| [@receipts:block.timestamp](src/helpers/block.timestamp.md) | `number` | The block timestamp: the latest block at script build time as @block.timestamp, the block at assertion time as @block.timestamp!. |
| [@receipts:tx](src/helpers/tx.md) ⚗️ | `string` | Human-readable summary of a transaction: status, labeled from/to, value, decoded function call, gas, fee and decoded logs. Use the @receipts:tx.* field helpers for machine-readable values. |
| [@receipts:tx.blobhash!](src/helpers/tx.blobhash.md) | `bytes32` | The versioned hash of a blob carried by the executing transaction, read on-chain at execution time (0 when the index is out of range). Assert a blob is present with @tx.blobhash!(0) != 0. |
| [@receipts:tx.block](src/helpers/tx.block.md) ⚗️ | `number` | Block number a transaction was mined in. |
| [@receipts:tx.calldata](src/helpers/tx.calldata.md) ⚗️ | `bytes` | Full input data of a transaction, including the 4-byte selector. Replay it with `exec <target> <calldata>` or decode it with @abi.decodeCall. |
| [@receipts:tx.count](src/helpers/tx.count.md) ⚗️ | `number` | Number of transactions sent from an address (its account nonce), read over plain RPC. For contracts the nonce counts the CREATEs they performed. Off-chain only: the EVM has no nonce opcode, so no on-chain form exists. |
| [@receipts:tx.fee](src/helpers/tx.fee.md) ⚗️ | `number` | Total fee paid for a transaction, in wei (gasUsed x effectiveGasPrice, plus the L1 data fee on OP-stack chains). |
| [@receipts:tx.from](src/helpers/tx.from.md) ⚗️ | `address` | Sender address of a transaction. |
| [@receipts:tx.gasUsed](src/helpers/tx.gasUsed.md) ⚗️ | `number` | Gas used by a transaction (units of gas, not wei). |
| [@receipts:tx.gasprice!](src/helpers/tx.gasprice.md) | `number` | The gas price of the executing transaction in wei, read on-chain at execution time: bound what the batch is willing to pay, e.g. @tx.gasprice! <= 50e9. |
| [@receipts:tx.origin!](src/helpers/tx.origin.md) | `address` | The transaction origin address at assertion time: gate a batch on who is executing it. |
| [@receipts:tx.status](src/helpers/tx.status.md) ⚗️ | `bool` | Whether a transaction succeeded: true on success, false when it reverted. Errors while the transaction is still pending. |
| [@receipts:tx.timestamp](src/helpers/tx.timestamp.md) ⚗️ | `number` | Unix timestamp (seconds) of the block a transaction was mined in. Compare against @date values. |
| [@receipts:tx.to](src/helpers/tx.to.md) ⚗️ | `address` | Recipient address of a transaction. Errors for contract-creation transactions (the created contract has no `to`). |
| [@receipts:tx.value](src/helpers/tx.value.md) ⚗️ | `number` | Native value sent with a transaction, in wei. |
| [@receipts:txs](src/helpers/txs.md) ⚗️ | `array` | Most recent transaction hashes sent to or from an address, newest first. Inspect individual entries with @receipts:tx. Needs an explorer API (Etherscan key or a chain with a Blockscout instance) — plain RPC cannot list per-address history. |

