---
title: "@lang:bytes.slice"
---

Extract a byte range from a bytes value.

**Returns**: `bytes`

## Syntax

```evml
@lang:bytes.slice(value start end?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `bytes` | Source bytes or string value |
| `start` | `number` | Start index (inclusive; negative counts from the end) |
| `[end]` | `number` | End index (exclusive; negative counts from the end; omitted = to the end) |

<!-- HAND-WRITTEN -->

## See Also

- [@bytes.at](bytes.at.md) — access a single byte
- [@slice](slice.md) — array slice

## On-chain face (@bytes.slice!)

A byte range of the bytes/string return of a call: the @str.slice!
recipe with the Bytes category. The off-chain (start, end) pair
converts to the on-chain (start, len) at composition time; negative
bounds compile to `sub(byteLen(s), k)` and resolve against the live
byte length at assertion time.

### Examples

```evml
load assertions
load lang

set $oracle 0x44fA8E6f47987339850636F88629646662444217

# Bytes [1, 3) of the blob
assertions:assert @bytes.slice!($oracle::{blob()(bytes)} 1 3) == 0xabcd

# The last four bytes, resolved against the live length
assertions:assert @bytes.slice!($oracle::{blob()(bytes)} -4) == 0xdeadbeef
```

### Notes

- An empty or inverted range reverts at assertion time — on-chain
  slicing has no silent clamp (constant inverted ranges are rejected at
  build time).

### See Also

- `assertions:assert`, `@bytes.at!`, `@str.slice!`, `@slice!`
