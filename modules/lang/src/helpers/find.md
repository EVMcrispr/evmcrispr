---
title: "@lang:find"
---

First element that satisfies the predicate; no match is an error.

**On-chain (`@lang:find!`)**: Returns the first matching typed value and stops evaluating predicates immediately; no match reverts.

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

## On-chain face (@find!)

Return the first element satisfying a named boolean callback and stop immediately. No match raises an error in both modes. The returned value preserves the element type, including strings, tuples, and nested arrays.
