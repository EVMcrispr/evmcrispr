---
title: "@receipts:tx.to"
experimental: true
sidebar:
  label: "@receipts:tx.to ⚗️"
---

Recipient address of a transaction. Errors for contract-creation transactions (the created contract has no `to`).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `address`

## Syntax

```evml
@receipts:tx.to(hash chain?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `hash` | `bytes32` | Transaction hash |
| `[chain]` | `chain` | Chain to look on (default: current chain) |

## Examples

```evml
# Read the target of a transaction
set $target @receipts:tx.to(0x16df2e878e23ff261844fc9252f6c8bfcd4cb69f9f80895c6a2f01032b228e13)
```

<!-- HAND-WRITTEN -->

## See Also

- [@receipts:tx.from](tx.from.md) — sender of a transaction
- [@receipts:tx](tx.md) — full transaction summary
