---
title: "@block"
---

Return [number, timestamp] of the latest or a specific block.

**Returns**: `any`

## Syntax

```evml
@block(blockNumber?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[blockNumber]` | `number` | Block number (omit for latest) |

## Examples

```evml
# Get latest block number and timestamp
set [$num $timestamp] @block()
print $num
print $timestamp

# Get a specific block's timestamp
set [$num $timestamp] @block(1)
print $timestamp
```

<!-- HAND-WRITTEN -->

## See Also

- [@date](date.md) — convert a date to a Unix timestamp
