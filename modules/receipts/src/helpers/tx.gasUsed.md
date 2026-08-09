---
title: "@receipts:tx.gasUsed"
experimental: true
sidebar:
  label: "@receipts:tx.gasUsed ⚗️"
---

Gas used by a transaction (units of gas, not wei).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@receipts:tx.gasUsed(hash chain?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `hash` | `bytes32` | Transaction hash |
| `[chain]` | `chain` | Chain to look on (default: current chain) |

## Examples

```evml
# Read the gas used by a transaction
set $gas @receipts:tx.gasUsed(0x16df2e878e23ff261844fc9252f6c8bfcd4cb69f9f80895c6a2f01032b228e13)
```

<!-- HAND-WRITTEN -->

## See Also

- [@receipts:tx.fee](tx.fee.md) — total fee paid, in wei
- [@receipts:tx](tx.md) — full transaction summary
