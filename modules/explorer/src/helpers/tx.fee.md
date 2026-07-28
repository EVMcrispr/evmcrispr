---
title: "@explorer:tx.fee"
experimental: true
sidebar:
  label: "@explorer:tx.fee ⚗️"
---

Total fee paid for a transaction, in wei (gasUsed x effectiveGasPrice, plus the L1 data fee on OP-stack chains).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@explorer:tx.fee(hash chain?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `hash` | `bytes32` | Transaction hash |
| `[chain]` | `chain` | Chain to look on (default: current chain) |

## Examples

```evml
# Read the total fee paid for a transaction
set $fee @explorer:tx.fee(0x16df2e878e23ff261844fc9252f6c8bfcd4cb69f9f80895c6a2f01032b228e13)
```

<!-- HAND-WRITTEN -->

## See Also

- [@explorer:tx.gasUsed](tx.gasUsed.md) — gas used by a transaction
- [@explorer:tx](tx.md) — full transaction summary
