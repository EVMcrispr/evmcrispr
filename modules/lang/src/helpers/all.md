---
title: "@lang:all"
---

Return true if every element satisfies the predicate.

**Returns**: `bool`

## Syntax

```evml
@lang:all(arr fn)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |
| `fn` | `helper` | Predicate helper returning bool |

<!-- HAND-WRITTEN -->

## See Also

- [@any](any.md) — true if at least one matches
- [@filter](filter.md) — keep matching elements
