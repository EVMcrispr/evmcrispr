---
title: "@superfluid:connected"
---

Whether a member is connected to a GDA pool (connected members see pool earnings in their balance automatically).

**Returns**: `bool`

## Syntax

```evml
@superfluid:connected(pool member)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `pool` | `address` | GDA pool address |
| `member` | `address` | Pool member |

## Examples

```evml
# Check pool membership before and after connecting
load sim

sim:fork --using anvil (
  sim:set-balance @me 100e18
  superfluid:create-pool $pool xDAIx
  sim:expect @bool(@superfluid:connected($pool @me) == false)
  superfluid:connect-pool $pool
  sim:expect @superfluid:connected($pool @me)
)
```

<!-- HAND-WRITTEN -->

## See Also
