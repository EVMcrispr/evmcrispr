---
title: "@lang:len"
---

Length of a value: element count for an array, byte length for a string or bytes.

**Returns**: `number`

## Syntax

```evml
@lang:len(value)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `array` | Source array, string or bytes value |

<!-- HAND-WRITTEN -->

## See Also

- [@at](at.md) — access element by index
- [@slice](slice.md) — extract a sub-array
- [@str.len](str.len.md) — string length

## On-chain face (@len!)

The element count of a literal, live fixed-size or dynamic array, or nested collection helper. For a call returning string/bytes, return its decoded byte length.

### Examples

```evml
load lang

set $gov 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1

# Top level: compiles to a core nav ending in the LEN sentinel
assert @len!($gov::{voters()(address[])}) >= 3 "not enough voters"
assert @len!($gov::{voters()(address[])}) != 0

# Nested: the same LEN-sentinel nav, composable as a number
assert @calc!(@len!($gov::{voters()(address[])}) * 2) > 4
```

### Notes

- For a string/bytes return the decoded length is the byte length (UTF-8
  characters may span multiple bytes). For raw returndata size use
  `@bytes.len!`.
- Over a nested collection helper (`@len!(@filter!(…))`,
  `@len!(@safe:owners!())`) the length is the live element count. Pairs
  count as one element. Generic pipelines can return their count without
  first packing the final array; byte lengths of string/bytes helpers stay
  with `@bytes.len!`/`@str.len!`.

### See Also

- `assert`, `@bytes.len!`

Return-value lenses can select whole fixed arrays, including inside tuples and
other arrays. The full selected value must be present; a truncated return reverts
even when its declared fixed length is known at compile time.
