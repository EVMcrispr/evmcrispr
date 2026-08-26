---
title: "gelato:cancel"
---

Cancel a Gelato Automate task you created. Find task ids with @gelato:tasks or @gelato:lastTask.

⚗️ **Experimental** — available at [next.evmcrispr.com](https://next.evmcrispr.com).

## Syntax

```evml
gelato:cancel <taskId>
```

## Arguments

| Name | Type | Description |
|------|------|-------------|
| `taskId` | `bytes32` | Task id to cancel |

## Examples

```evml
# Create a task and cancel it again, in a fork
load sim

sim:fork --using anvil (
  sim:set-balance @me 100e18
  gelato:automate 0x4F2083f5fBede34C2714aFfb3105539775f7FE64 rebalance() --every 1h
  gelato:cancel @gelato:lastTask()
)
```

<!-- HAND-WRITTEN -->

## See Also
