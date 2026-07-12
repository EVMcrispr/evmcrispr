---
title: "@lang:filter"
---

Keep elements of an array for which a helper returns truthy.

**Returns**: `array`

## Syntax

```evml
@lang:filter(arr fn)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |
| `fn` | `helper` | Predicate helper returning bool |

<!-- HAND-WRITTEN -->

## See Also

- [@find](find.md) — return the first match
- [@all](all.md) — check if all elements match
- [@any](any.md) — check if any element matches
- [@map](map.md) — transform each element
