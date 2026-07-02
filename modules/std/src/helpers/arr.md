---
title: "@arr"
---

Generate an array of sequential integers from start (inclusive) to end (exclusive).

**Returns**: `array`

## Syntax

```evml
@arr(start, end)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `start` | `number` | Start value (inclusive) |
| `end` | `number` | End value (exclusive) |

## Examples

```evml
# Generate [0, 1, 2, 3, 4]
set $nums @arr(0 5)

# Generate [3, 4, 5, 6]
set $nums @arr(3 7)
```

<!-- HAND-WRITTEN -->

## See Also

- [loop](../../commands/loop.md) — iterate over arrays
