---
title: "@lang:bytes.at"
---

Access a single byte by index in a bytes value. As @bytes.at! a one-byte slice of the bytes/string return of a call, on-chain — negative indexes resolve against the live byte length at assertion time.

**Returns**: `bytes`

## Syntax

```evml
@lang:bytes.at(value index)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `bytes` | Input value (in @bytes.at! a `::` call expression or chain returning a bytes or string value) |
| `index` | `number` | Zero-based byte index (negative counts from the end) |

<!-- HAND-WRITTEN -->

## See Also

- [@bytes.slice](bytes.slice.md) — extract a byte range
- [@at](at.md) — array element access

## On-chain face (@bytes.at!)

A one-byte slice of the bytes/string return of a call: the @str.at!
recipe with the Bytes category. A negative index compiles to
`sub(byteLen(s), k)` so it resolves against the live byte length at
assertion time.

### Examples

```evml
load assertions
load lang

set $oracle 0x44fA8E6f47987339850636F88629646662444217

# The version byte leads the blob
assertions:assert @bytes.at!($oracle::{blob()(bytes)} 0) == 0x01

# The checksum byte trails it, resolved against the live length
assertions:assert @bytes.at!($oracle::{blob()(bytes)} -1) == 0xff
```

### Notes

- An out-of-range index reverts at assertion time (SliceOutOfBounds) —
  on-chain slicing has no silent clamp.

### See Also

- `assertions:assert`, `@bytes.slice!`, `@str.at!`
