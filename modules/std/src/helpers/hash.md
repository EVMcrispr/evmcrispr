---
title: "@hash"
---

Compute the hash of a string with keccak256 (default) or sha256.

**Returns**: `bytes32`

## Syntax

```evml
@hash(text algorithm?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `text` | `string` | String to hash (e.g. a function signature) |
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
