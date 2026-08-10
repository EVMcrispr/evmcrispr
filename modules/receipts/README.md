# receipts module

Transaction and block data: sealed receipts and blocks addressed by hash or number, and the transaction and block currently being written.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

```evml
load receipts
```

## Helpers

| Helper | Returns | Description |
|--------|---------|-------------|
| [@receipts:block.baseFee](src/helpers/block.baseFee.md) | `number` | Base fee in wei of a sealed block, addressed by number or tag (default: latest). |
| [@receipts:block.blobBaseFee](src/helpers/block.blobBaseFee.md) | `number` | Blob base fee in wei: the live value with no arguments, or the EIP-4844 value of a sealed block computed from its excess blob gas (blocks predating EIP-4844 error). |
| [@receipts:block.coinbase](src/helpers/block.coinbase.md) | `address` | Fee recipient address of a sealed block, addressed by number or tag (default: latest). |
| [@receipts:block.gasLimit](src/helpers/block.gasLimit.md) | `number` | Gas limit of a sealed block, addressed by number or tag (default: latest). |
| [@receipts:block.hash](src/helpers/block.hash.md) | `bytes32` | Hash of a sealed block, addressed by number or tag (default: latest). |
| [@receipts:block.number](src/helpers/block.number.md) | `number` | Number of a sealed block, addressed by number or tag (default: latest, so tags like finalized resolve to their current number). |
| [@receipts:block.prevrandao](src/helpers/block.prevrandao.md) | `number` | RANDAO mix of a sealed block, as a number, addressed by number or tag (default: latest; pre-merge blocks carry proof-of-work difficulty semantics). |
| [@receipts:block.timestamp](src/helpers/block.timestamp.md) | `number` | Timestamp of a sealed block, addressed by number or tag (default: latest). |
| [@receipts:chainId](src/helpers/chainId.md) | `number` | The chain id of the chain the script runs against. |
| [@receipts:tx](src/helpers/tx.md) ⚗️ | `string` | Human-readable summary of a transaction: status, labeled from/to, value, decoded function call, gas, fee and decoded logs. Use the @receipts:tx.* field helpers for machine-readable values. |
| [@receipts:tx.blobHash!](src/helpers/tx.blobHash.md) | `bytes32` | Versioned hash of a blob carried by the executing transaction, or 0 when the index is out of range. |
| [@receipts:tx.block](src/helpers/tx.block.md) ⚗️ | `number` | Block number a transaction was mined in. |
| [@receipts:tx.calldata](src/helpers/tx.calldata.md) ⚗️ | `bytes` | Full input data of a transaction, including the 4-byte selector. Replay it with `exec <target> <calldata>` or decode it with @abi.decodeCall. |
| [@receipts:tx.fee](src/helpers/tx.fee.md) ⚗️ | `number` | Total fee paid for a transaction, in wei (gasUsed x effectiveGasPrice, plus the L1 data fee on OP-stack chains). |
| [@receipts:tx.from](src/helpers/tx.from.md) | `address` | Sender of a transaction, addressed by hash. |
| [@receipts:tx.gasPrice!](src/helpers/tx.gasPrice.md) | `number` | Gas price of the executing transaction, in wei. |
| [@receipts:tx.gasUsed](src/helpers/tx.gasUsed.md) ⚗️ | `number` | Gas used by a transaction (units of gas, not wei). |
| [@receipts:tx.status](src/helpers/tx.status.md) ⚗️ | `bool` | Whether a transaction succeeded: true on success, false when it reverted. Errors while the transaction is still pending. |
| [@receipts:tx.timestamp](src/helpers/tx.timestamp.md) ⚗️ | `number` | Unix timestamp (seconds) of the block a transaction was mined in. Compare against @date values. |
| [@receipts:tx.to](src/helpers/tx.to.md) ⚗️ | `address` | Recipient address of a transaction. Errors for contract-creation transactions (the created contract has no `to`). |
| [@receipts:tx.value](src/helpers/tx.value.md) ⚗️ | `number` | Native value sent with a transaction, in wei. |
| [@receipts:txs](src/helpers/txs.md) ⚗️ | `array` | Most recent transaction hashes sent to or from an address, newest first. Inspect individual entries with @receipts:tx. Needs an explorer API (Etherscan key or a chain with a Blockscout instance): plain RPC cannot list per-address history. |

