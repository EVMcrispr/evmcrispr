---
title: "@reduce"
---

Reduce an array to a single value by applying a helper.

**Returns**: `any`

## Syntax

```evml
@reduce(arr, fn, initial)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |
| `fn` | `helper` | Reducer helper receiving `(accumulator, element)` |
| `initial` | `any` | Initial accumulator value |

## Examples

```evml
# Sum an array
def @add "$acc: number $n: number -> number" @num($acc + $n)
set $nums [1 2 3 4]
set $sum @reduce($nums @add 0)
```

<!-- HAND-WRITTEN -->

## See Also

- [@map](map.md) — transform each element
- [@filter](filter.md) — keep elements by predicate
