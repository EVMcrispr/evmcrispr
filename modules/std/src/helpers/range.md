---
title: "@range"
---

Generate an array of sequential integers from start (inclusive) to end (exclusive).

**Returns**: `array`

## Syntax

```evml
@range(start, end)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `start` | `number` | Start index (inclusive) |
| `end` | `number` | End value (exclusive) |

## Examples

```evml
# Generate a range
set $nums @range(0 5)

# Range with offset start
set $nums @range(3 7)
```

<!-- HAND-WRITTEN -->

## See Also

- [for](../../commands/for.md) — iterate over arrays
- [@map](map.md) — transform each element
