---
title: "@assertions:hash!"
---

keccak256 of the decoded string/bytes return of a call, computed on-chain — compare long strings or blobs against a precomputed digest of the payload bytes.

**Returns**: `bytes32`

## Syntax

```evml
@assertions:hash!(call)
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

# Pin a struct/array/long-string return by its keccak256
assertions:assert @hash!($gov::{config()(uint256,uint256,address)}) == 0x0102030405060708091011121314151617181920212223242526272829303132
```

## See Also

- [assertions:assert](../commands/assert.md), [@assertions:codehash](codehash.md)
