---
title: "@lang:reduce"
---

Reduce an array to a single value by applying a helper.

**Returns**: `any`

## Syntax

```evml
@lang:reduce(arr fn initial)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |
| `fn` | `helper` | Reducer helper receiving `(accumulator, element)` |
| `initial` | `any` | Initial accumulator value |

<!-- HAND-WRITTEN -->

## See Also

- [@map](map.md) — transform each element
- [@filter](filter.md) — keep elements by predicate
