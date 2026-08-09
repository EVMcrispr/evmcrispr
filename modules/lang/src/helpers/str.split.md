---
title: "@lang:str.split"
---

Split a string by a delimiter into an array of strings, or select one segment when an index is given. As @str.split! the string return of a call is split on-chain and the indexed segment selected (the index is required there).

**Returns**: `array | string`

## Syntax

```evml
@lang:str.split(s delim index?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `s` | `string` | Source string (in @str.split! a `::` call expression or chain returning a string) |
| `delim` | `string` | Exact, non-empty delimiter byte sequence |
| `[index]` | `number` | Segment to select instead of the whole array: zero-based from the start, or negative from the end (-1 = last, -2 = second-last, …). Required in @str.split! |

<!-- HAND-WRITTEN -->

## See Also

- [@str.join](str.join.md) — join array into a string

## On-chain face (@str.split!)

Split the string return of a call on a delimiter and select one segment, on-chain. Segment indexes are 0, 1, 2, … from the start, or -1, -2, … from the end (-1 is the last segment).

### Examples

```evml
load assertions
load lang

set $pool 0x44fA8E6f47987339850636F88629646662444217

# "Uniswap LP Token" -> segment 1 is "LP"
assertions:assert @str.split!($pool::{name()(string)} " " 1) == "LP"

# The name ends with "Token": negative index counts from the end, on-chain
assertions:assert @str.split!($pool::{name()(string)} " " -1) == "Token"
```

### Notes

- Splits on the exact byte sequence; adjacent delimiters produce empty
  segments and an out-of-range index (in either direction) reverts with
  SegmentIndexOutOfBounds.
- Negative indices resolve against the segment count at assertion time, so
  `-1` is the last segment however many the live value has.
- String-valued: compare with `==`/`!=`. At the top level the core judges
  the string directly; nested inside `@bool!` the comparison compiles to an
  on-chain keccak comparison of the two sides.

### See Also

- `assertions:assert`, `@hash!`
