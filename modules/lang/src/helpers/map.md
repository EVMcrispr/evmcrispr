---
title: "@map"
---

Transform each element of an array by applying a helper.

**Returns**: `array`

## Syntax

```evml
@map(arr, fn)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |
| `fn` | `helper` | Transform helper applied to each element |

## Examples

```evml
# Double each element
def @double "$n: number -> number" @num($n * 2)
set $nums [1 2 3]
set $doubled @map($nums @double)
```

<!-- HAND-WRITTEN -->

## See Also

- [@filter](filter.md) — keep elements by predicate
- [@reduce](reduce.md) — fold an array to a single value
- [loop](../../commands/loop.md) — imperative iteration
