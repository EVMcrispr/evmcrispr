---
title: "@ens:expiry"
---

Registration expiry timestamp of a .eth name.

**On-chain (`@ens:expiry!`)**: Mainnet only, since an assertion reads the chain it runs on, and an unregistered name reads as 0 rather than erroring.

**Returns**: `number`

## Syntax

```evml
@ens:expiry(name)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | .eth second-level name (e.g. vitalik.eth) |

## Examples

```evml
# Check when a name expires
set $expiry @ens:expiry("vitalik.eth")
print $expiry
```

<!-- HAND-WRITTEN -->

## See Also

## On-chain face (@ens:expiry!)

Mainnet only. An assertion is judged on the chain it runs on, and there is no
way to reach the ENS registry from another chain, so the on-chain face refuses
at composition time rather than staticcalling an address with no code and
reverting opaquely later.

Sepolia is refused too, deliberately. The plain face resolves against mainnet
through a dedicated client, so a sepolia registry would answer about a
DIFFERENT namespace: `@ens:expiry` and `@ens:expiry!` would return two unrelated
answers and both would look right. Off mainnet, use the plain face — it
resolves at composition time and is not restricted by the executing chain.

### Notes

- An unregistered name reads as `0`. The plain face throws instead.
