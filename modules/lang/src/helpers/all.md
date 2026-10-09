---
title: "@lang:all"
---

Whether every element satisfies the predicate.

**On-chain (`@lang:all!`)**: Predicates return bool and stop at the first decisive result. Supports typed dynamic arrays and word-specialized predicates.

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
- [@count](count.md): how many match

## On-chain face (@all!)

Return true if every element satisfies a named boolean callback, stopping at the first failure. Empty arrays return true. Callbacks support composed helpers and ABI calls over typed single-word or multiword elements.

A predicate that compares one call over the element with a value, such as a balance against a minimum, costs one call per element. The value may be a call of its own: it is read once, not once per element.
