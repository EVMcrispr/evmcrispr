---
title: "@gelato:tasks"
---

Ids of the active Gelato Automate tasks an account created, oldest first.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

**Returns**: `array`

## Syntax

```evml
@gelato:tasks(creator?)
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `[creator]` | `address` | Task creator (defaults to the connected account) |

## Examples

```evml
# Create two tasks in a fork and see them listed under your account
load sim
load lang

sim:fork --using anvil (
  sim:set-balance @me 100e18
  gelato:automate 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 rebalance() --every 1h
  gelato:automate 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 harvest() --cron "0 0 * * *"
  sim:expect @bool(@lang:len(@gelato:tasks()) == 2)
)
```

<!-- HAND-WRITTEN -->

## See Also
