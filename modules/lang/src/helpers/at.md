---
title: "@lang:at"
---

Access an element by index in an array.

**Returns**: `any`

## Syntax

```evml
@lang:at(value index)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `array` | Source array |
| `index` | `number` | Zero-based index (negative counts from the end) |

<!-- HAND-WRITTEN -->

## See Also

- [@slice](slice.md) — extract a sub-array

## On-chain face (@at!)

Select one element of the array return of a call through a typed `nav`
step, on-chain. Negative indexes stay negative for dynamic arrays and
resolve from the end at assertion time; fixed-size arrays resolve (and
bounds-check) them at build time.

### Examples

```evml
load assertions
load lang

set $safe 0x44fA8E6f47987339850636F88629646662444217

# The second owner
assertions:assert @at!($safe::{getOwners()(address[])} 1) == @me

# The last owner, resolved against the live length
assertions:assert @at!($safe::{getOwners()(address[])} -1) == @me
```

### Notes

- Works on any element type the word machine or the string faces can
  judge (single words, and string/bytes elements as their envelopes);
  struct or nested-array elements need a deeper lens instead.
- A lens on the call selects WHICH array first:
  `@at!($c::{config()(uint256,address[])}[_ $] 0)`.
- An out-of-range index reverts with an index error at assertion time.
- Over a NESTED ARRAY FACE (`@at!(@sort!(…) 0)`,
  `@at!(@safe:owners!() -1)`) the element is a core `pick` into the
  live words payload: an untyped word (negative indexes still count
  from the end).

### See Also

- `assertions:assert`, `@len!`
