---
title: "@lang:reduce"
---

Reduce an array to a single value by applying a helper.

**On-chain (`@lang:reduce!`)**: Accumulator comes first. Generic values and repeated accumulators accept composed ABI-typed definitions; word folds also accept associative operator names.

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

## On-chain face (@reduce!)

Fold left with the accumulator as the first callback parameter and the element as the second. Named callbacks can compose helpers and ABI calls over typed values; their output must match the accumulator type. Bare operator names remain available for supported word reductions.
