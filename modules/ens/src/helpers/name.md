---
title: "@ens:name"
---

Reverse-resolve an address to its primary ENS name.

**On-chain (`@ens:name!`)**: Mainnet only; reads the reverse record of a constant address without the forward check, and an address with no record reads as an empty string.

**Returns**: `string`

## Syntax

```evml
@ens:name(address)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `address` | `address` | Address to resolve |

## Examples

```evml
# Reverse-resolve an address to an ENS name
set $name @ens:name(0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045)
print $name
```

<!-- HAND-WRITTEN -->

## On-chain face (@ens:name!)

Mainnet only, and the address must be a composition-time constant: the
reverse node is a namehash over the address's hex label, and there is no
on-chain path from a live address word to it. The face reads the reverse
registrar's `name()` record through the `@addr!`-shaped resolver chain,
with two declared divergences from the plain face: an address with no
reverse record reads as the empty string instead of erroring, and the
plain face's forward check — that the returned name resolves back to the
address — is skipped, so a stale or hostile reverse record reads as
whatever string it holds. Pair it with `@ens:addr!` when the forward
direction matters: `@ens:addr!(@ens:name(x)) == x` at composition time,
or assert both reads separately.

## See Also

- [@ens:avatar](avatar.md) — get the avatar URI
- [@ens:text](text.md) — read a text record
