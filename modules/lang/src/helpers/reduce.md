---
title: "@lang:reduce"
---

Reduce an array to a single value by applying a helper.

**On-chain (`@lang:reduce!`)**: The reducer is one of `add`, `mul`, `min`, `max`, `bitAnd`, `bitOr` or `bitXor`, and the initial accumulator a build-time value.

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

The reducer is one of the binary Operators functions `add`, `mul`, `min`,
`max`, `bitAnd`, `bitOr`, `bitXor` (as a bareword, string, or helper
reference like `@min`).

That list is exactly the commutative and associative ones, and the reason
is the window convention. The template is a LEFT fold — the accumulator
is always the first argument — so for an order-sensitive operation the
answer depends on a detail the script never sees. `@reduce!(caps sub 0)`
would compute `((0 - c0) - c1) …`, which is a different number from the
`c - acc` most readers picture, and the two differ in the value rather
than in a revert. `sub`, `div`, `mod`, `exp`, `shl` and `shr` therefore
stay out until the language can name which side the accumulator sits on.
`absDiff` is commutative but not associative, so a fold over it has no
statable meaning.

Comparisons (`eq`, `lt`, `ge`, …) are rejected with a pointer rather than
a list: folding a comparison over the elements is what `@all!` and
`@any!` already are, and they stop early on the exit that decides them.

The elements' own type picks the overload. Over an `int256[]` the signed
`add`, `mul`, `min` and `max` are used and the result is judged as a
signed word; the bitwise three have no signed reading and stay unsigned.

An initial accumulator that ABSORBS is rejected, because it makes the
whole fold constant: `mul` or `bitAnd` or `min` with `0` is always `0`.
A non-absorbing initial value is a legitimate clamp — `min 500` is "the
smallest cap, but no more than 500".

### Examples

```evml
load assertions
load lang

set $vault 0x44fA8E6f47987339850636F88629646662444217

# The caps sum to at least 100
assertions:assert @reduce!($vault::{caps()(uint256[])} add 0) >= 100

# The largest cap (init 0 = identity for max over uints)
assertions:assert @reduce!($vault::{caps()(uint256[])} max 0) <= 1e18

# A product needs init 1, the identity for mul (init 0 is rejected)
assertions:assert @reduce!($vault::{ratios()(uint256[])} mul 1) > 0

# Signed elements pick the signed overload; the result is judged signed
assertions:assert @reduce!($vault::{deltas()(int256[])} min 0) <= 0
```

### Notes

- Arrays of single-word elements only; the result is judged as a uint
  word, or a signed word when the elements are signed and the reducer has
  a signed overload.
- An average is `@num!(@reduce!(... add 0) / @len!(...))`.
- An empty array returns the initial accumulator.
- `add` and `mul` are checked, so an overflowing fold reverts rather than
  wrapping. That is the right failure for an assertion: a wrapped sum is
  a wrong-answer machine.
- Signedness is lost through a nested face — `@reduce!(@map!(…) min 0)`
  folds unsigned even over signed elements, because a nested array face
  reports its elements as words. `@all!` and `@filter!` share the gap.

### See Also

- `assertions:assert`, `@all!`, `@len!`
