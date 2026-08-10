---
title: "@lang:bytes.len"
---

Byte length of a bytes value (a UTF-8 character may span several bytes).

**Returns**: `number`

## Syntax

```evml
@lang:bytes.len(value)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `bytes` | Source bytes or string value |

<!-- HAND-WRITTEN -->

## See Also

- [@len](len.md) — array length
- [@str.len](str.len.md) — string length

## On-chain face (@bytes.len!)

The decoded byte length of the string/bytes return of a call, on-chain — UTF-8 characters may span multiple bytes.

### Examples

```evml
load assertions
load lang

set $gov 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1

# A uint256[] with 2 items is 64 + 2*32 = 128 bytes
assertions:assert @bytes.len!($gov::{tallies()(uint256[])}) == 128
```

### See Also

- `@len!`
