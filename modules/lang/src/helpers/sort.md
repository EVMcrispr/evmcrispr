---
title: "@lang:sort"
---

Sort an array: ascending by default, `desc` for descending, or by a comparator helper.

**On-chain (`@lang:sort!`)**: Takes a direction rather than a comparator, and signed elements sort by value: the sign bit is flipped on the way in and back on the way out.

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

Sort the array return of a call on-chain through `sortWords`, ascending by
default and descending with a second argument:

```evml
load lang

set $safe 0x44fA8E6f47987339850636F88629646662444217

assert @at!(@sort!($safe::{caps()(uint256[])} desc) 0) >= 100
```

`desc` composes rather than adding anything on-chain: the array is sorted
ascending and then reversed, which is one extra node and no new contract
function.

Signed elements sort by VALUE, not by their raw word. Without that, every
negative would land after every positive, because a two's-complement
negative has its top bit set and reads as a huge unsigned number. The
compiler flips the sign bit on the way in and back on the way out, which
maps signed order onto unsigned order exactly and, unlike adding 2^255,
cannot overflow a checked add. It costs two extra passes of one call per
element, so it is only done when the elements are actually signed.

A comparator is refused. `sortWords` has no comparator hook, and a fold
lambda cannot express one either: sorting is not a reduction over
elements. Order by direction, and if you need a different key, `@map!` it
into one first and sort that.

### See Also

- `assert`, `@unique!`, `@map!`
