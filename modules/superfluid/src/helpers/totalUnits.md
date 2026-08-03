---
title: "@superfluid:totalUnits"
---

Total units across all members of a GDA pool.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `number`

## Syntax

```evml
@superfluid:totalUnits(pool)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `pool` | `address` | GDA pool address |

## Examples

```evml
# Total units across all members of a pool
load sim

sim:fork --using anvil (
  sim:set-balance @me 100e18
  superfluid:create-pool $pool xDAIx
  superfluid:set-units 3 to 0x8790B75cF2BD36a2502A24e0E16AA1B23eBeBC71 in $pool
  superfluid:set-units 1 to 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 in $pool
  sim:expect @bool(@superfluid:totalUnits($pool) == 4)
)
```

<!-- HAND-WRITTEN -->

## See Also
