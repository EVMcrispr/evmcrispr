---
title: "@ens:ens.addr"
---

Resolve an ENS name to an address, optionally per coin type.

**Returns**: `address`

## Syntax

```evml
@ens:ens.addr(name coinType?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | ENS name (e.g. vitalik.eth) |
| `[coinType]` | `number` | ENSIP-9/11 coin type (defaults to 60, ETH) |

## Examples

```evml
# Resolve a name to an address
set $addr @ens.addr("vitalik.eth")
print $addr
```

<!-- HAND-WRITTEN -->

## See Also
