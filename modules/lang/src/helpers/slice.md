---
title: "@slice"
---

Extract a section of an array.

**Returns**: `array`

## Syntax

```evml
@slice(value, start, end?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `array` | Input value |
| `start` | `number` | Start index (inclusive) |
| `[end]` | `number` | End index (exclusive) |

## Examples

```evml
# Slice middle portion
set $arr [10 20 30 40 50]
set $mid @slice($arr 1 3)

# Slice from offset to end
set $arr [10 20 30 40 50]
set $tail @slice($arr 2)

# Negative index slice
set $arr [10 20 30 40 50]
set $last2 @slice($arr -2)
```

<!-- HAND-WRITTEN -->

## See Also

- [@at](at.md) — access a single element
- [@len](len.md) — array length
