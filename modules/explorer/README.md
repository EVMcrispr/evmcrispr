# explorer module

Inspect transactions and addresses: decoded tx summaries, account classification and history via RPC and block explorers.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

```evml
load explorer
```

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@explorer:account](src/helpers/account.md) ⚗️ | `string` | Human-readable summary of an address: EOA / contract / EIP-7702-delegated EOA, verified contract name, proxy implementation, ENS name, balance and tx count. |
| [@explorer:tx](src/helpers/tx.md) ⚗️ | `string` | Human-readable summary of a transaction: status, labeled from/to, value, decoded function call, gas, fee and decoded logs. Use the @explorer:tx.* field helpers for machine-readable values. |
| [@explorer:tx.block](src/helpers/tx.block.md) ⚗️ | `number` | Block number a transaction was mined in. |
| [@explorer:tx.calldata](src/helpers/tx.calldata.md) ⚗️ | `bytes` | Full input data of a transaction, including the 4-byte selector. Replay it with `exec <target> <calldata>` or decode it with @abi.decodeCall. |
| [@explorer:tx.fee](src/helpers/tx.fee.md) ⚗️ | `number` | Total fee paid for a transaction, in wei (gasUsed x effectiveGasPrice, plus the L1 data fee on OP-stack chains). |
| [@explorer:tx.from](src/helpers/tx.from.md) ⚗️ | `address` | Sender address of a transaction. |
| [@explorer:tx.gasUsed](src/helpers/tx.gasUsed.md) ⚗️ | `number` | Gas used by a transaction (units of gas, not wei). |
| [@explorer:tx.status](src/helpers/tx.status.md) ⚗️ | `bool` | Whether a transaction succeeded: true on success, false when it reverted. Errors while the transaction is still pending. |
| [@explorer:tx.timestamp](src/helpers/tx.timestamp.md) ⚗️ | `number` | Unix timestamp (seconds) of the block a transaction was mined in. Compare against @date values. |
| [@explorer:tx.to](src/helpers/tx.to.md) ⚗️ | `address` | Recipient address of a transaction. Errors for contract-creation transactions (the created contract has no `to`). |
| [@explorer:tx.value](src/helpers/tx.value.md) ⚗️ | `number` | Native value sent with a transaction, in wei. |
| [@explorer:txs](src/helpers/txs.md) ⚗️ | `array` | Most recent transaction hashes sent to or from an address, newest first. Inspect individual entries with @explorer:tx. Needs an explorer API (Etherscan key or a chain with a Blockscout instance) — plain RPC cannot list per-address history. |

