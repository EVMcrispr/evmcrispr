---
title: "@aragonos:aragonEns"
---

Resolve an Aragon ENS name to its address.

**Returns**: `address`

## Syntax

```evml
@aragonos:aragonEns(ensName, extra?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `ensName` | `string` | ENS name to resolve to an address |
| `[extra]` | `any` | Additional ENS path segment |

## Examples

```evml
# Resolve an Aragon ENS name
set $addr @aragonEns("test.aragonid.eth")
print $addr
```

<!-- HAND-WRITTEN -->

## See Also

- [@app](app.md) — resolve app addresses within a DAO
- [@ens](../../../std/src/helpers/ens.md) — resolve general ENS names
