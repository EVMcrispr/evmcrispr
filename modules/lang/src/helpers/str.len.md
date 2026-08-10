---
title: "@lang:str.len"
---

Length of a string.

**On-chain (`@lang:str.len!`)**: Counts bytes, so a multi-byte UTF-8 character counts more than once.

**Returns**: `number`

## Syntax

```evml
@lang:str.len(value)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `string` | Source string |

<!-- HAND-WRITTEN -->

## See Also

- [@str.slice](str.slice.md) — extract a substring
- [@len](len.md) — array length

## On-chain face (@str.len!)

The decoded byte length of the string/bytes return of a call, on-chain — UTF-8 characters may span multiple bytes.

### Examples

```evml
load lang

set $gov 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1

# A uint256[] with 2 items is 64 + 2*32 = 128 bytes
assert @str.len!($gov::{tallies()(uint256[])}) == 128
```

### See Also

- `@len!`
