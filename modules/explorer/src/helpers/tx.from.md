---
title: "@explorer:tx.from"
experimental: true
sidebar:
  label: "@explorer:tx.from ⚗️"
---

Sender address of a transaction.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `address`

## Syntax

```evml
@explorer:tx.from(hash chain?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `hash` | `bytes32` | Transaction hash |
| `[chain]` | `chain` | Chain to look on (default: current chain) |

## Examples

```evml
# Read the sender of a transaction
set $sender @explorer:tx.from(0x16df2e878e23ff261844fc9252f6c8bfcd4cb69f9f80895c6a2f01032b228e13)
```

<!-- HAND-WRITTEN -->

## See Also

- [@explorer:tx.to](tx.to.md) — recipient of a transaction
- [@explorer:tx](tx.md) — full transaction summary
