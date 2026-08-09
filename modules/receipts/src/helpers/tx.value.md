---
title: "@receipts:tx.value"
experimental: true
sidebar:
  label: "@receipts:tx.value ⚗️"
---

Native value sent with a transaction, in wei.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@receipts:tx.value(hash chain?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `hash` | `bytes32` | Transaction hash |
| `[chain]` | `chain` | Chain to look on (default: current chain) |

## Examples

```evml
# Read the native value of a transaction on another chain
set $wei @receipts:tx.value(0x5c504ed432cb51138bcf09aa5e8a410dd4a1e204ef84bfed1be16dfba1b22060 mainnet)
```

<!-- HAND-WRITTEN -->

## See Also

- [@receipts:tx.fee](tx.fee.md) — fee paid for a transaction
- [@receipts:tx](tx.md) — full transaction summary
