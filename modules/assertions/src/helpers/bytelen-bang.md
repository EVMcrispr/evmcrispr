---
title: "@assertions:bytelen!"
---

The decoded byte length of the string/bytes return of a call, on-chain — UTF-8 characters may span multiple bytes.

**Returns**: `number`

## Syntax

```evml
@assertions:bytelen!(call)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `call` | `address` | A `::` call expression (or chain) returning a string or bytes value |

<!-- HAND-WRITTEN -->

## Examples

```evml
load assertions

set $gov 0xc0dbDcA66a0636236fAbe1B3C16B1bD4C84bB1E1

# A uint256[] with 2 items is 64 + 2*32 = 128 bytes
assertions:assert @bytelen!($gov::{tallies()(uint256[])}) == 128
```

## See Also

- [@assertions:len!](len-bang.md)
