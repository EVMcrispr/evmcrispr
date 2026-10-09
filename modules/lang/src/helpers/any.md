---
title: "@lang:any"
---

Whether at least one element satisfies the predicate.

**On-chain (`@lang:any!`)**: Predicates return bool and stop at the first decisive result. Supports typed dynamic arrays and word-specialized predicates.

**Returns**: `bool`

## Syntax

```evml
@lang:any(arr fn)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |
| `fn` | `helper` | Predicate helper returning bool |

<!-- HAND-WRITTEN -->

## See Also

- [@all](all.md) — true if all match
- [@filter](filter.md) — keep matching elements
- [@count](count.md): how many match

## On-chain face (@any!)

Return true if a named boolean callback matches any element, stopping at the first match. Empty arrays return false. Callbacks support composed helpers and ABI calls over typed single-word or multiword elements.

A predicate that compares one call over the element with a value, such as a balance against a minimum, costs one call per element. The value may be a call of its own: it is read once, not once per element.
