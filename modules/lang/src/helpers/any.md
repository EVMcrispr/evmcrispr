---
title: "@any"
---

Return true if at least one element satisfies the predicate.

**Returns**: `bool`

## Syntax

```evml
@any(arr fn)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |
| `fn` | `helper` | Predicate helper returning bool |

## Examples

```evml
# Check if any negative
def @isNegative "$n: number -> bool" @bool($n < 0)
print @any([1 -2 3] @isNegative)
```

<!-- HAND-WRITTEN -->

## See Also

- [@all](all.md) — true if all match
- [@filter](filter.md) — keep matching elements
