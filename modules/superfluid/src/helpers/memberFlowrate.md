---
title: "@superfluid:memberFlowrate"
---

The slice of the distribution flow of a GDA pool currently streaming to a member, in wei per second. As @memberFlowrate! the getMemberFlowRate() read happens on-chain at assertion time (the pool still resolves at composition time).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@superfluid:memberFlowrate(pool member)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `pool` | `address` | GDA pool address |
| `member` | `address` | Pool member |

## Examples

```evml
# The slice of a streaming distribution a member currently receives
load sim

sim:fork --using anvil (
  sim:set-balance @me 20000e18
  superfluid:wrap 10000e18 into xDAIx
  superfluid:create-pool $pool xDAIx
  superfluid:set-units 1 to 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71 in $pool
  superfluid:distribute-flow 1000e18/mo xDAIx to $pool
  sim:expect @bool(@superfluid:memberFlowrate($pool 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71) > 0)
)
```

<!-- HAND-WRITTEN -->

## See Also

## On-chain face (@memberFlowrate!)

Read getMemberFlowRate(member) at assertion time (the pool still
resolves at composition time, since it is the call target).

#
