# receipts module

Transaction and block receipts: addressed by hash or number you read a sealed receipt off-chain; with `!` you read the one being written, on-chain at execution time.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

```evml
load receipts
```

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@receipts:account](src/helpers/account.md) ⚗️ | `string` | Human-readable summary of an address: EOA / contract / EIP-7702-delegated EOA, verified contract name, proxy implementation, ENS name, balance and tx count. |
| [@receipts:tx](src/helpers/tx.md) ⚗️ | `string` | Human-readable summary of a transaction: status, labeled from/to, value, decoded function call, gas, fee and decoded logs. Use the @receipts:tx.* field helpers for machine-readable values. |
| [@receipts:tx.block](src/helpers/tx.block.md) ⚗️ | `number` | Block number a transaction was mined in. |
| [@receipts:tx.calldata](src/helpers/tx.calldata.md) ⚗️ | `bytes` | Full input data of a transaction, including the 4-byte selector. Replay it with `exec <target> <calldata>` or decode it with @abi.decodeCall. |
| [@receipts:tx.fee](src/helpers/tx.fee.md) ⚗️ | `number` | Total fee paid for a transaction, in wei (gasUsed x effectiveGasPrice, plus the L1 data fee on OP-stack chains). |
| [@receipts:tx.from](src/helpers/tx.from.md) ⚗️ | `address` | Sender address of a transaction. |
| [@receipts:tx.gasUsed](src/helpers/tx.gasUsed.md) ⚗️ | `number` | Gas used by a transaction (units of gas, not wei). |
| [@receipts:tx.status](src/helpers/tx.status.md) ⚗️ | `bool` | Whether a transaction succeeded: true on success, false when it reverted. Errors while the transaction is still pending. |
| [@receipts:tx.timestamp](src/helpers/tx.timestamp.md) ⚗️ | `number` | Unix timestamp (seconds) of the block a transaction was mined in. Compare against @date values. |
| [@receipts:tx.to](src/helpers/tx.to.md) ⚗️ | `address` | Recipient address of a transaction. Errors for contract-creation transactions (the created contract has no `to`). |
| [@receipts:tx.value](src/helpers/tx.value.md) ⚗️ | `number` | Native value sent with a transaction, in wei. |
| [@receipts:txs](src/helpers/txs.md) ⚗️ | `array` | Most recent transaction hashes sent to or from an address, newest first. Inspect individual entries with @receipts:tx. Needs an explorer API (Etherscan key or a chain with a Blockscout instance) — plain RPC cannot list per-address history. |

