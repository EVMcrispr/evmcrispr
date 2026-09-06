---
title: "@lang:map"
---

Transform each element of an array by applying a helper.

**On-chain (`@lang:map!`)**: Uses named callbacks that compose helpers and ABI calls, preserving argument and result types, including multiword values.

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

## On-chain face (@map!)

Apply a named callback to each element of a typed array. Callbacks may compose on-chain helpers and ABI calls, reuse parameters, and accept multiword values such as strings, tuples, and nested arrays. The result retains the callback output type. Shared nodes are evaluated once per callback invocation.
