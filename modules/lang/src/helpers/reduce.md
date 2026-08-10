---
title: "@lang:reduce"
---

Reduce an array to a single value by applying a helper.

**On-chain (`@lang:reduce!`)**: The reducer must be one of `add`, `min`, `max`, `bitOr` or `bitAnd`, and the initial accumulator a build-time value.

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

Fold the array return of a call into one word, on-chain: a `foldWords`
with a binary Operators lambda at the canonical accumulator/element
offsets (4/36) and a build-time initial accumulator.

The reducer is one of the binary Operators functions `add`, `min`, `max`,
`bitOr`, `bitAnd` (as a bareword, string, or helper reference like
`@min`).

### Examples

```evml
load assertions
load lang

set $vault 0x44fA8E6f47987339850636F88629646662444217

# The caps sum to at least 100
assertions:assert @reduce!($vault::{caps()(uint256[])} add 0) >= 100

# The largest cap (init 0 = identity for max over uints)
assertions:assert @reduce!($vault::{caps()(uint256[])} max 0) <= 1e18
```

### Notes

- Arrays of single-word elements only; the result is judged as a uint
  word.
- An average is `@num!(@reduce!(... add 0) / @len!(...))`.
- An empty array returns the initial accumulator.

### See Also

- `assertions:assert`, `@all!`, `@len!`
