---
title: "@receipts:tx.from"
---

Sender of a transaction, addressed by hash.

**On-chain (`@receipts:tx.from!`)**: Reads the origin of the transaction being written (the ORIGIN opcode), and takes no arguments.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `address`

## Syntax

```evml
@receipts:tx.from(hash chain?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `hash` | `bytes32` | Transaction hash |
| `[chain]` | `chain` | Chain to look on (default: current chain) |

## Examples

```evml
# Read the sender of a transaction
set $sender @receipts:tx.from(0x16df2e878e23ff261844fc9252f6c8bfcd4cb69f9f80895c6a2f01032b228e13)
```

<!-- HAND-WRITTEN -->

## On-chain face (@tx.from!)

With `!` and no arguments the read happens on-chain at execution time: the origin (ORIGIN opcode) of the transaction being written, which is exactly the `from` field its receipt will seal. Gate a batch on who is executing it:

```evml
load assertions
load receipts

assertions:assert @tx.from! == @me "someone else is executing this batch"
```

## See Also

- [@receipts:tx.to](tx.to.md) — recipient of a transaction
- [@receipts:tx](tx.md) — full transaction summary
