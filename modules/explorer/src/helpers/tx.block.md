---
title: "@explorer:tx.block"
experimental: true
sidebar:
  label: "@explorer:tx.block ⚗️"
---

Block number a transaction was mined in.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@explorer:tx.block(hash chain?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `hash` | `bytes32` | Transaction hash |
| `[chain]` | `chain` | Chain to look on (default: current chain) |

## Examples

```evml
# Read the block a transaction was mined in
set $block @explorer:tx.block(0x16df2e878e23ff261844fc9252f6c8bfcd4cb69f9f80895c6a2f01032b228e13)
```

<!-- HAND-WRITTEN -->

## See Also

- [@explorer:tx.timestamp](tx.timestamp.md) — timestamp a transaction was mined at
- [@explorer:tx](tx.md) — full transaction summary
