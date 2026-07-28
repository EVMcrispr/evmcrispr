---
title: "@explorer:tx.to"
experimental: true
sidebar:
  label: "@explorer:tx.to ⚗️"
---

Recipient address of a transaction. Errors for contract-creation transactions (the created contract has no `to`).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `address`

## Syntax

```evml
@explorer:tx.to(hash chain?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `hash` | `bytes32` | Transaction hash |
| `[chain]` | `chain` | Chain to look on (default: current chain) |

## Examples

```evml
# Read the target of a transaction
set $target @explorer:tx.to(0x16df2e878e23ff261844fc9252f6c8bfcd4cb69f9f80895c6a2f01032b228e13)
```

<!-- HAND-WRITTEN -->

## See Also

- [@explorer:tx.from](tx.from.md) — sender of a transaction
- [@explorer:tx](tx.md) — full transaction summary
