---
title: "@assertions:split!"
---

Split the string return of a call on a delimiter and select one segment, on-chain. A negative index counts from the end (-1 = last segment).

**Returns**: `string`

## Syntax

```evml
@assertions:split!(call delimiter index)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `call` | `any` | A `::` call expression (or chain) returning a string |
| `delimiter` | `string` | Exact, non-empty byte sequence to split on |
| `index` | `number` | Segment index to select: zero-based from the start, negative from the end (-1 = last) |

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions

set $pool 0x44fA8E6f47987339850636F88629646662444217

# "Uniswap LP Token" -> segment 1 is "LP"
assertions:assert @split!($pool::{name()(string)} " " 1) == "LP"

# The name ends with "Token": negative index counts from the end, on-chain
assertions:assert @split!($pool::{name()(string)} " " -1) == "Token"
```

## Notes

- Splits on the exact byte sequence; adjacent delimiters produce empty
  segments and an out-of-range index (in either direction) reverts with
  SegmentIndexOutOfBounds.
- Negative indices resolve against the segment count at assertion time, so
  `-1` is the last segment however many the live value has.
- String-valued: compare with `==`/`!=`. At the top level the core judges
  the string directly; nested inside `@bool!` the comparison compiles to an
  on-chain keccak comparison of the two sides.

## See Also

- [assertions:assert](../commands/assert.md), [@assertions:hash!](hash.md)
