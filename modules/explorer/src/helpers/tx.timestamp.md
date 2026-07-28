---
title: "@explorer:tx.timestamp"
experimental: true
sidebar:
  label: "@explorer:tx.timestamp ⚗️"
---

Unix timestamp (seconds) of the block a transaction was mined in. Compare against @date values.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@explorer:tx.timestamp(hash chain?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `hash` | `bytes32` | Transaction hash |
| `[chain]` | `chain` | Chain to look on (default: current chain) |

## Examples

```evml
# Read the timestamp a transaction was mined at
set $when @explorer:tx.timestamp(0x16df2e878e23ff261844fc9252f6c8bfcd4cb69f9f80895c6a2f01032b228e13)
```

<!-- HAND-WRITTEN -->

Compare against [@date](../../../std/src/helpers/date.md) values, e.g. `@date(now)`.

## See Also

- [@explorer:tx.block](tx.block.md) — block a transaction was mined in
- [@explorer:tx](tx.md) — full transaction summary
