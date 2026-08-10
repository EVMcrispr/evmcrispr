---
title: "@lang:str.at"
---

Access a character by index in a string.

**On-chain (`@lang:str.at!`)**: Selects one byte, so a multi-byte UTF-8 character is not returned whole.

**Returns**: `string`

## Syntax

```evml
@lang:str.at(value index)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `string` | Source string |
| `index` | `number` | Zero-based character index (negative counts from the end) |

<!-- HAND-WRITTEN -->

## See Also

- [@str.slice](str.slice.md) — extract a substring
- [@at](at.md) — array element access

## On-chain face (@str.at!)

Select a single byte of the string return of a call as a one-byte slice,
on-chain. A negative index resolves against the live byte length
(`-1` is the last byte).

### Examples

```evml
load lang

set $pool 0x44fA8E6f47987339850636F88629646662444217

assert @str.at!($pool::{symbol()(string)} 0) == "W"
assert @str.at!($pool::{symbol()(string)} -1) == "H"
```

### Notes

- Byte semantics: for ASCII strings this is the character at the index;
  a multi-byte UTF-8 character yields one of its bytes.
- An out-of-range index reverts with SliceOutOfBounds at assertion time.

### See Also

- `assert`, `@str.slice!`
