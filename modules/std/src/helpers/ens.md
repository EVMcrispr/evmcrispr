---
title: "@ens"
---

Resolve an ENS name to its address.

**Returns**: `address`

## Syntax

```evml
@ens(name)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | ENS name (e.g. `vitalik.eth`) |

## Examples

```evml
# Resolve an ENS name to its address
set $addr @ens("vitalik.eth")
```

<!-- HAND-WRITTEN -->

## See Also

- [@namehash](namehash.md) — compute ENS namehash
- [@token](token.md) — resolve token addresses
