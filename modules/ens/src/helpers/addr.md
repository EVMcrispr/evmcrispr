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

Resolve the name at assertion time through the Universal Resolver, as
every ENS client does: `resolve(dnsName, addr(node))`, with the name encoded
at composition time. It reads ENSv2 names and ENS v1 names alike; a name with
no resolver, or one only an off-chain gateway answers, reads as the zero
address instead of reverting.

#
