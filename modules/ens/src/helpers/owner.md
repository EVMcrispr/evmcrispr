---
title: "@ens:owner"
---

Owner of an ENS name (the real owner when the name is wrapped).

**On-chain (`@ens:owner!`)**: Mainnet only, since an assertion reads the chain it runs on, and an unowned name reads as the zero address rather than an error.

**Returns**: `address`

## Syntax

```evml
@ens:owner(name)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | ENS name (e.g. vitalik.eth) |

## Examples

```evml
# Get the owner of a name
set $owner @ens:owner("vitalik.eth")
print $owner
```

<!-- HAND-WRITTEN -->

## See Also

## On-chain face (@ens:owner!)

Mainnet only. An assertion is judged on the chain it runs on, and there is no
way to reach the ENS registry from another chain, so the on-chain face refuses
at composition time rather than staticcalling an address with no code and
reverting opaquely later.

Sepolia is refused too, deliberately. The plain face resolves against mainnet
through a dedicated client, so a sepolia registry would answer about a
DIFFERENT namespace: `@ens:owner` and `@ens:owner!` would return two unrelated
answers and both would look right. Off mainnet, use the plain face — it
resolves at composition time and is not restricted by the executing chain.

### Notes

- Reads the registry word, so a name nobody owns is the zero address rather
  than an error. The plain face throws instead.
