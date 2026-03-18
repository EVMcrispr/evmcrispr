---
title: "@sort"
---

Sort an array using a comparator helper.

**Returns**: `array`

## Syntax

```evml
@sort(arr, fn)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |
| `fn` | `helper` | Comparator helper returning a number |

## Examples

```evml
# Sort ascending
def @cmpAsc "$a: number $b: number -> number" @num($a - $b)
set $nums [3 1 4 1 5]
set $sorted @sort($nums @cmpAsc)
```

<!-- HAND-WRITTEN -->

## See Also

- [@reverse](reverse.md) — reverse an array
