---
title: "@namehash"
---

Compute the ENS namehash of a domain name.

**Returns**: `bytes32`

## Syntax

```evml
@namehash(name)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | ENS domain name |

## Examples

```evml
# Hash an ENS domain
set $node @namehash("vitalik.eth")
```

<!-- HAND-WRITTEN -->

## See Also

- [@ens](ens.md) — resolve ENS name to address
- [@id](id.md) — keccak256 hash
