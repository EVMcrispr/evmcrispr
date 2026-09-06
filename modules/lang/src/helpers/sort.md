---
title: "@lang:sort"
---

Sort an array: ascending by default, `desc` for descending, or by a comparator helper.

**On-chain (`@lang:sort!`)**: Supports natural word ordering or an ABI-typed comparator definition, including composed expressions; equal elements retain their order.

**Returns**: `array`

## Syntax

```evml
@lang:sort(arr order?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |
| `[order]` | `helper \| string` | `asc` (default) or `desc`, or a comparator helper returning a number |

<!-- HAND-WRITTEN -->

## See Also

- [@reverse](reverse.md) — reverse an array

## On-chain face (@sort!)

Sort word values naturally, or provide a named comparator returning a signed integer: negative for before, zero for equal, positive for after. Typed multiword values require a comparator. Comparators may compose helpers and ABI calls. Equal elements retain their relative order.
