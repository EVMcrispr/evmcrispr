---
title: "@ens:resolver"
---

Resolver contract address of an ENS name.

**On-chain (`@ens:resolver!`)**: Mainnet only, since an assertion reads the chain it runs on, and a name with no resolver reads as the zero address.

**Returns**: `address`

## Syntax

```evml
@ens:resolver(name)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | ENS name (e.g. vitalik.eth) |

## Examples

```evml
# Get the resolver of a name
set $resolver @ens:resolver("vitalik.eth")
print $resolver
```

<!-- HAND-WRITTEN -->

## See Also

## On-chain face (@ens:resolver!)

Mainnet only. An assertion is judged on the chain it runs on, and there is no
way to reach the ENS registry from another chain, so the on-chain face refuses
at composition time rather than staticcalling an address with no code and
reverting opaquely later.

Sepolia is refused too, deliberately. The plain face resolves against mainnet
through a dedicated client, so a sepolia registry would answer about a
DIFFERENT namespace: `@ens:resolver` and `@ens:resolver!` would return two unrelated
answers and both would look right. Off mainnet, use the plain face — it
resolves at composition time and is not restricted by the executing chain.

### Notes

- A name with no resolver set reads as the zero address. The plain face throws
  instead.
