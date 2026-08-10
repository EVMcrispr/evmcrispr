---
title: "@lang:str.slice"
---

Extract a section of a string.

**On-chain (`@lang:str.slice!`)**: Slices bytes, so a multi-byte UTF-8 character may be cut in half.

**Returns**: `string`

## Syntax

```evml
@lang:str.slice(value start end?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `string` | Source string or bytes value |
| `start` | `number` | Start index (inclusive; negative counts from the end) |
| `[end]` | `number` | End index (exclusive; negative counts from the end; omitted = to the end) |

<!-- HAND-WRITTEN -->

## See Also

- [@str.at](str.at.md) — access a single character
- [@slice](slice.md) — array slice

## On-chain face (@str.slice!)

Slice a byte range out of the string/bytes return of a call, on-chain. The
range compiles to a single `slice(data, start, len)` read; negative indexes
resolve against the live byte length at assertion time (`-k` compiles to
`sub(byteLen(s), k)`).

### Examples

```evml
load lang

set $pool 0x44fA8E6f47987339850636F88629646662444217

# First five bytes of the name
assert @str.slice!($pool::{name()(string)} 0 5) == "Curve"

# Last five bytes: the start resolves against the live length
assert @str.slice!($pool::{name()(string)} -5) == "Token"
```

### Notes

- Indexes are BYTE offsets: multi-byte UTF-8 characters span several.
- There is no silent clamp on-chain: an out-of-range or inverted range
  reverts with SliceOutOfBounds at assertion time (constant inverted
  ranges fail at build time).
- String-valued: compare with `==`/`!=`, or feed other string faces.

### See Also

- `assert`, `@str.at!`, `@str.split!`
