---
title: "@ens:addr"
---

Resolve an ENS name to an address, optionally per coin type.

**On-chain (`@ens:addr!`)**: Mainnet only, and a name with no resolver set reads as the zero address instead of reverting.

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
