---
title: "@all"
---

Return true if every element satisfies the predicate.

**Returns**: `bool`

## Syntax

```evml
@all(arr, fn)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |
| `fn` | `helper` | Predicate helper returning bool |

## Examples

```evml
# Check all positive
def @isPositive "$n: number -> bool" @bool($n > 0)
print @all([1 2 3] @isPositive)
```

<!-- HAND-WRITTEN -->

## See Also

- [@any](any.md) — true if at least one matches
- [@filter](filter.md) — keep matching elements
