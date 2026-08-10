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

The decoded length of the dynamic return value of a call, on-chain: element count for arrays, byte length for string/bytes.

### Examples

```evml
load lang

set $gov 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1

# Top level: compiles to a core nav ending in the LEN sentinel
assert @len!($gov::{voters()(address[])}) >= 3 "not enough voters"
assert @len!($gov::{voters()(address[])}) != 0

# Nested: the same LEN-sentinel nav, composable as a number
assert @num!(@len!($gov::{voters()(address[])}) * 2) > 4
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

- `assert`, `@bytes.len!`
