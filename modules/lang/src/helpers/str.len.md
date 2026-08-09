---
title: "@lang:str.len"
---

Return the length of a string. As @str.len! the decoded byte length of the string return of a call, on-chain — there is no code-point walk at assertion time, so multi-byte UTF-8 characters count once per byte.

**Returns**: `number`

## Syntax

```evml
@lang:str.len(value)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `value` | `string` | Input value (in @str.len! a `::` call expression or chain returning a string) |

<!-- HAND-WRITTEN -->

## See Also

- [@str.slice](str.slice.md) — extract a substring
- [@len](len.md) — array length

## On-chain face (@str.len!)

The decoded byte length of the string/bytes return of a call, on-chain — UTF-8 characters may span multiple bytes.

### Examples

```evml
load assertions
load lang

set $gov 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1

# A uint256[] with 2 items is 64 + 2*32 = 128 bytes
assertions:assert @str.len!($gov::{tallies()(uint256[])}) == 128
```

### See Also

- `@len!`
