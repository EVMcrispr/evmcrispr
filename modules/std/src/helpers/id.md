---
title: "@id"
---

Compute the keccak256 hash of a string (first 4 bytes for selectors).

**Returns**: `bytes32`

## Syntax

```evml
@id(text)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `text` | `string` | String to hash (e.g. a function signature) |

## Examples

```evml
# Compute a function selector
set $sel @id("transfer(address,uint256)")
```

<!-- HAND-WRITTEN -->

## See Also

- [@namehash](namehash.md) — ENS namehash
- [@abi.encodeCall](abi.encodeCall.md) — encode a full function call
