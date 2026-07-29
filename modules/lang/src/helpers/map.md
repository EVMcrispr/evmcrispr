---
title: "@lang:map"
---

Transform each element of an array by applying a helper.

**Returns**: `array`

## Syntax

```evml
@lang:map(arr fn)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |
| `fn` | `helper` | Transform helper applied to each element |

<!-- HAND-WRITTEN -->

## See Also

- [@filter](filter.md) — keep elements by predicate
- [@reduce](reduce.md) — fold an array to a single value
- [loop](../../../std/src/commands/loop.md) — imperative iteration
