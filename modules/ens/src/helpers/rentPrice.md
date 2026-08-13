---
title: "@ens:rentPrice"
---

Total price in wei to register or renew a .eth name for a duration.

**On-chain (`@ens:rentPrice!`)**: Mainnet only: an assertion reads the chain it runs on, and ENS cannot be reached from another chain.

**Returns**: `number`

## Syntax

```evml
@ens:rentPrice(name duration)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `name` | `string` | .eth name or label (e.g. vitalik.eth or vitalik) |
| `duration` | `number` | Duration, in time units (e.g. 1y) |

## Examples

```evml
# Price of one year of registration
set $price @ens:rentPrice("mydao.eth" 1y)
print $price
```

<!-- HAND-WRITTEN -->

## On-chain face (@ens:rentPrice!)

Mainnet only. One `rentPrice(label, duration)` staticcall on the
ETHRegistrarController; the returned Price struct is two inline words,
each read with a core `pick` over the same call, summed with one `add`.
The controller read appears twice in the operand tree (a tree cannot
name a subterm), which costs one duplicated cheap view call at judgement
and keeps the composition flat. The premium half decays block by block
after an expiry, which is exactly what an on-chain read is for.

## See Also
