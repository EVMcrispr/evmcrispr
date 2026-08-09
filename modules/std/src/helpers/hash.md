---
title: "@hash"
---

Compute the hash of a string with keccak256 (default) or sha256. As @hash! the keccak256 of the decoded string/bytes return of a call, computed on-chain — compare long strings or blobs against a precomputed digest of the payload bytes.

**Returns**: `bytes32`

## Syntax

```evml
@hash(text algorithm?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `text` | `string` | String to hash (e.g. a function signature); in @hash! a `::` call expression (or chain) returning a string or bytes value |
| `[algorithm]` | `string` | `keccak256` (default) or `sha256` |

## Examples

```evml
# Compute a function selector
set $sel @hash("transfer(address,uint256)")

# Hash with sha256 instead of keccak256
set $digest @hash("an example" sha256)
```

<!-- HAND-WRITTEN -->

## See Also

- [@namehash](../../../ens/src/helpers/namehash.md) — ENS namehash
- [@abi.encodeCall](abi.encodeCall.md) — encode a full function call

## On-chain face (@hash!)

keccak256 of the decoded string/bytes return of a call, computed on-chain — compare long strings or blobs against a precomputed digest of the payload bytes.

#
