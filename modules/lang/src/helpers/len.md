---
title: "@lang:len"
---

Return the length of an array. As @len! the decoded length of the dynamic return value of a call, on-chain: element count for arrays and nested array faces (@map!, @filter!, @safe:owners!, …), byte length for string/bytes.

**Returns**: `number`

## Syntax

```evml
@lang:len(value)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `array` | Input value (in @len! a `::` call expression or chain returning an array, string or bytes) |

<!-- HAND-WRITTEN -->

## See Also

- [@at](at.md) — access element by index
- [@slice](slice.md) — extract a sub-array
- [@str.len](str.len.md) — string length

## On-chain face (@len!)

The decoded length of the dynamic return value of a call, on-chain: element count for arrays, byte length for string/bytes.

### Examples

```evml
load assertions
load lang

set $gov 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1

# Top level: compiles to a core nav ending in the LEN sentinel
assertions:assert @len!($gov::{voters()(address[])}) >= 3 "not enough voters"
assertions:assert @len!($gov::{voters()(address[])}) != 0

# Nested: the same LEN-sentinel nav, composable as a number
assertions:assert @num!(@len!($gov::{voters()(address[])}) * 2) > 4
```

### Notes

- For a string/bytes return the decoded length is the byte length (UTF-8
  characters may span multiple bytes). For raw returndata size use
  `@bytes.len!`.
- Over a NESTED ARRAY FACE (`@len!(@filter!(…))`,
  `@len!(@safe:owners!())`) the length is the live ELEMENT COUNT of
  the words payload (its byte length over 32); byte lengths of
  string/bytes faces stay with `@bytes.len!`/`@str.len!`.

### See Also

- `assertions:assert`, `@bytes.len!`
