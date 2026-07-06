---
title: "@filter"
---

Keep elements of an array for which a helper returns truthy.

**Returns**: `array`

## Syntax

```evml
@filter(arr fn)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |
| `fn` | `helper` | Predicate helper returning bool |

## Examples

```evml
# Filter positive numbers
def @isPositive "$n: number -> bool" @bool($n > 0)
set $nums [-1 2 -3 4]
set $pos @filter($nums @isPositive)
```

<!-- HAND-WRITTEN -->

## See Also

- [@find](find.md) — return the first match
- [@all](all.md) — check if all elements match
- [@any](any.md) — check if any element matches
- [@map](map.md) — transform each element
