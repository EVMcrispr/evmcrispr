---
title: "@lang:str.join"
---

Join array elements into a string with a delimiter.

**On-chain (`@lang:str.join!`)**: Array elements must be strings or bytes; literal arrays support up to four live parts. The delimiter may be constant or live.

**Returns**: `string`

## Syntax

```evml
@lang:str.join(arr delim)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `arr` | `array` | Source array |
| `delim` | `string` | Delimiter string |

<!-- HAND-WRITTEN -->

## See Also

- [@str.split](str.split.md) — split a string into an array
- [@str.concat](str.concat.md) — concatenate strings

## On-chain face (@str.join!)

Join a string/bytes array with a constant or live delimiter. Runtime arrays may
come from contract calls or typed collection helpers. Literal arrays may contain
up to four live parts. Elements are not implicitly converted from numbers.

The delimiter appears only between elements. Empty arrays produce an empty
string, singleton arrays contain no delimiter, and empty elements are preserved.
The contract sizes and allocates the result once before copying each part.

```evml
load lang
set $reg 0x44fA8E6f47987339850636F88629646662444217
assert @str.join!($reg::{names()(string[])} $reg::{separator()(string)}) == "a,b"
```

Literal arrays with constant delimiters retain compilation-time merging of
constant runs. Dynamic argument composition retains the SDK's existing
four-live-value limit per layout.
