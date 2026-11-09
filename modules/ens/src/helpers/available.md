---
title: "@ens:available"
---

Check whether a .eth name is available for registration (ENSv2's ETHRegistrar, which counts names still on ENS v1 as taken).

**On-chain (`@ens:available!`)**: Mainnet only: an assertion reads the chain it runs on, and ENS cannot be reached from another chain.

**Returns**: `bool`

## Syntax

```evml
@ens:available(name)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | .eth name or label (e.g. vitalik.eth or vitalik) |

## Examples

```evml
# Check availability before registering
set $free @ens:available("mydao.eth")
print $free
```

<!-- HAND-WRITTEN -->

## See Also

## On-chain face (@ens:available!)

Mainnet only. An assertion is judged on the chain it runs on, and there is no
way to reach the ENS registry from another chain, so the on-chain face refuses
at composition time rather than staticcalling an address with no code and
reverting opaquely later.

Sepolia is refused too, deliberately. The plain face resolves against mainnet
through a dedicated client, so a sepolia registry would answer about a
DIFFERENT namespace: `@ens:available` and `@ens:available!` would return two unrelated
answers and both would look right. Off mainnet, use the plain face — it
resolves at composition time and is not restricted by the executing chain.

### Notes

- Asks ENSv2's ETHRegistrar (`isAvailable`), so it reflects the registrar's
  own rules (length, reservations) rather than only whether the name is
  registered. A name still on ENS v1, migrated or not, counts as taken.
