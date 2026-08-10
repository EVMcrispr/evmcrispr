---
title: "@lang:sum"
---

Sum the elements of an array.

**Returns**: `number`

## Syntax

```evml
@lang:sum(arr)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |

<!-- HAND-WRITTEN -->

## See Also

- [@reduce](reduce.md) — fold an array with any binary Operators lambda
- [@map](map.md) — transform each element

## On-chain face (@sum!)

Sum the array return of a call into one word, on-chain: a native
`sumWords` over the word payload. This is the fixed-operation form of
`@reduce!(add 0)` (one on-chain loop instead of a per-element `foldWords`
lambda call, so it is cheaper). Reach for `@reduce!` when you need a
different reduction (min, max, bitOr, bitAnd) or a nonzero initial
accumulator.

### Examples

```evml
load assertions
load lang

set $vault 0x44fA8E6f47987339850636F88629646662444217

# The caps sum to at least 100
assertions:assert @sum!($vault::{caps()(uint256[])}) >= 100

# Sum a mapped payload (double each element first)
assertions:assert @sum!(@map!($vault::{caps()(uint256[])} @num!(* 2))) >= 200
```

### Notes

- Arrays of single-word elements only; the result is judged as a uint
  word (the checked sum overflows-reverts past 2^256 - 1).
- An empty array sums to 0.
- An average is `@num!(@sum!(...) / @len!(...))`.

### See Also

- `assertions:assert`, `@reduce!`, `@len!`
