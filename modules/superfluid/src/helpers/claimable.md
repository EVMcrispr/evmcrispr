---
title: "@superfluid:claimable"
---

Amount a member can claim from a GDA pool right now (accrued earnings not yet reflected in their balance).

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@superfluid:claimable(pool member)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `pool` | `address` | GDA pool address |
| `member` | `address` | Pool member |

## Examples

```evml
# Earnings a disconnected member can claim after an instant distribution
load sim

sim:fork --using anvil (
  sim:set-balance @me 2000e18
  superfluid:wrap 1000e18 into xDAIx
  superfluid:create-pool $pool xDAIx
  superfluid:set-units 1 to 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71 in $pool
  superfluid:distribute 400e18 xDAIx to $pool
  sim:expect @bool(@superfluid:claimable($pool 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71) == 400e18)
)
```

<!-- HAND-WRITTEN -->

## See Also

## On-chain face (@claimable!)

Read getClaimableNow(member) at assertion time and pick the claimable
balance (word 0). Earnings accrue against the timestamp of the block
that executes the batch, not the one it was built against.

#
