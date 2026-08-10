---
title: "@lang:reduce"
---

Reduce an array to a single value by applying a helper.

**On-chain (`@lang:reduce!`)**: The reducer is a two-parameter `def @name!` (accumulator first), or one of the bare names `add`, `mul`, `min`, `max`, `bitAnd`, `bitOr`, `bitXor`.

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

The reducer is either a NAMED definition of two parameters, or one of the
bare Operators names `add`, `mul`, `min`, `max`, `bitAnd`, `bitOr`,
`bitXor`.

A definition takes the accumulator first and the element second, and may
be anything — order-sensitive, composed, several calls deep:

```evml
def @subFrom! "$acc: number $e: number -> number" @num!($acc - $e)
```

The bare names, by contrast, are restricted to the commutative and
associative ones. That is not an inconsistency: the template is a left
fold, so with a bare `sub` the accumulator's side is invisible and
`@reduce!(caps sub 1000)` computes `((1000 - c0) - c1) …` while half of
readers picture `c - acc`. The two differ in the VALUE rather than in a
revert. A definition says which side the accumulator is on, so it has
nothing to hide and no gate to pass.

The accumulator may be named at most ONCE in the body: the engine carries
a single accumulator window, so `@num!($acc + $acc)` has nowhere to put the
second. The element has no such limit. A body that never names the
accumulator is accepted too, and behaves like a predicate.

The absorbing-initial-value check applies to the bare names only. It is
keyed on the reducer's identity, and there is no way to know what absorbs
a definition.

### Examples

```evml
load lang

set $vault 0x44fA8E6f47987339850636F88629646662444217

# The caps sum to at least 100
assert @reduce!($vault::{caps()(uint256[])} add 0) >= 100

# The largest cap (init 0 = identity for max over uints)
assert @reduce!($vault::{caps()(uint256[])} max 0) <= 1e18

# A product needs init 1, the identity for mul (init 0 is rejected)
assert @reduce!($vault::{ratios()(uint256[])} mul 1) > 0

# Signed elements pick the signed overload; the result is judged signed
assert @reduce!($vault::{deltas()(int256[])} min 0) <= 0

# A named reducer may be order-sensitive: the signature says which side
# the accumulator is on
def @subFrom! "$acc: number $e: number -> number" @num!($acc - $e)
assert @reduce!($vault::{caps()(uint256[])} @subFrom! 1000) > 0
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

- `assert`, `@all!`, `@len!`
