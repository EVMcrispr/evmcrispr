---
title: "@lang:find"
---

Return the first element that satisfies the predicate.

**Returns**: `any`

## Syntax

```evml
@lang:find(arr fn)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |
| `fn` | `helper` | Predicate helper returning bool |

<!-- HAND-WRITTEN -->

## See Also

- [@filter](filter.md) — return all matches
- [@includes](includes.md) — check if element exists
