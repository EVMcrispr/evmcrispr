---
title: "@reverse"
---

Return a new array with elements in reverse order.

**Returns**: `array`

## Syntax

```evml
@reverse(arr)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |

## Examples

```evml
# Reverse an array
set $arr [1 2 3]
set $rev @reverse($arr)
```

<!-- HAND-WRITTEN -->

## See Also

- [@sort](sort.md) — sort by comparator
