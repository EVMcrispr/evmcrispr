---
title: "@unique"
---

Remove duplicates from an array, preserving first-occurrence order.

**Returns**: `array`

## Syntax

```evml
@unique(arr)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |

## Examples

```evml
# Remove duplicates
set $arr [1 2 2 3 1 3]
set $uniq @unique($arr)
```

<!-- HAND-WRITTEN -->

## See Also

- [@filter](filter.md) — custom duplicate removal
