---
title: "@assertions:bytelen!"
---

The raw byte length of the return data of a call, on-chain (a uint256[] with n items is 64 + n*32 bytes).

**Returns**: `number`

## Syntax

```evml
@assertions:bytelen!(call)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `call` | `address` | A `::` call expression (or chain) to measure |

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
