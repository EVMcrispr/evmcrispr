---
title: "@ens:namehash"
---

Compute the ENS namehash of a domain name.

**Returns**: `bytes32`

## Syntax

```evml
@ens:namehash(name)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | ENS domain name |

## Examples

```evml
# Hash an ENS domain
set $node @ens:namehash("vitalik.eth")
```

<!-- HAND-WRITTEN -->

## See Also
