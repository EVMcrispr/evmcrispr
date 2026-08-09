---
title: "@ens:addr"
---

Resolve an ENS name to an address, optionally per coin type. As @addr! the resolution happens on-chain at assertion time: cond on an unset resolver returns the zero word, else the registry.resolver(node) -> addr(node) chain resolves the name (the namehash still computes at composition time).

**Returns**: `address`

## Syntax

```evml
@ens:addr(name coinType?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | ENS name (e.g. vitalik.eth) |
| `[coinType]` | `number` | ENSIP-9/11 coin type (defaults to 60, ETH) |

## Examples

```evml
# Resolve a name to an address
set $addr @ens:addr("vitalik.eth")
print $addr
```

<!-- HAND-WRITTEN -->

## See Also

## On-chain face (@addr!)

Resolve the name at assertion time: the namehash computes at
composition time, then `cond(eq(registry.resolver(node), 0), 0,
chain(resolver(node), addr(node)))` — an unset resolver resolves to the
zero address instead of reverting.

#
