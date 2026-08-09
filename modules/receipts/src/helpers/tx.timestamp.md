---
title: "@receipts:tx.timestamp"
experimental: true
sidebar:
  label: "@receipts:tx.timestamp ⚗️"
---

Unix timestamp (seconds) of the block a transaction was mined in. Compare against @date values.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@receipts:tx.timestamp(hash chain?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `hash` | `bytes32` | Transaction hash |
| `[chain]` | `chain` | Chain to look on (default: current chain) |

## Examples

```evml
# Read the timestamp a transaction was mined at
set $when @receipts:tx.timestamp(0x16df2e878e23ff261844fc9252f6c8bfcd4cb69f9f80895c6a2f01032b228e13)
```

<!-- HAND-WRITTEN -->

Compare against [@date](../../../std/src/helpers/date.md) values, e.g. `@date(now)`.

## See Also

- [@receipts:tx.block](tx.block.md) — block a transaction was mined in
- [@receipts:tx](tx.md) — full transaction summary
