---
title: "@superfluid:units"
---

A member's share units in a GDA pool.

**Returns**: `number`

## Syntax

```evml
@superfluid:units(pool member)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `pool` | `address` | GDA pool address |
| `member` | `address` | Pool member |

## Examples

```evml
# Check a member's units after setting them
load sim

sim:fork --using anvil (
  sim:set-balance @me 100e18
  superfluid:create-pool $pool xDAIx
  superfluid:set-units 5 to 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71 in $pool
  sim:expect @bool(@superfluid:units($pool 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71) == 5)
)
```

<!-- HAND-WRITTEN -->

## See Also
