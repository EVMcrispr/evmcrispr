---
title: "@find"
---

Return the first element that satisfies the predicate.

**Returns**: `any`

## Syntax

```evml
@find(arr, fn)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |
| `fn` | `helper` | Predicate helper returning bool |

## Examples

```evml
# Find first even number
def @isEven "$n: number -> bool" @bool(@num($n % 2) == 0)
set $nums [1 3 4 6]
set $first @find($nums @isEven)
```

<!-- HAND-WRITTEN -->

## See Also

- [@filter](filter.md) — return all matches
- [@includes](includes.md) — check if element exists
